#!/usr/bin/env bash
#
# 实例重启后恢复所有进程。宿主机没有 systemd，pm2 无法开机自启，重启后 SSH 进来执行一次：
#
#   /root/data/zmj/coresearch/bin/start.sh
#
# pm2 状态在持久盘上（PM2_HOME），所以这里优先 resurrect 上次保存的进程表。

set -euo pipefail
LOG_TAG=start
# shellcheck source=env.sh
source "$(dirname "$(readlink -f "$0")")/env.sh"

[ -e "$CURRENT_LINK" ] || { log "还没有任何已部署版本，先执行 bin/deploy.sh sha-<commit>"; exit 1; }

if pm2 ping >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q '"name":"agent-api"'; then
    log "pm2 已在运行"
else
    pm2 resurrect >/dev/null 2>&1 || true
fi
# 无论 resurrect 是否成功都按 ecosystem 补齐（例如新加了 cloudflared 配置）。
pm2 startOrReload "$CORESEARCH_HOME/bin/ecosystem.config.cjs" --update-env >/dev/null
pm2 save --force >/dev/null
pm2 status
