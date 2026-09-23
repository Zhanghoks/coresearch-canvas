# CoResearch 生产部署

> **硬规则：Production 只允许来自 GitHub 的 Git 部署。**
> 禁止 `vercel deploy` / `vercel --prebuilt` 手工上传，禁止在服务器上直接改 `dist` 或业务代码。
> 任何紧急修复都必须先在本地改完、commit、push，让 CI / Vercel 重新构建；SSH 上的临时改动
> 从一开始就不允许存在，不是"线上能跑了就先放着，之后再补进 Git"——只要服务器或 Vercel 上
> 存在一份 Git 里找不到的代码，就已经出现了第二份源码真相源，早晚会导致线上和本地"面目全非"。
> 环境变量核对表见 [`deploy/ENV.md`](../ENV.md)。

> **当前生产后端不走本文的 Docker Compose 方案。** 生产机是 ebcloud 容器实例（没有 dockerd/systemd），
> 用的是 [`deploy/huabei/`](../huabei/README.md)：CI 把运行包推到 GHCR，服务器 updater 自己拉取、pm2 运行，
> `deploy-production.yml` 已按那套流程改写。本文保留为"普通 Linux 主机"方案：换到能跑 Docker 的机器时，
> 按这里初始化，并用 `IMAGE_TAG=sha-<commit> deploy.sh` 手动发布（镜像由 `agent-api-docker-image.yml` 在打 tag 时构建）。
> 下文涉及 `SERVER_*` SSH Secret 和 CI 自动 SSH 部署的段落只适用于该方案。

20 人内测规模，单机 Docker Compose + Vercel + Supabase。

日常流程只有一条：

```bash
git push origin main
```

之后 Vercel 部署前端、GitHub Actions 部署后端，无需 SSH。

---

## 部署拓扑

```
GitHub main
   │
   ├─ Vercel（GitHub 集成）
   │     Root Directory = 仓库根（不是 web/，原因见下）
   │     └→ web/dist → https://coresearch.xxx.com
   │
   └─ .github/workflows/deploy-production.yml
         ci     → agent-api typecheck + test
         image  → ghcr.io/zhanghoks/coresearch-agent-api:sha-<commit> 和 :main
         deploy → scp docker-compose.yml + deploy.sh 到服务器
                  ssh 执行 deploy.sh（pull → up -d → 本机 /health）
         verify → 从公网 /health 再验一次，并断言 version == 本次 commit
                            │
                            ↓
                      Linux 单机
                      /srv/coresearch/app  ← compose + deploy.sh（每次部署覆盖）
                      /srv/coresearch/env  ← production.env（只在服务器上）
                      /srv/coresearch/data ← 持久数据
                            │
                      docker compose
                        ├── agent-api（Express + Pi SDK，单副本）
                        └── cloudflared（Tunnel → api.coresearch.xxx.com）
```

服务器上**没有源码、没有 git、不需要 Node、不构建镜像**。

**为什么镜像来自 GHCR 而不是服务器本地 build**：构建环境和产物可追溯到同一个 CI runner、同一个
commit，不依赖服务器当时装的是什么 Node/依赖版本；服务器因此不需要装构建工具链，攻击面更小；
回滚只是换一个已经推送过的 tag 重新 `pull`，不需要重新编译，秒级完成。

## 目录约定

```
/srv/coresearch/
  app/     docker-compose.yml, deploy.sh     由 CI 每次部署覆盖
  env/     production.env                    chmod 600，永不进 Git
  data/    pi/                               PI_AGENT_DIR，Pi 的 auth/models/sessions
           runtime/                          预留：codex 模式的 per-project workspace
  logs/    （只放手工 tar 备份归档，见 §6；容器日志走 docker compose logs，不会自动写文件到这里）
```

源码、用户运行数据、生产密钥三者物理分离。用户数据不在 Git 里，也不在容器文件系统里。

---

## 一、服务器首次初始化（一次性）

以下是**唯一**需要手工 SSH 的场合。

### 1. 建专用用户

```bash
sudo adduser --disabled-password --gecos "" coresearch
sudo usermod -aG docker coresearch
```

不要用 root。这个账号只需要能跑 Docker 和读写 `/srv/coresearch`。

