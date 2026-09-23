# shellcheck shell=bash
# 所有运维脚本共用的路径约定。宿主机是容器：/ 会随实例重建丢失，只有 /root/data 持久，
# 所以运行时、pm2 状态、数据、密钥全部放在 CORESEARCH_HOME 下，不依赖 /usr/local 或 /var/lib。

CORESEARCH_HOME="${CORESEARCH_HOME:-/root/data/zmj/coresearch}"
BUNDLE_REPO="${BUNDLE_REPO:-ghcr.io/zhanghoks/coresearch-agent-api-bundle}"
SOURCE_REPO="${SOURCE_REPO:-Zhanghoks/coresearch-canvas}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/health}"

export CORESEARCH_HOME BUNDLE_REPO HEALTH_URL
export PM2_HOME="$CORESEARCH_HOME/pm2"
export PATH="$CORESEARCH_HOME/runtime/node/bin:$CORESEARCH_HOME/bin:$PATH"

STATE_DIR="$CORESEARCH_HOME/state"
RELEASES_DIR="$CORESEARCH_HOME/releases"
CURRENT_LINK="$CORESEARCH_HOME/current"

log() { printf '[%s %s] %s\n' "${LOG_TAG:-coresearch}" "$(date -u +%FT%TZ)" "$*"; }

current_version() { cat "$CURRENT_LINK/VERSION" 2>/dev/null || echo none; }

health_version() {
    curl --fail --silent --max-time 5 "$HEALTH_URL" 2>/dev/null |
        node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"")}catch{}})'
}

# 从 GHCR 下载 bundle 层到 $2。不用 oras pull：它在连接卡死时不会超时，一次能挂几十分钟。
# curl 在 30s 内低于 20KB/s 就断开，按 Range 断点续传重试，最后校验 sha256。包是公开的，匿名 token 即可。
fetch_bundle() {
    local tag="$1" out="$2" repo="${BUNDLE_REPO#ghcr.io/}" token manifest digest size attempt
    token="$(curl -fsS -m 20 "https://ghcr.io/token?scope=repository:$repo:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')" || return 1
    manifest="$(curl -fsS -m 30 -H "Authorization: Bearer $token" -H "Accept: application/vnd.oci.image.manifest.v1+json" "https://ghcr.io/v2/$repo/manifests/$tag")" || return 1
    digest="$(printf '%s' "$manifest" | grep -o '"layers":\[{[^]]*' | grep -o '"digest":"sha256:[0-9a-f]*"' | head -1 | cut -d'"' -f4)"
    size="$(printf '%s' "$manifest" | grep -o '"layers":\[{[^]]*' | grep -o '"size":[0-9]*' | head -1 | cut -d: -f2)"
    [ -n "$digest" ] || { log "manifest 里没有 bundle 层"; return 1; }
    local deadline=$(( $(date +%s) + ${FETCH_BUDGET:-90} ))
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
        [ "$(date +%s)" -lt "$deadline" ] || { log "GHCR 下载 ${FETCH_BUDGET:-90}s 内未完成"; rm -f "$out"; return 1; }
        # token 有效期只有几分钟，每次续传前重新取。
        [ "$attempt" = 1 ] || token="$(curl -fsS -m 20 "https://ghcr.io/token?scope=repository:$repo:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')" || true
        # 慢而不断的连接不会触发 speed-limit，用剩余预算做硬上限。
        curl -fsSL --connect-timeout 20 --speed-limit 20000 --speed-time 30 --max-time $(( deadline - $(date +%s) + 1 )) -C - \
            -H "Authorization: Bearer $token" -o "$out" "https://ghcr.io/v2/$repo/blobs/$digest" && break
        log "下载中断（第 $attempt 次，已下载 $(stat -c %s "$out" 2>/dev/null || echo 0)/$size 字节），续传"
        sleep 3
    done
    [ "$(sha256sum "$out" | cut -d' ' -f1)" = "${digest#sha256:}" ] || { log "bundle sha256 校验失败"; rm -f "$out"; return 1; }
}

# GHCR 的 blob 下载节点（pkg-containers.githubusercontent.com）从这台机器经常只有几 KB/s，
# 而 codeload.github.com 与 registry.npmjs.org 通常 1MB/s 以上：取该 commit 的源码，用与 CI 相同的
# build-bundle.sh 在本机构建。产物同样带 VERSION，deploy.sh 照常校验。
build_bundle_from_source() {
    local tag="$1" out="$2" rev="${1#sha-}" src
    src="$(mktemp -d "$CORESEARCH_HOME/tmp-src-XXXXXX")"
    log "从源码构建 $rev"
    if curl -fsSL --retry 5 --connect-timeout 20 --speed-limit 20000 --speed-time 30 \
            "https://codeload.github.com/$SOURCE_REPO/tar.gz/$rev" | tar -xz -C "$src" --strip-components=1 &&
        (cd "$src" && GIT_SHA="$rev" bash deploy/huabei/build-bundle.sh "$out"); then
        rm -rf "$src"
        return 0
    fi
    rm -rf "$src"
    return 1
}
