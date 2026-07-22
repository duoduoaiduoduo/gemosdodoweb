#!/usr/bin/env bash
#
# autodeploy.sh — 服务器端的"轮询自动部署"守护进程。
# 由 pm2 常驻运行：每隔 INTERVAL 秒去 GitHub 拉一次 origin/main 的引用，
# 一旦发现本地 main 落后于远端，就自动执行 deploy.sh（备份/构建/重启）。
#
# 启动（在服务器网页控制台执行一次）：
#   cd /www/wwwroot/gemosdodoweb
#   pm2 start autodeploy.sh --name gemosdodoweb-autodeploy --interpreter bash
#   pm2 save
#
# 这样本地只要 `npm run deploy`（git push），服务器约 60 秒内自动更新，无需再登服务器。
#
set -uo pipefail

cd "$(dirname "$0")"

INTERVAL=45          # 轮询间隔（秒）
BRANCH="main"
LOCK=".autodeploy.lock"

log() { echo "[$(date +'%F %T')] $*"; }

log "autodeploy 已启动，每 ${INTERVAL}s 检查一次 GitHub(${BRANCH})…"

while true; do
  # 用临时凭据配置拉取引用，避免公开仓库触发 credential helper 卡住
  GIT_TERMINAL_PROMPT=0 git -c credential.helper= fetch origin "${BRANCH}" >/dev/null 2>&1

  LOCAL=$(git rev-parse "HEAD" 2>/dev/null || echo "")
  REMOTE=$(git rev-parse "origin/${BRANCH}" 2>/dev/null || echo "")

  if [[ -n "$LOCAL" && -n "$REMOTE" && "$LOCAL" != "$REMOTE" ]]; then
    # 用目录锁避免与手动 deploy.sh 并发
    if mkdir "$LOCK" 2>/dev/null; then
      log "检测到新提交 ${REMOTE:0:8}，开始自动部署…"
      if bash ./deploy.sh; then
        log "自动部署完成。"
      else
        log "⚠️  deploy.sh 执行失败，请登录服务器检查。"
      fi
      rmdir "$LOCK" 2>/dev/null
    else
      log "deploy.sh 正在被其他方式执行，跳过本次。"
    fi
  fi

  sleep "$INTERVAL"
done
