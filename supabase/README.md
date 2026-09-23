# Migration 规则

## 现状

数据库结构以本目录为唯一来源，布局遵循 Supabase CLI（`supabase/config.toml` + `supabase/migrations/<version>_<name>.sql`）。

push 到 `main` 时，`deploy-production.yml` 的 `migrate` job 会先于后端发布执行：

```
supabase db push --dry-run   # 列出待执行的 migration，写进 Actions summary
supabase db push             # 按版本号顺序执行，并记入 supabase_migrations.schema_migrations
```

执行记录在远端 `supabase_migrations.schema_migrations` 表里，已执行的版本不会再跑。

`migrate` job 受 GitHub Variable `SUPABASE_MIGRATIONS_ENABLED` 控制：不是 `true` 时 job 会打一条 warning 并跳过（不静默，Actions 页面可见）。

## 与生产库的对齐状态

本目录的 12 个文件与生产库 `supabase_migrations.schema_migrations` 中的 12 条记录**版本号一一对应、内容一致**
（去掉注释和空白后逐条比对 md5，2026-09-23 核对）。因此不需要 `migration repair`，开启 CI 后第一次
`db push --dry-run` 应显示没有待执行的 migration。

- 版本号就是生产库里记录的执行时间，所以文件顺序和最初的 `001`–`008` 编号不同（例如 `sessions` 在 `artifacts_and_assets` 之前）。这是生产库真实的执行顺序，不要改名。
- 前 4 个（`init`、`rls`、`rls_role_and_policy_fix`、`drop_empty_draft_schema`）是早期草案 schema，建出来之后又被整体删除。保留它们是为了让本地与生产历史完全一致。`drop_empty_draft_schema` 没有删掉枚举类型 `research_entity_kind` 和角色 `coresearch_app`，它们仍留在生产库里，当前代码不使用。

开启步骤：

1. GitHub → Settings → Environments → `production` → 添加 Secret `SUPABASE_DB_URL`（Dashboard → Connect → Session pooler 连接串，密码 percent-encode）。
2. 本地先确认一次：`supabase db push --dry-run --db-url "$SUPABASE_DB_URL"` 应显示没有待执行的 migration。
3. 添加 Repository Variable `SUPABASE_MIGRATIONS_ENABLED=true`。

## 执行顺序

migration 必须**先于**依赖它的代码上线。CI 已经保证了这一点：`migrate` 成功之后才会构建和发布后端。

反过来说，migration 失败会阻断这次发布，后端保持旧版本。

## 只允许向前兼容的加法

一次发布里可以做：

- 新建表
- 新增列，且**必须可空或带默认值**
- 新建索引（生产上优先 `create index concurrently`）
- 新增 RLS policy、新增 grant

一次发布里**不可以**做：

- `drop column` / `drop table`
- 重命名列或表
- 给已有列加 `not null` 而不带默认值
- 收紧 check 约束到会让存量行失败的程度
- 删除或收紧仍被线上代码依赖的 policy / grant

原因很直接：部署过程中一定存在"新 schema + 旧代码"同时存在的窗口（进程重启、回滚）。任何让旧代码立刻失效的 migration，都会把回滚这条退路一起堵死。回滚只回退后端代码，**不回退数据库**。

## 破坏性变更走三次发布

要删一个列或改一个列的语义，拆成三次独立发布：

1. **expand** — 加新列（可空），双写。旧列保持不动，旧代码照常工作。
2. **migrate** — 回填存量数据，把读路径切到新列。此时新旧代码都能跑。
3. **contract** — 确认没有任何代码再读旧列之后，才删掉它。

每一步之间至少隔一次完整部署并观察，不要在同一个 PR 里做完。

## 新增 migration 的写法

- 用 `supabase migration new <描述>` 生成文件，版本号是时间戳，不要手写或复用。
- 新建对象一律加 `if not exists`，policy 用 `drop policy if exists ... ; create policy ...`，让重复执行至少不报错。
- 新表必须 `enable row level security` 并显式写 policy。本项目所有用户数据表都靠 RLS 做租户隔离，漏掉等于对所有登录用户开放。
- 改完之后跑一次真实 RLS 验收（**不要指向生产项目**，它会创建和删除测试用户）：

  ```bash
  cd agent-api
  RUN_SUPABASE_RLS_TESTS=1 npm test
  ```
