# Migration 规则

## 现状（先读这一段）

这些 SQL **由人手工在 Supabase SQL Editor 里按文件名顺序执行**。

- 没有 Supabase CLI，没有 `config.toml`，CLI 也没有 link 到任何项目。
- 没有 `schema_migrations` 跟踪表，数据库里查不到"哪些已经跑过"。
- 大部分 `create table` / `create policy` **没有** `if not exists`，**重复执行会直接报错**。

因此自动部署流水线 **不会** 执行 migration。CI 只会在 PR 里检测到新增 migration 文件时打一条提醒。

## 执行顺序

migration 必须**先于**依赖它的代码上线：

```
在 Supabase SQL Editor 执行新 migration
        ↓
合并 PR 到 main
        ↓
CI → 构建镜像 → 部署
```

反过来做，新代码上线瞬间就会因为表/列不存在而报错。

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

原因很直接：部署过程中一定存在"新 schema + 旧代码"同时存在的窗口（镜像拉取、容器重启、回滚）。任何让旧代码立刻失效的 migration，都会把回滚这条退路一起堵死。

## 破坏性变更走三次发布

要删一个列或改一个列的语义，拆成三次独立发布：

1. **expand** — 加新列（可空），双写。旧列保持不动，旧代码照常工作。
2. **migrate** — 回填存量数据，把读路径切到新列。此时新旧代码都能跑。
3. **contract** — 确认没有任何代码再读旧列之后，才删掉它。

每一步之间至少隔一次完整部署并观察，不要在同一个 PR 里做完。

## 新增 migration 的写法

- 文件名 `NNN_描述.sql`，序号接着现有最大的往下排，不要复用或插空。
- 新建对象一律加 `if not exists`，policy 用 `drop policy if exists ... ; create policy ...`，让重复执行至少不报错。
- 新表必须 `enable row level security` 并显式写 policy。本项目所有用户数据表都靠 RLS 做租户隔离，漏掉等于对所有登录用户开放。
- 改完之后跑一次真实 RLS 验收（**不要指向生产项目**，它会创建和删除测试用户）：

  ```bash
  cd agent-api
  RUN_SUPABASE_RLS_TESTS=1 npm test
  ```

## 已知待办

建一张 `schema_migrations` 跟踪表并把 `001`–`008` 回填标记，是接入 Supabase CLI 自动化的前提。目前没做，所以"这个库跑到第几号了"只能靠人记。
