#!/usr/bin/env bash
# PM2: pm2 start autodeploy.sh --name gemosdodoweb-autodeploy --interpreter bash
set -uo pipefail
cd "$(dirname "$0")"
INTERVAL="${INTERVAL:-45}"
log() { echo "[$(date +'%F %T')] $*"; }
log "autodeploy started; interval=${INTERVAL}s; success marker=.deploy-state/deployed-commit"
while true; do
  # deploy.sh owns the shared kernel lock, bounded fetch and success checks.
  # Do not use repository HEAD as proof that the build was published.
  bash ./deploy.sh --if-needed
  result=$?
  if (( result == 75 )); then
    log "Another deployment holds the lock; retrying next cycle."
  elif (( result != 0 )); then
    log "Deployment failed (exit ${result}); retrying in ${INTERVAL}s. See preceding error."
  fi
  [[ "${AUTODEPLOY_ONCE:-0}" == 1 ]] && exit "$result"
  sleep "$INTERVAL"
done
