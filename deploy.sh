#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd -P)"
log() { echo "[$(date +'%F %T')] $*"; }
for tool in flock timeout git npm node pm2 curl; do
  command -v "$tool" >/dev/null || { log "Missing required command: $tool"; exit 1; }
done
# Shared by manual and PM2 deployments. Kernel releases this lock on exit/crash.
# Never unlink this file: doing so would allow two different inodes to be locked.
exec 9>.deploy.lock
flock -n 9 || exit 75
# The old directory lock may still belong to the previous daemon. Do not remove
# it automatically: inspect processes and retire the old daemon on the server.
if [[ -e .autodeploy.lock ]]; then
  log 'Legacy .autodeploy.lock exists; inspect active deployment processes before removing it.'
  exit 1
fi
STATE="$ROOT/.deploy-state"
mkdir -p "$STATE"
chmod 700 "$STATE"
trap 'result=$?; log "Deployment failed (exit $result, line $LINENO). Success marker unchanged."; exit "$result"' ERR

log 'Fetching origin/main (120 second timeout)…'
GIT_TERMINAL_PROMPT=0 timeout -k 10 120 git -c credential.helper= -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch origin main
TARGET="$(git rev-parse origin/main)"
DEPLOYED="$(cat "$STATE/deployed-commit" 2>/dev/null || true)"
LIVE="$(node -e 'try {console.log(JSON.parse(require("fs").readFileSync("dist/deployment.json","utf8")).commit)} catch {}')"
if [[ "${1:-}" == --if-needed && "$DEPLOYED" == "$TARGET" && "$LIVE" == "$TARGET" ]]; then
  exit 0
fi
[[ "$(git branch --show-current)" == main ]] || { log 'Refusing to deploy a checkout outside main.'; exit 1; }
# Refuse to overwrite server edits. Ignored runtime data is untouched.
git diff --quiet && git diff --cached --quiet || { log 'Tracked server files have changes; inspect and preserve them before deploying.'; exit 1; }
if git ls-tree -r --name-only "$TARGET" | grep -v '^\.env\.example$' | grep -E '^(uploads/|data\.json$|visitor_stats\.json$|tucao-room\.json$|vibecoding-projects\.runtime\.json$|\.env($|\.))' >/dev/null; then
  log 'Refusing a revision that tracks runtime data or server environment files.'
  exit 1
fi
# Catch a wrong PM2 working directory before touching the running deployment.
pm2 jlist > "$STATE/processes.json"
node - "$ROOT" "$STATE/processes.json" <<'JS'
const fs=require('fs');
const [root,file]=process.argv.slice(2);
const site=JSON.parse(fs.readFileSync(file,'utf8')).find(p=>p.name==='gemosdodoweb-site');
if (!site || fs.realpathSync(site.pm2_env.pm_cwd)!==root || fs.realpathSync(site.pm2_env.pm_exec_path)!==root+'/server.js') {
  console.error('Existing gemosdodoweb-site path does not match this repository; inspect PM2 before deployment.');
  process.exit(1);
}
JS
# Do not replicate or prune uploads on every code release. This deployment never
# modifies uploads. Keep all existing upload backups and server configuration.
# Small runtime JSON snapshots are private and are never copied into dist.
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
mkdir "$STATE/data-$STAMP"
for file in data.json visitor_stats.json tucao-room.json vibecoding-projects.json vibecoding-projects.runtime.json; do
  [[ ! -f "$file" ]] || cp -p "$file" "$STATE/data-$STAMP/"
done
AVAILABLE="$(df -Pk . | awk 'END {print $4}')"
# Conservative preflight for dependencies and a separate build; retain live dist.
if (( AVAILABLE < 1048576 )); then
  log 'Less than 1 GiB available. Deployment stopped without deleting data or backups.'
  exit 1
fi
log "Fast-forwarding to $TARGET (no reset, no stash, no forced overwrite)…"
git merge --ff-only "$TARGET"
[[ "$(git rev-parse HEAD)" == "$TARGET" ]] || { log 'Checkout is ahead of origin/main; refusing to publish unexpected code.'; exit 1; }
log 'Installing locked dependencies (10 minute timeout)…'
timeout -k 15 600 npm ci --no-audit --no-fund
STAGE="$STATE/dist-stage-$STAMP"
log 'Building separately from the live dist (10 minute timeout)…'
timeout -k 15 600 npm run build -- --outDir "$STAGE"
[[ -s "$STAGE/index.html" ]] || { log 'Build did not produce index.html.'; exit 1; }
# Static experiment assets must match the source, not merely the application shell.
for relative in index.html browser-inference/ui.js tide.js; do
  cmp "public/vibecoding-projects/still-memory-box/$relative" "$STAGE/vibecoding-projects/still-memory-box/$relative"
done
node scripts/precompress-static.mjs "$STAGE"
node - "$STAGE/deployment.json" "$TARGET" <<'JS'
require('fs').writeFileSync(process.argv[2],JSON.stringify({commit:process.argv[3],builtAt:new Date().toISOString()})+'\n');
JS
PREVIOUS="$STATE/dist-previous-$STAMP"
[[ ! -e dist ]] || mv dist "$PREVIOUS"
if ! mv "$STAGE" dist; then
  [[ ! -e "$PREVIOUS" ]] || mv "$PREVIOUS" dist
  log 'Could not activate new dist; restored previous dist.'
  exit 1
fi
log 'Restarting existing gemosdodoweb-site…'
if ! timeout -k 10 60 pm2 restart gemosdodoweb-site; then
  log 'PM2 restart failed; retaining both dist versions and leaving success marker unchanged for retry.'
  exit 1
fi
# Verify the process actually serves this build before recording success.
HEALTHY=0
for attempt in {1..15}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3001/deployment.json -o "$STATE/served.json" && node - "$STATE/served.json" "$TARGET" <<'JS'
try {process.exit(JSON.parse(require('fs').readFileSync(process.argv[2],'utf8')).commit===process.argv[3]?0:1)} catch {process.exit(1)}
JS
  then HEALTHY=1; break; fi
  sleep 2
done
[[ "$HEALTHY" == 1 ]] || { log 'Local site did not serve expected deployment marker; success not recorded.'; exit 1; }
printf '%s\n' "$TARGET" > "$STATE/deployed-commit.tmp"
mv "$STATE/deployed-commit.tmp" "$STATE/deployed-commit"
log "Deployment verified locally: $TARGET. Previous dist retained at $PREVIOUS. Verify public HTTPS resources separately."
# Keep three completed rollback builds. Failure here must not invalidate the
# healthy deployment or its success marker; runtime data and uploads are ignored.
if ! node scripts/prune-builds.mjs --root "$STATE"; then
  log 'Warning: build history cleanup failed. Deployment remains verified; inspect retained build history separately.'
fi
