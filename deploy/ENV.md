# 环境变量唯一对照表

配置分散在 `web/.env.example`、`agent-api/.env.example`、`agent-api/.env.production.example`、
`deploy/production/production.env.example`、`deploy/vercel.env.example` 五个模板文件里，
各自只是所在系统的"填写样例"。**核对配置齐不齐全，只看这一个文件**，不用五个文件来回翻。

三类物理隔离的系统，任何一个变量只能属于其中一个，不能合并：

- **Vercel Dashboard**：前端构建期变量，值会被编译进 JS，不能放密钥。
- **GitHub Actions Secrets / Variables**：只用来让 CI "登得上服务器"，不持有业务密钥。
- **服务器 `/srv/coresearch/env/production.env`**：唯一的生产密钥存放处，不进 Git、不进镜像。

## Vercel Dashboard（Project Settings → Environment Variables）

| 变量名 | 用途 | 缺失/错误时的现象 |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL，前端用来发起登录/Auth 请求 | 前端一直停在本地免登录模式，不会要求登录；或登录请求报网络错误 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase 前端公钥 | 同上；或 Supabase 请求返回 401 |
| `VITE_AGENT_API_URL` | 服务器 `agent-api` 的公网地址（如 `https://api.coresearch.xxx.com`） | Agent 面板能登录但一直转圈/报网络错误，看不到消息流 |

来源：`deploy/vercel.env.example`。三个变量任一为空，`web/src/services/api/supabase.ts` 的
`hostedAgentConfigured` 就是 `false`，前端整体退回"本地模式"（见下方"预期行为"）。

## GitHub Actions（Repo Settings → Secrets and variables → Actions）

| 名称 | 类型 | 用途 | 缺失/错误时的现象 |
|---|---|---|---|
| `SERVER_HOST` | Secret | 部署时 SSH 目标 | `deploy-production.yml` 的 deploy job 直接失败在"准备 SSH"步骤 |
| `SERVER_USER` | Secret | SSH 登录用户 | 同上 |
| `SERVER_SSH_KEY` | Secret | 部署专用私钥全文 | 同上，或 Permission denied |
| `SERVER_SSH_PORT` | Secret（可选） | 非 22 端口时才需要 | 端口非默认且未设置时连接超时 |
| `API_PUBLIC_URL` | Variable（必填） | 部署后公网 health 校验用 | 未设置会让部署在这一步直接失败（不再静默跳过） |
| `DEPLOY_PLATFORM` | Variable（可选） | 服务器非 amd64 时改成 `linux/arm64` | 架构不对会导致镜像启动失败 |

这些变量**只负责"CI 怎么登上服务器"**，不持有任何业务密钥（`SUPABASE_SECRET_KEY`、`PI_API_KEY`
等禁止出现在这里）。

## 服务器 `/srv/coresearch/env/production.env`

来源：`deploy/production/production.env.example`。`chmod 600`，永远不进 Git。

| 变量名 | 用途 | 缺失/错误时的现象 |
|---|---|---|
| `SUPABASE_URL` | 同 Vercel 那个，服务端用 | agent-api 启动即退出，日志报缺少环境变量 |
| `SUPABASE_PUBLISHABLE_KEY` | 服务端校验用 | 同上 |
| `SUPABASE_SECRET_KEY` | `service_role` 密钥，只能在这里 | 同上；如果误填到 Vercel 会导致密钥随前端 JS 泄露，必须立刻轮换 |
| `AGENT_API_ORIGINS` | CORS 白名单，逗号分隔精确 origin | 前端报 CORS 错误；新增 Vercel Preview 域名忘了追加也会报 CORS |
| `PI_PROVIDER` / `PI_MODEL` | 模型提供方/型号 | agent-api 启动即退出 |
| `PI_API_KEY` | 模型 Key，只放这里 | 同上；同样禁止出现在 Vercel 或 GitHub Secrets |
| `PI_AGENT_DIR` | Pi 会话数据目录，固定 `/var/lib/research-canvas/pi` | 写错会导致会话数据丢失或权限报错 |
| `PORT` | 固定 `4100`，要和 compose/健康检查一致 | 改了但没同步改 compose 会导致 health check 失败 |
| `ENABLE_BUILTIN_TEST_ACCOUNT` | **生产禁止设置** | 设了之后每次容器启动都会把内置 `test` 账号密码重置回固定弱密码 `12345678`；自动化部署下这会每次部署都发生一次，安全风险 |

## 部署来源：这张表核对完之后，还要确认"代码本身是不是最新的"

**配置齐全 ≠ 线上代码是最新的。** 如果 Vercel Production 是手工 `vercel deploy` 或者
"预构建 `dist` 直传"产生的，它可以在配置完全正确的情况下依然跑着一个很旧的 commit ——
这种情况下再怎么核对上面的变量表都没用，因为问题根本不在配置。

核对方法：Vercel Dashboard → Deployments，看当前 Production 那一行的 **Source**：

- 显示一个 Git commit（可点进去看到 commit message、SHA）→ 正常，来自 `git push`。
- 显示 CLI / Upload，没有关联 commit → 这就是"第二份源码真相源"，参见
  `deploy/production/README.md` 顶部的硬规则，直接触发一次新的 Git 部署替换掉它。

服务器侧同理，用 `curl https://api.coresearch.xxx.com/health` 返回的 `version` 字段对照
`git rev-parse main`，两者不一致说明服务器也没跑上最新代码。

## 预期行为，不是 bug

排查"线上和本地不一样"之前，先排除这两条——它们是设计如此，不是配置错误：

1. **本地开发默认免登录，线上配了 `VITE_SUPABASE_*` 之后会强制登录 + 邀请码门禁。**
   这是两套完全不同的 UI 流程（本地 Agent vs 托管 Agent），不是样式/功能坏了。
2. **画布节点内容权威存储是浏览器 IndexedDB（经 localforage），不是 localStorage，也不是纯本地。**
   `web/src/lib/canvas/canvas-browser-persistence.ts:5` 用
   `localforage.createInstance({ name: "infinite-canvas", storeName: "canvas_workspace_v1" })`
   持久化画布节点/连接；localStorage 只存了一个 user id
   （`web/src/lib/canvas/workspace-user.ts:10`），本身不装画布数据。
   托管模式下画布快照**会**异步发布到 Supabase 兜底：
   `use-hosted-agent-project.ts:90` 调 `publishCanvas` PUT 到
   `/v1/projects/:id/canvas/state`，服务端 `saveCanvasState` 写入
   `canvas_workspaces.snapshot`；打开项目时也会反向拉取（同文件 `readCanvas` 那段 effect）
   做修订号比对合并。但 IndexedDB 才是权威来源、Supabase 只是异步快照，不是实时双向同步——
   本地开发环境和线上生产环境是两个不同的浏览器 origin，IndexedDB 天然不共享，看到
   "项目/画布内容对不上"本身不代表数据丢失或后端出错，但如果怀疑数据没同步，应该去查
   Supabase 的 `canvas_workspaces.snapshot`，而不是以为"反正不存服务端，不用查了"。
