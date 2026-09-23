#!/usr/bin/env bash
#
# 首次初始化（或实例被重建、持久盘还在时的修复）。在服务器上执行：
#
#   curl -fsSL https://raw.githubusercontent.com/Zhanghoks/coresearch-canvas/main/deploy/huabei/install.sh | bash
#
# 幂等：已存在的运行时/工具不会重复下载。执行前必须已经放好 secrets/agent-api.env。
# 版本号在这里固定，升级时改这里并提交，不要在服务器上手动换二进制。

set -euo pipefail

CORESEARCH_HOME="${CORESEARCH_HOME:-/root/data/zmj/coresearch}"
BUNDLE_REPO="${BUNDLE_REPO:-ghcr.io/zhanghoks/coresearch-agent-api-bundle}"
NODE_VERSION=22.19.0
PM2_VERSION=7.0.4
ORAS_VERSION=1.3.4
CLOUDFLARED_VERSION=2026.9.1

log() { printf '[install] %s\n' "$*"; }

# 这台机器访问 github.com 时好时坏：先完整下载到临时文件（带重试）再解包，避免管道里半截数据。
download() {
    curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors --connect-timeout 30 -o "$2" "$1"
}
dl="$(mktemp -d)"
trap 'rm -rf "$dl"' EXIT

mkdir -p "$CORESEARCH_HOME"/{runtime,bin,releases,state,data/pi,secrets/cloudflared,pm2}
# /root/data 是多租户共享存储（777），本目录里有密钥，只允许 root 访问。
chmod 700 "$CORESEARCH_HOME"
chmod 700 "$CORESEARCH_HOME/secrets"

if [ ! -f "$CORESEARCH_HOME/secrets/agent-api.env" ]; then
    log "缺少 $CORESEARCH_HOME/secrets/agent-api.env，变量清单见仓库 deploy/ENV.md。放好后重新执行。"
    exit 1
fi
chmod 600 "$CORESEARCH_HOME/secrets/agent-api.env"

node_dir="$CORESEARCH_HOME/runtime/node-v$NODE_VERSION-linux-x64"
if [ ! -x "$node_dir/bin/node" ]; then
    log "安装 Node $NODE_VERSION"
    download "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" "$dl/node.tar.xz"
    tar -xJf "$dl/node.tar.xz" -C "$CORESEARCH_HOME/runtime"
fi
ln -sfn "$node_dir" "$CORESEARCH_HOME/runtime/node"
export PATH="$CORESEARCH_HOME/runtime/node/bin:$CORESEARCH_HOME/bin:$PATH"
export PM2_HOME="$CORESEARCH_HOME/pm2"

if [ "$(pm2 --version 2>/dev/null || true)" != "$PM2_VERSION" ]; then
    log "安装 pm2 $PM2_VERSION"
    npm install -g --no-fund --no-audit "pm2@$PM2_VERSION" >/dev/null
fi

if [ "$("$CORESEARCH_HOME/bin/oras" version 2>/dev/null | awk '/^Version:/{print $2}')" != "$ORAS_VERSION" ]; then
    log "安装 oras $ORAS_VERSION"
    download "https://github.com/oras-project/oras/releases/download/v$ORAS_VERSION/oras_${ORAS_VERSION}_linux_amd64.tar.gz" "$dl/oras.tar.gz"
    tar -xzf "$dl/oras.tar.gz" -C "$CORESEARCH_HOME/bin" oras
fi

if ! "$CORESEARCH_HOME/bin/cloudflared" --version 2>/dev/null | grep -q "$CLOUDFLARED_VERSION"; then
    log "安装 cloudflared $CLOUDFLARED_VERSION"
    # Tunnel 不影响 agent-api 本身启动：下载失败只告警，重跑 install.sh 会补装。
    if download "https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED_VERSION/cloudflared-linux-amd64" "$dl/cloudflared"; then
        install -m 755 "$dl/cloudflared" "$CORESEARCH_HOME/bin/cloudflared"
    else
        log "警告：cloudflared 下载失败，稍后重新执行 install.sh 补装"
    fi
fi

# 运维脚本随 bundle 发布：先拉一次目标版本（默认 :main），取出 ops/ 装到 bin/，再用它正式部署。
ref="${1:-main}"
tmp="$dl/bundle"
mkdir -p "$tmp"
(cd "$tmp" && "$CORESEARCH_HOME/bin/oras" pull --no-tty "$BUNDLE_REPO:$ref" >/dev/null)
tar -xzf "$tmp/agent-api.tar.gz" -C "$tmp" ./ops ./VERSION
install -m 755 "$tmp/ops/"*.sh "$CORESEARCH_HOME/bin/"
install -m 644 "$tmp/ops/ecosystem.config.cjs" "$CORESEARCH_HOME/bin/"
tag="sha-$(cat "$tmp/VERSION")"

log "部署 $tag"
"$CORESEARCH_HOME/bin/deploy.sh" "$tag"
"$CORESEARCH_HOME/bin/start.sh"
log "完成。实例重启后执行 $CORESEARCH_HOME/bin/start.sh"
