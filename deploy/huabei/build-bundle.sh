#!/usr/bin/env bash
#
# 构建 agent-api 运行包：dist + 生产依赖 + 运维脚本 + VERSION。
# 依赖里有按平台区分的原生模块，必须在 linux-x64 上构建（CI 的 ubuntu-latest，或本地 linux 容器）。
#
#   GIT_SHA=<commit> deploy/huabei/build-bundle.sh <输出 tar.gz 路径>

set -euo pipefail

out="${1:?用法: build-bundle.sh <out.tar.gz>}"
: "${GIT_SHA:?需要 GIT_SHA}"
root="$(cd "$(dirname "$0")/../.." && pwd)"

[ "$(uname -s)-$(uname -m)" = "Linux-x86_64" ] || { echo "必须在 Linux x86_64 上构建" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp "$root/agent-api/package.json" "$root/agent-api/package-lock.json" "$root/agent-api/tsconfig.json" "$work/"
cp -r "$root/agent-api/src" "$work/src"
(cd "$work" && npm ci --no-fund --no-audit && npm run build && npm prune --omit=dev --no-fund --no-audit)

# 确认生产依赖（npm prune 之后）仍能加载 Pi SDK，坏包在 CI 就失败，不留到服务器上。
(cd "$work" && node --input-type=module -e 'await import("@earendil-works/pi-coding-agent"); await import("@earendil-works/pi-ai/compat"); console.log("runtime deps load ok")')

stage="$work/bundle"
mkdir -p "$stage"
cp -r "$work/dist" "$work/node_modules" "$work/package.json" "$stage/"
cp -r "$root/deploy/huabei/ops" "$stage/ops"
printf '%s\n' "$GIT_SHA" > "$stage/VERSION"
cp "$root/VERSION" "$stage/APP_VERSION"

tar -czf "$out" -C "$stage" .
echo "bundle: $out ($(du -h "$out" | cut -f1))"