### 2. 建目录

```bash
sudo mkdir -p /srv/coresearch/{app,env,data/pi,data/runtime,logs}
sudo chown -R coresearch:coresearch /srv/coresearch
sudo chmod 700 /srv/coresearch/env
```

### 3. 配置 deploy SSH key

在**本地**生成一把只用于部署的 key（不要复用个人 key）：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/coresearch_deploy -N "" -C "github-actions-deploy"
```

公钥装到服务器：

```bash
sudo -u coresearch mkdir -p /home/coresearch/.ssh
sudo -u coresearch tee -a /home/coresearch/.ssh/authorized_keys < ~/.ssh/coresearch_deploy.pub
sudo -u coresearch chmod 700 /home/coresearch/.ssh
sudo -u coresearch chmod 600 /home/coresearch/.ssh/authorized_keys
```

私钥 `~/.ssh/coresearch_deploy` 的**全部内容**填进 GitHub Secret `SERVER_SSH_KEY`。

### 4. 写生产环境变量

以 `production.env.example` 为模板：

```bash
sudo -u coresearch vim /srv/coresearch/env/production.env
sudo chmod 600 /srv/coresearch/env/production.env
```

> **先轮换 `PI_API_KEY`。** 仓库根目录的 `.env` 里有一把明文可用的 provider key，虽然没进 Git，但已经在本地磁盘上存在过。生产不要继续用它。

### 5. GHCR 拉取权限

镜像包如果是 private，服务器需要登录一次（token 只需 `read:packages`）：

```bash
sudo -u coresearch bash -c 'echo <GHCR_PAT> | docker login ghcr.io -u <github-user> --password-stdin'
```

把包设为 public 则可以跳过这一步。

### 6. Cloudflare Tunnel

在 Cloudflare Zero Trust 建一个 Tunnel，拿到 `<TUNNEL_ID>` 和凭据 JSON：

```bash
sudo mkdir -p /etc/cloudflared
sudo cp <TUNNEL_ID>.json /etc/cloudflared/
sudo cp deploy/cloudflared/config.yml /etc/cloudflared/config.yml
sudo vim /etc/cloudflared/config.yml    # 填真实 TUNNEL_ID 和域名
```

`config.yml` 里把 `api.coresearch.xxx.com` 指到 `http://127.0.0.1:4100`。主站域名走 Vercel，**不要**写进 ingress。

### 7. 执行数据库 migration

数据库结构由 CI 的 `migrate` job 通过 `supabase db push` 执行，开启方法见 `supabase/README.md`。

### 8. 触发首次部署

在 GitHub 上 push 一次 main，或手动跑 `Deploy production` workflow。

---

## 二、GitHub 配置

### Secrets

| 名称 | 值 |
|---|---|
| `SERVER_HOST` | 服务器 IP 或域名 |
| `SERVER_USER` | `coresearch` |
| `SERVER_SSH_KEY` | 第 3 步生成的私钥全文 |
| `SERVER_SSH_PORT` | 可选，非 22 时才需要 |

GHCR 用内置的 `GITHUB_TOKEN`，不需要额外 PAT。

### Variables

| 名称 | 值 | 作用 |
|---|---|---|
| `API_PUBLIC_URL` | `https://api.coresearch.xxx.com` | 公网 health 校验，**必填**；未设置会让部署在这一步直接失败，不再静默跳过 |
| `DEPLOY_PLATFORM` | 默认 `linux/amd64` | 服务器是 ARM 时改 `linux/arm64` |

**生产密钥（`SUPABASE_SECRET_KEY`、`PI_API_KEY` 等）不要放进 GitHub Secrets。** 它们只存在于服务器的 `production.env`。GitHub 只持有"怎么登录服务器"，不持有"服务器跑什么密钥"。

### Vercel

- **Root Directory 保持仓库根**，不要设成 `web`。`web/vite.config.ts` 会读根目录的 `VERSION`，并 alias `@research-headings` 到 `../canvas-agent/src/canvas/research-headings.ts`；Root Directory 设成 `web` 会让构建直接失败，除非勾选 *Include source files outside of the Root Directory*。
- Production Branch = `main`。feature branch / PR 自动产生 Preview Deployment。
- 环境变量（Production 和 Preview 各配一份，见 `deploy/vercel.env.example`）：
  `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_AGENT_API_URL`。
