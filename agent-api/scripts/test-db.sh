#!/usr/bin/env bash
#
# 在本地 Supabase（supabase start）上跑依赖真实 Postgres 的测试：store 契约 + RLS 隔离。
# 先在仓库根目录执行 `supabase start`。CI 里由 .github/workflows/agent-api-db.yml 做同样的事。

set -euo pipefail
cd "$(dirname "$0")/.."

status="$(supabase status -o env --workdir .. 2>/dev/null)" || { echo "本地 Supabase 没有运行：先在仓库根目录执行 supabase start" >&2; exit 1; }
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }

export SUPABASE_TEST_URL="$(value API_URL)"
export SUPABASE_TEST_PUBLISHABLE_KEY="$(value ANON_KEY)"
export SUPABASE_TEST_SECRET_KEY="$(value SERVICE_ROLE_KEY)"

exec npx tsx --test src/store.contract.test.ts src/rls.integration.test.ts
