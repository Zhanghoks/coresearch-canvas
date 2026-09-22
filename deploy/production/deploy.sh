#!/usr/bin/env bash
#
# CoResearch 生产部署。由 GitHub Actions 经 SSH 调用，也可在服务器上手动执行（回滚时）。
#
#   IMAGE_TAG=sha-abc1234 /srv/coresearch/app/deploy.sh
#
# 不做 git pull、不做 docker build：镜像已经由 CI 构建并推到 GHCR，这里只负责拉取和切换。
# 回滚就是换一个 IMAGE_TAG 重跑，旧镜像层留在本地，秒级完成。

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/coresearch/app}"
ENV_FILE="${ENV_FILE:-/srv/coresearch/env/production.env}"
IMAGE_TAG="${IMAGE_TAG:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"

export IMAGE_TAG

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

fail() {
    log "部署失败：$*"
    log "---- agent-api 最近日志 ----"
    docker compose -f "$APP_DIR/docker-compose.yml" logs --tail=200 agent-api 2>&1 || true
    exit 1
}

[ -f "$APP_DIR/docker-compose.yml" ] || fail "找不到 $APP_DIR/docker-compose.yml"
[ -f "$ENV_FILE" ] || fail "找不到环境变量文件 $ENV_FILE（生产密钥只存在于服务器上，不来自 Git）"

cd "$APP_DIR"

log "目标镜像 tag：$IMAGE_TAG"

# 记录当前运行的镜像，便于失败后人工定位应该回滚到哪一个。
PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' coresearch-agent-api 2>/dev/null || echo '(none)')"
log "当前运行镜像：$PREVIOUS_IMAGE"

# 不指定服务名，这样 COMPOSE_PROFILES=app 时备用前端镜像也会一起拉。
log "拉取镜像"
docker compose pull || fail "docker compose pull 失败"

log "启动容器"
docker compose up -d --remove-orphans || fail "docker compose up 失败"

log "等待 /health 通过（最多 ${HEALTH_TIMEOUT}s）"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while :; do
    if body="$(curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
        log "health 通过：$body"
        break
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
        fail "health check 在 ${HEALTH_TIMEOUT}s 内没有通过（上一个可用镜像：$PREVIOUS_IMAGE）"
    fi
    sleep 3
done

# 不做 docker image prune：旧镜像层留在本地，回滚时不需要重新从 GHCR 拉取。
log "部署完成"
