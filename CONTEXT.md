# CoResearch 领域上下文

## 核心术语

- **Project**：产品、权限、路由与逻辑隔离的核心实体。一个 User 可拥有多个 Project；`projectId` 是数据库、文件路由和业务隔离的 key。`userId` 只来自 JWT，用于 ownership / membership，不写进权威路径。
- **Canvas**：该 Project 的交互投影（节点、边、布局、视口）。托管形态权威状态在 Postgres；当前本机仍以项目目录中的 canvas.json 为过渡真值。
- **Workspace**：该 Project 对应的 Pi Agent 文件工作区与稳定 `cwd`。只放 `AGENTS.md`、`.pi/`、skills 与可读写工作文件，不存 Canvas 真值、session、artifact 正文或密钥。
- **DataRoot / Data Store**：该 Project 的运行数据空间，容纳 `sessions / artifacts / papers / indexes / cache`。Pi `sessionDir` 指向 `<dataRoot>/sessions`。
- **Canvas Node**：用户确认后写入画布的研究承诺。Artifact 不替代、不反向修改它。
- **Research Artifact**：Project-scoped、不可变、带明确来源的人类保存派生产物。Canvas Node 只引用 `artifactId`。
- **ProjectContext**：服务端根据 JWT、路由 `projectId`、membership 和路径规则生成的请求作用域。Request Body 与 Tool Input 不得充当租户来源。
- **Run Provenance**：Artifact 保存的 session/turn 与 `sourceNodeIds`，说明由哪次 Agent 运行、基于哪些节点产生。
- **Project Data View**：面向当前 Canvas 的只读数据投影。不能由客户端自由指定 Project ID 或本地路径。

对象关系与文件布局见 [docs/design/project-workspace-and-artifacts.md](docs/design/project-workspace-and-artifacts.md)。

## 数据所有权

| 数据 | 当前本机过渡 | 多用户定案 | 变更规则 |
| --- | --- | --- | --- |
| Project | 隐含在本机项目目录里 | Postgres `projects`；路径 `<hostDataRoot>/projects/<projectId>/` | owner 创建；membership 预留 |
| Canvas / Canvas Node | `.data/users/<userId>/projects/…/canvas.json` | Postgres `canvases` / `canvas_nodes` / `canvas_edges` | 人确认后创建或修改 |
| Workspace | 仓库根 `.coresearch/`（全机一份） | 每个 Project 的 `workspace/`（Pi cwd） | 安装内置 Skill；不存领域真值 |
| Session | `.data/sessions/`（全机一份） | `<dataRoot>/sessions/` + `sessions` 表 | Runtime 管理，不走 Human commits |
| Research Artifact | 同一本机 Project 目录下的 `artifacts/` | `<dataRoot>/artifacts/` + `artifacts` 表 | 只追加新版本，不更新或删除 |
| Project Data View | 上述数据的只读投影 | 同上 | 不作为新的写入真值 |

固定原则：**AI proposes. Human commits.** 只约束 Canvas、Research Entity、Artifact 等产品领域状态。session JSONL、cache、temporary index、runtime log 不纳入人工确认。Agent 可以探索候选并生成派生产物，但只有用户确认的对象才能成为 Canvas Node。
