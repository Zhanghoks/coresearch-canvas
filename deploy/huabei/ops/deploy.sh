#!/usr/bin/env bash
#
# 把 agent-api 切到指定版本。由 updater.sh 自动调用，也可以手动执行（回滚）：
#
#   deploy.sh sha-<commit>          # 切到该版本
#   deploy.sh sha-<commit> --pin    # 切过去并钉住，updater 不再自动跟随 main
#
# 只做：从 GHCR 拉 bundle → 解包到 releases/ → 切 current 软链 → pm2 重载 → /health 断言 version。
# 失败时切回上一个版本。不 git pull、不构建。

set -euo pipefail
LOG_TAG=deploy
# shellcheck source=env.sh
source "$(dirname "$(readlink -f "$0")")/env.sh"

tag="${1:-}"
pin="${2:-}"
case "$tag" in
    sha-*) ;;
    *) echo "用法: deploy.sh sha-<commit> [--pin]" >&2; exit 2 ;;
esac
rev="${tag#sha-}"
release="$RELEASES_DIR/$tag"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"

mkdir -p "$STATE_DIR" "$RELEASES_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || { log "另一个部署正在进行，退出"; exit 1; }

reload_agent_api() {
    pm2 startOrReload "$CORESEARCH_HOME/bin/ecosystem.config.cjs" --only agent-api --update-env >/dev/null
}

wait_health() {
    local want="$1" deadline got=""
    deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        got="$(health_version || true)"
        [ "$got" = "$want" ] && return 0
        sleep 3
    done
    log "health 在 ${HEALTH_TIMEOUT}s 内没有返回 version=$want（最后一次: ${got:-无响应}）"
    return 1
}

if [ ! -f "$release/VERSION" ]; then
    log "拉取 $BUNDLE_REPO:$tag"
    tmp="$(mktemp -d "$RELEASES_DIR/.tmp-XXXXXX")"
    trap 'rm -rf "$tmp"' EXIT
    # 下载失败时不切版本、不记 failed，交给 updater 下一轮重试（这台机器访问 GHCR 的速度波动很大）。
    (cd "$tmp" && oras pull --no-tty "$BUNDLE_REPO:$tag" >/dev/null) || { log "拉取 $tag 失败，未切换版本，稍后重试"; exit 1; }
    mkdir "$tmp/unpacked"
    tar -xzf "$tmp/agent-api.tar.gz" -C "$tmp/unpacked"
    mv "$tmp/unpacked" "$release"
fi

[ "$(cat "$release/VERSION")" = "$rev" ] || { log "bundle 内 VERSION 与 $tag 不一致，拒绝部署"; exit 1; }

previous="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"
log "当前: ${previous:-无}  →  目标: $release"

ln -sfn "$release" "$CURRENT_LINK.next"
mv -T "$CURRENT_LINK.next" "$CURRENT_LINK"

# 运维脚本随 bundle 发布，服务器上没有 git。install 会生成新 inode，正在执行的脚本不受影响；
# updater.sh 检测到自身文件变化后会自己 exec 新版本。
install -m 755 "$release/ops/"*.sh "$CORESEARCH_HOME/bin/"
install -m 644 "$release/ops/ecosystem.config.cjs" "$CORESEARCH_HOME/bin/"

reload_agent_api
if wait_health "$rev"; then
    log "部署完成：$rev"
    touch "$release"
    rm -f "$STATE_DIR/failed-$rev"
else
    touch "$STATE_DIR/failed-$rev"
    pm2 logs agent-api --lines 60 --nostream 2>&1 | tail -60 || true
    if [ -n "$previous" ] && [ "$previous" != "$release" ]; then
        log "回退到 $previous"
        ln -sfn "$previous" "$CURRENT_LINK.next"
        mv -T "$CURRENT_LINK.next" "$CURRENT_LINK"
        install -m 755 "$previous/ops/"*.sh "$CORESEARCH_HOME/bin/"
        install -m 644 "$previous/ops/ecosystem.config.cjs" "$CORESEARCH_HOME/bin/"
        reload_agent_api
        wait_health "$(cat "$previous/VERSION")" || log "回退后 health 仍未通过，需要人工处理"
    fi
    exit 1
fi

if [ "$pin" = "--pin" ]; then
    echo "$tag" > "$STATE_DIR/PINNED"
    log "已钉住 $tag；删除 $STATE_DIR/PINNED 恢复自动跟随 main"
fi

pm2 save --force >/dev/null

# 保留最近 5 个版本（按最近一次成功部署时间），current 永远保留。
keep=5
ls -1dt "$RELEASES_DIR"/sha-* 2>/dev/null | tail -n +$((keep + 1)) | while read -r old; do
    [ "$old" = "$(readlink "$CURRENT_LINK")" ] || rm -rf "$old"
done
