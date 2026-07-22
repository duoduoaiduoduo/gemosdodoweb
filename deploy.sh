#!/usr/bin/env bash
set -Eeuo pipefail

# Keep only the latest N backups.
KEEP_BACKUPS=3

cd "$(dirname "$0")"

prune_keep_latest() {
  local pattern="$1"
  local keep="$2"

  mapfile -t items < <(
    find . -maxdepth 1 -mindepth 1 -name "$pattern" -printf "%T@ %P\n" 2>/dev/null \
      | sort -nr \
      | awk '{ $1=""; sub(/^ /, ""); print }'
  )

  local total="${#items[@]}"
  if (( total <= keep )); then
    return
  fi

  for ((i=keep; i<total; i++)); do
    rm -rf -- "${items[$i]}"
  done
}

echo "== [1/5] Backing up data.json and uploads =="
ts="$(date +%F-%H%M%S)"

if [[ -f data.json ]]; then
  cp -a data.json "data.json.bak.${ts}"
fi

if [[ -d uploads ]]; then
  cp -a uploads "uploads.bak.${ts}"
fi

prune_keep_latest "data.json.bak.*" "${KEEP_BACKUPS}"
prune_keep_latest "uploads.bak.*" "${KEEP_BACKUPS}"

echo "== [2/5] Pulling latest code from Gitee =="
git pull origin master

echo "== [3/5] Installing dependencies =="
npm install

echo "== [4/5] Building frontend =="
npm run build

echo "== [5/5] Restarting Node service =="
# 服务名已从 zip-site 更名为 gemosdodoweb-site。
# 若该进程尚不存在（首次改名后），自动用 server.js 新建，避免部署中断。
pm2 restart gemosdodoweb-site || pm2 start server.js --name gemosdodoweb-site

echo "== Done. Backups pruned (keep latest ${KEEP_BACKUPS}) =="
