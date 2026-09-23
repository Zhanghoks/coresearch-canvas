# shellcheck shell=bash
# 所有运维脚本共用的路径约定。宿主机是容器：/ 会随实例重建丢失，只有 /root/data 持久，
# 所以运行时、pm2 状态、数据、密钥全部放在 CORESEARCH_HOME 下，不依赖 /usr/local 或 /var/lib。

CORESEARCH_HOME="${CORESEARCH_HOME:-/root/data/zmj/coresearch}"
BUNDLE_REPO="${BUNDLE_REPO:-ghcr.io/zhanghoks/coresearch-agent-api-bundle}"
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