- 前端没有硬编码的 hosted API 地址：`web/src/constant/runtime-config.ts` 按 `window.__RUNTIME_CONFIG__` > 构建期 `VITE_*` > 空 的优先级取值。Vercel 上没有 `config.js`，所以走构建期变量。

**为什么不用 Vercel rewrite 代理 `/api/*`：** `GET /v1/projects/:id/conversations/:cid/events` 是长连 SSE，一次 Agent run 可能跑几分钟。经 Vercel rewrite 有超时和缓冲风险，会截断流式输出。所以前端直连 `api.` 子域，跨域由 `AGENT_API_ORIGINS` 的 CORS 白名单放行。

**Preview 域名要联调登录时**，把该 preview 的精确 origin 追加进服务器 `production.env` 的 `AGENT_API_ORIGINS` 并重新部署。`agent-api/src/app.ts` 做的是精确字符串匹配：不支持通配符、不能带空格、不能带路径或结尾斜杠。

---

## 三、日常部署

```bash
git add .
git commit -m "feat: xxx"
git push origin main
```

后端流水线只在这些路径变化时触发（改 README 不会重新部署服务器）：

```
agent-api/**
deploy/production/**
.github/workflows/deploy-production.yml
```

前端由 Vercel 独立触发，`vercel.json` 的 `ignoreCommand` 让纯后端改动不重新构建前端。

任一步失败就不会进入下一步：

```
typecheck 失败    → 不构建镜像、不部署
test 失败         → 不构建镜像、不部署
镜像构建失败      → 不部署，服务器保持旧版本运行
docker 启动失败   → deployment 失败
health check 失败 → deployment 失败
```

并发保护：workflow 的 `concurrency.group = coresearch-production`、`cancel-in-progress: false`。连续 push 会排队串行执行，不会有两个进程同时操作服务器；也不会把部署到一半的 job 取消掉。

---

## 四、回滚

镜像按 `sha-<commit>` 打 tag，`deploy.sh` 不做 `image prune`，旧镜像层留在服务器本地，回滚不需要重新拉取。

**方式一（推荐，不用 SSH）：** 在 GitHub Actions 里手动运行 `Deploy production`，`image_tag` 填 `sha-<上一个好的 commit sha>`。会跳过构建，直接部署该镜像。

**方式二（服务器上）：**

```bash
IMAGE_TAG=sha-<旧commit> /srv/coresearch/app/deploy.sh
```

查看本地有哪些可回滚的镜像：

```bash
docker images ghcr.io/zhanghoks/coresearch-agent-api
```

---

## 五、排查

```bash
# 当前状态与健康
docker compose -f /srv/coresearch/app/docker-compose.yml ps

# 日志
docker compose -f /srv/coresearch/app/docker-compose.yml logs -f --tail=200 agent-api

# 本机 health
curl -s http://127.0.0.1:4100/health

# 公网 health（验证 Tunnel 通路）
curl -s https://api.coresearch.xxx.com/health

# 当前跑的是哪个镜像
docker inspect --format '{{.Config.Image}}' coresearch-agent-api
```

`/health` 返回的 `version` 就是构建这个镜像的 commit sha。它和你期望的 commit 不一致，说明拉到了旧镜像。

常见问题：

| 现象 | 原因 |
|---|---|
| 启动即退出，日志是 `缺少环境变量 XXX` | `production.env` 少了必填项。`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` / `PI_PROVIDER` / `PI_MODEL` / `PI_API_KEY` / `PI_AGENT_DIR` 都是硬性要求 |
| 前端报 CORS | `AGENT_API_ORIGINS` 没包含该 origin，或带了结尾斜杠 |
| `docker compose pull` 403 | GHCR 包是 private 且服务器没 `docker login` |
| Tunnel 不通但本机 `/health` 正常 | cloudflared 容器或 `/etc/cloudflared/config.yml` 的问题，与 agent-api 无关 |
| Agent 调不通模型，但 Supabase 正常 | 这台机器的 Docker bridge 没有出站 DNS，所以 compose 里用的是 `network_mode: host`。别改回 bridge |

