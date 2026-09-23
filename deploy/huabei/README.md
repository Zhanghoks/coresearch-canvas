# 生产后端：ebcloud 容器实例（zmj-huabei1）

生产 `agent-api` 跑在 ebcloud 华北一的容器实例上。这台机器和 `deploy/production/`（Docker Compose 方案）假设的普通 Linux 主机不同：

| 事实 | 影响 |
|---|---|
| 本身是容器：没有 dockerd，没有 systemd（PID 1 是 bash） | 不能用 Docker Compose；进程由 pm2 管理；没有开机自启 |
| `/` 是 overlay，实例重建即丢失；只有 `/root/data` 是持久盘（Lustre，多租户共享，777） | 运行时、pm2 状态、数据、密钥全部放在 `/root/data/zmj/coresearch`，目录 700 |
| 入站 SSH 经 `ssh-cn-huabei1.ebcloud.com` 中转，频繁断线，传不了大文件 | CI 不 SSH 进来；服务器主动从 GHCR 拉取 |
| 出站访问 GHCR 的 blob 下载节点经常只有几 KB/s；codeload.github.com、registry.npmjs.org、nodejs.org 通常 1MB/s 以上 | 先从 GHCR 下载运行包（90s 预算，断点续传 + sha256 校验）；超时则下载该 commit 源码，用与 CI 相同的 `build-bundle.sh` 在本机构建（约 30s），产物同样校验 `VERSION` |

原则和 Docker 方案一致：**服务器上没有源码、不构建；每个版本是一个 `sha-<commit>` 运行包；回滚就是换版本。**

## 发布流程

```
push main
  → CI：typecheck + test
  → migrate：supabase db push（见 supabase/README.md）
  → bundle：在 linux-x64 上构建 dist + 生产依赖 + ops 脚本，
            推到 ghcr.io/zhanghoks/coresearch-agent-api-bundle:sha-<commit>，再把 :main 指向它
  → 服务器 updater（每 60s）发现 :main 变了 → deploy.sh → 切版本 → pm2 重载 → 本机 /health 断言
  → CI verify：轮询公网 /health，version == 本次 commit 才算发布成功
```

本机 `/health` 断言失败时 `deploy.sh` 会自动切回上一个版本，并记下 `state/failed-<sha>`，updater 不会反复重试同一个坏版本。

## 目录

```
/root/data/zmj/coresearch/          (700)
├── runtime/node -> node-v22.19.0-linux-x64
├── bin/        deploy.sh updater.sh start.sh env.sh ecosystem.config.cjs oras cloudflared
├── releases/   sha-<commit>/         最近 5 个版本
├── current  -> releases/sha-<commit>
├── secrets/    agent-api.env (600)   cloudflared/{config.yml,<TUNNEL_ID>.json}
├── data/pi/                          Pi 会话数据（PI_AGENT_DIR）
├── state/      PINNED  failed-<sha>  deploy.lock
└── pm2/                              PM2_HOME
```

`bin/` 下的脚本随每个运行包更新（源码在本目录 `ops/`），服务器上不要手改。

## 首次安装

1. 放密钥（变量清单见 `deploy/ENV.md`）：

   ```bash
   mkdir -p /root/data/zmj/coresearch/secrets && chmod 700 /root/data/zmj/coresearch
   vi /root/data/zmj/coresearch/secrets/agent-api.env   # 模板：agent-api/.env.production.example
   ```

2. 确认 GHCR 包 `coresearch-agent-api-bundle` 已设为 Public，且 `main` 上至少成功跑过一次 `bundle` job。

3. 安装并启动：

   ```bash
   curl -fsSL https://raw.githubusercontent.com/Zhanghoks/coresearch-canvas/main/deploy/huabei/install.sh | bash
   ```

   它会装好 Node/pm2/oras/cloudflared（版本固定在 `install.sh` 里）、部署 `:main`、启动 `agent-api` 和 `updater`。重复执行是安全的。

## Cloudflare Named Tunnel

生产不能用 `*.trycloudflare.com`（Quick Tunnel 只用于测试，不支持 SSE）。在任意装了 `cloudflared` 的机器上：

```bash
cloudflared tunnel login
cloudflared tunnel create coresearch
cloudflared tunnel route dns coresearch api.<你的域名>
```

把 `~/.cloudflared/<TUNNEL_ID>.json` 放到服务器 `secrets/cloudflared/`，按仓库 `deploy/cloudflared/config.yml` 写 `secrets/cloudflared/config.yml`（`credentials-file` 指向上面的 json，ingress 指 `http://127.0.0.1:4100`），然后：

```bash
/root/data/zmj/coresearch/bin/start.sh   # 检测到 config.yml 后会自动拉起 cloudflared
```

最后把 Vercel 的 `VITE_AGENT_API_URL` 和 GitHub Variable `API_PUBLIC_URL` 改成 `https://api.<你的域名>`，并确认 `AGENT_API_ORIGINS` 包含前端域名。

## 临时：Quick Tunnel（仅用于验证，不是生产入口）

在正式域名就绪前，服务器上跑着一个 pm2 进程 `cloudflared-quick`（`cloudflared tunnel --url http://127.0.0.1:4100`），
地址形如 `https://<随机>.trycloudflare.com`，已临时写入 Vercel `VITE_AGENT_API_URL` 和 GitHub `API_PUBLIC_URL`。

- **SSE 不可用**：实测经 Quick Tunnel 的 `/events` 在 run 完成后仍收不到任何事件，约 67 秒后被断开；前端 Agent 对话没有轮询兜底，所以对话不会显示回复。登录、项目、画布等普通请求正常。
- 进程重启会换一个新地址，届时两处变量都要更新，Vercel 还要重新部署。
- 它不在 `ecosystem.config.cjs` 里，`start.sh` 不会自动拉起它。
- Named Tunnel 就绪后：`pm2 delete cloudflared-quick && pm2 save`，并把两处变量改成正式域名。

## 日常操作

所有命令先 `source /root/data/zmj/coresearch/bin/env.sh`。

| 目的 | 命令 |
|---|---|
| 看状态 | `pm2 status`，`curl -s 127.0.0.1:4100/health` |
| 看日志 | `pm2 logs agent-api`，`pm2 logs updater` |
| 回滚（推荐） | GitHub Actions → Deploy production → Run workflow，填 `rollback_tag=sha-<旧commit>`：`:main` 指回旧版本，updater 自动切换 |
| 回滚（服务器上，紧急） | `deploy.sh sha-<旧commit> --pin`，钉住后 updater 暂停跟随 |
| 恢复自动更新 | `rm state/PINNED` |
| 重试某个失败版本 | `rm state/failed-<sha>` |
| 改密钥 | 编辑 `secrets/agent-api.env` 后 `pm2 reload agent-api --update-env` |

回滚只回退后端代码，**不回退数据库**，所以 migration 必须向前兼容（见 `supabase/README.md`）。

## 实例重启之后

没有 systemd，pm2 不会自己起来。SSH 进来执行一次：

```bash
/root/data/zmj/coresearch/bin/start.sh
```

如果实例是**重建**（根文件系统被换掉）而不只是重启，持久盘上的东西都在，`start.sh` 同样够用。

## 已知边界

- 单进程：发布会中断进行中的 Agent run，启动时 reconcile 会把它们标记为 failed。
- updater 间隔 60s，发布到生效通常 2–3 分钟。
- 实例重启后到手动执行 `start.sh` 之前，服务不可用。
