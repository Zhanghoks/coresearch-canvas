#!/usr/bin/env bash
#
# 常驻（由 pm2 管理）：定期查看 GHCR 上 bundle 的 :main 指向哪个 commit，和当前运行的不同就部署。
# 服务器主动拉取，而不是 CI 通过 SSH 推送：这台机器的入站 SSH 走中转，经常断线；出站访问 GHCR 稳定。
#
# 暂停自动更新：state/PINNED 存在（deploy.sh --pin 会写入）。
# 某个版本部署失败会写 state/failed-<sha>，之后不再重试它，直到 main 指向新的 commit。

set -uo pipefail
LOG_TAG=updater
self="$(readlink -f "$0")"
# shellcheck source=env.sh
source "$(dirname "$self")/env.sh"

INTERVAL="${UPDATE_INTERVAL:-60}"
self_mtime="$(stat -c %Y "$self")"

resolve_main() {
    oras manifest fetch "$BUNDLE_REPO:main" 2>/dev/null |
        node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).annotations["org.opencontainers.image.revision"]||"")}catch{}})'
}

log "启动，间隔 ${INTERVAL}s，仓库 $BUNDLE_REPO"
while :; do
    # deploy.sh 可能随新 bundle 更新了本脚本，换成新版本继续跑。
    if [ "$(stat -c %Y "$self" 2>/dev/null || echo "$self_mtime")" != "$self_mtime" ]; then
        log "检测到 updater.sh 已更新，重新加载"
        exec "$self"
    fi

    if [ -f "$STATE_DIR/PINNED" ]; then
        sleep "$INTERVAL"; continue
    fi

    target="$(resolve_main)"
    if [ -z "$target" ]; then
        log "无法解析 $BUNDLE_REPO:main（网络或仓库不可达），稍后重试"
    elif [ "$target" != "$(current_version)" ] && [ ! -f "$STATE_DIR/failed-$target" ]; then
        log "发现新版本 $target（当前 $(current_version)）"
        "$CORESEARCH_HOME/bin/deploy.sh" "sha-$target" || log "部署 $target 失败，已回退；不再自动重试该版本"
    fi
    sleep "$INTERVAL"
done
