#!/usr/bin/env bash
# Copy research skills from the authoritative canvas-agent source into this
# Codex plugin tree. Plugin-only skills (canvas, open-canvas) are left alone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="$ROOT/canvas-agent/skills"
DST="$ROOT/plugins/infinite-canvas/skills"

SHARED=(
  approach
  direction
  evaluation
  hypothesis
  idea
  method
  problem
  research-flow
  research-question
  research-workspace
  seed
)

for name in "${SHARED[@]}"; do
  src="$SRC/$name"
  dst="$DST/$name"
  if [[ ! -e "$src" ]]; then
    echo "missing source: $src" >&2
    exit 1
  fi
  rm -rf "$dst"
  if [[ -d "$src" ]]; then
    mkdir -p "$dst"
    cp -R "$src"/. "$dst"/
  else
    cp "$src" "$dst"
  fi
  echo "synced $name"
done

echo "done: research skills copied from canvas-agent/skills → plugins/infinite-canvas/skills"