---

## 六、数据与备份

| 位置 | 内容 | 说明 |
|---|---|---|
| Supabase | Project、Canvas、Conversation、事件、Session、Skill、研究实体 | 权威数据，与容器生命周期无关 |
| `/srv/coresearch/data/pi` | Pi 的 `auth.json` / `models.json` / sessions | bind mount，容器重建不影响 |
| `/srv/coresearch/data/runtime` | codex 模式的 per-project workspace | 当前 pi 运行时不使用 |

用的是 bind mount 而不是 named volume，所以 `docker compose down`、`up`、重新构建、甚至 `down -v` 都不会删掉用户数据，且可以直接在宿主机上 `tar` 备份：

```bash
sudo tar czf /srv/coresearch/logs/data-$(date +%F).tar.gz -C /srv/coresearch data
```

Supabase 侧的备份用 Supabase 自己的 PITR / 备份功能，不在本文档范围。

---

## 七、已知边界（重要，请先读完再上线）

### 1. 部署会中断正在进行的 Agent run

Agent 的执行状态（`RuntimeManager` 的 `AbortController`、`CanvasBridge` 里待浏览器确认的画布工具调用、`EventHub` 的 SSE 订阅者）全部在 agent-api 进程内存里。容器重建 = 这些 run 被硬中断。

agent-api 启动时会做 reconcile：把所有残留在 `status='running'` 的 run 标记为 `failed`，并补发一条 `run.failed` 事件，前端重连后能正常收尾。

这不只是显示问题——`001_agent_platform.sql` 有唯一索引：

```sql
create unique index one_active_run_per_conversation
    on public.agent_runs (conversation_id) where status = 'running';
```

没有 reconcile 的话，一个卡住的 run 会让那个 Conversation **永久无法发起新 turn**。

**代价：被中断那一轮的对话内容会丢失，用户需要重发。** 20 人内测阶段接受这一点，请挑低峰期部署。

### 2. agent-api 必须单副本，不支持滚动更新

同样因为上面三个进程内状态。多副本会让 abort 请求和画布工具结果投递到错误的实例（代码会返回 409 `run_not_on_instance`，不会串数据，但功能不可用）。部署策略只能是 stop → start，有秒级中断。

### 3. 现在拆不出 agent-worker

`CanvasBridge` 和 `EventHub` 都是进程内内存桥，拆进程会让 `canvas_read_snapshot` / `canvas_apply_operations` 直接失效，SSE 也收不到实时事件。这是设计事实，不是偷懒——所以这段预留说明只放在这里，`docker-compose.yml` 里不再保留一份注释掉的 `agent-worker` service 定义（那段 YAML 永远不会直接可用，放着只是 dead code）。

长期方向是 durable run state（把待确认工具调用和 abort 意图落库）+ 共享事件通道（Redis pub/sub 或 Postgres LISTEN/NOTIFY）。届时 worker 用同一个镜像、不同 command 即可，CI 不用改：

```yaml
agent-worker:
  image: ghcr.io/zhanghoks/coresearch-agent-api:${IMAGE_TAG:-main}
  container_name: coresearch-agent-worker
  command: ["node", "dist/worker.js"]
  env_file:
    - /srv/coresearch/env/production.env
  environment:
    AGENT_ROLE: worker
  network_mode: host
  volumes:
    - /srv/coresearch/data/pi:/var/lib/research-canvas/pi
    - /srv/coresearch/data/runtime:/srv/coresearch/runtime
  restart: unless-stopped
  profiles: ["worker"]
```

### 4. Migration 手工执行，必须先于代码上线

migration 由流水线的 `migrate` job 在发布后端之前执行，规则见 `supabase/README.md`。

### 5. web 有 43 个存量类型错误

`bun run typecheck` 在 main 上不通过（集中在 `src/pages/canvas/project.tsx` 等画布代码）。CI 里 web 的 typecheck 是 `continue-on-error`，真正的 gate 是 `bun run build` 和 `bun test`——这也正是 Vercel 实际跑的东西（`vite build` 不做类型检查）。清零之后请把 `continue-on-error` 删掉。

`agent-api` 的 typecheck 是真 gate，当前 0 错误。
