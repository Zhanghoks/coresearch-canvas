# Project、Workspace 与 Artifact

> 地位：本仓库多用户领域模型定案。产品流程仍以 [research-flow.md](./research-flow.md) 为准；本文只管隔离边界、文件布局和 Artifact 契约。本轮只记录设计，不改运行时代码、API、migration、RLS 或本地路径实现。

一句话定案：

> **Project 是产品、权限、路由与逻辑隔离的核心实体。Canvas 是 Project 的 UI 投影，Workspace 是 Project 的 Agent 文件工作区（Pi `cwd`），DataRoot 是 Project 的运行数据空间。四个概念不要混成一个，也不要再引入高于 Project 的 Workspace 产品层。**

相关文档：[skill-repository-and-artifacts.md](./skill-repository-and-artifacts.md)（Tool 与本地落盘）、[hosted-codex-runtime.md](./hosted-codex-runtime.md)（托管 Agent 网关；隔离 key 已收敛为 `projectId`）、[workspace.md](./workspace.md)（研究状态实体思路仍成立，目录树已过期）。

## 1. 对象模型

```text
User 1:N Project
Project 1:1 Canvas
Project 1:1 Workspace          # Pi cwd
Project 1:1 DataRoot           # sessions / artifacts / papers / indexes / cache
Project 1:N Session
Project 1:N Artifact
```

| 概念 | 是什么 | 不是什么 | 权威存储 |
| --- | --- | --- | --- |
| Project | 产品实体；权限、路由、逻辑隔离的主键 `projectId` | 目录、画布、会话、container | Postgres `projects` |
| Canvas | 节点、边、布局、视口等交互投影 | Agent 可写工作目录 | Postgres `canvases` / `canvas_nodes` / `canvas_edges` |
| Workspace | 该 Project 的 Pi 文件工作区与稳定 `cwd` | 画布真值、session、artifact 正文、密钥 | `<projectRoot>/workspace/` |
| DataRoot | 该 Project 的运行数据空间 | 研究承诺本身、Agent 源码 | `<projectRoot>/data/`；Artifact 元数据在 Postgres |
| Session | 一次 Agent 对话 | 全局用户会话、Canvas 历史 | DataRoot `sessions/` + `sessions` 表 |
| Artifact | Project-scoped、不可变、带来源的人类保存派生产物 | Canvas Node、可重建 view、运行时 cache | DataRoot `artifacts/` + `artifacts` 表 |

固定原则：

- `userId` 只由 JWT 提供，用于 ownership / membership 校验，**不写进权威路径**。
- `projectId` 才是数据库、文件路由和业务隔离的核心 key。
- 第一版所有项目跑在**同一个 Node 服务**里，只做逻辑隔离。不采用「一 Project 一 container」。
- **AI proposes. Human commits.** 只约束 Canvas、Research Entity、Artifact 等产品领域状态。session JSONL、cache、temporary index、runtime log 不纳入人工 commit。

协作以后加 `project_members`；当前 membership 等价于 `projects.owner_id === jwt.userId`。加入成员表时不得改变现有 API、Tool 和 `ProjectContext` 契约。

## 2. 请求链

```text
Browser
  → Auth / JWT
  → ProjectResolver
  → owner / membership check
  → ProjectContext
       ├→ Canvas API  → Postgres（按 project_id 隔离）
       ├→ Agent API   → 同进程 Runtime（cwd = workspaceRoot）
       └→ File API    → DataRoot / 对象存储
```

`ProjectContext` 必须由服务端根据 JWT、URL 中的 `projectId`、数据库 membership 和服务器端路径规则生成。Request Body 或 LLM Tool Input 中出现的 `userId` / `projectId` / `workspaceRoot` / `dataRoot` / `absolutePath` **一律不能作为可信作用域来源**。

```ts
type ProjectContext = {
  userId: string;        // JWT only
  projectId: string;     // URL + membership
  canvasId: string;      // server lookup，Project 1:1
  projectRoot: string;   // 服务端推导：<hostDataRoot>/projects/<projectId>
  workspaceRoot: string; // projectRoot/workspace
  dataRoot: string;      // projectRoot/data
  sessionId?: string;
  runId?: string;
};
```

所有 Tool 采用 `tool.execute(input, projectContext)`，不要让模型自己传 tenant 信息。Schema 若收到 `projectId` 或路径字段，丢弃。

路径由服务端推导，不信任客户端或 `projects.workspace_path` 一类可写字段：

```text
projectRoot    = <hostDataRoot>/projects/<projectId>
workspaceRoot  = <projectRoot>/workspace
dataRoot       = <projectRoot>/data
```

## 3. Workspace 区

Workspace 只给 Pi 一个稳定 `cwd`。Pi SDK 以 `cwd` 发现 project-local extensions、skills、prompts、`AGENTS.md`，因此 Project Workspace 直接映射为 Pi `cwd`。

```ts
createAgentSession({
  cwd: ctx.workspaceRoot,
  sessionManager: SessionManager.create(
    ctx.workspaceRoot,
    path.join(ctx.dataRoot, "sessions"),
  ),
});
```

Pi 支持单独指定 `sessionDir`，不要求 session 文件位于 cwd 内。本设计把 session 显式放到 DataRoot。

```text
<hostDataRoot>/projects/<projectId>/workspace/
  AGENTS.md
  .pi/
  skills/                 # 由产品内置源安装，权威源仍是 canvas-agent/skills/
  files/                  # 可选：用户 / Agent 工作文件
```

Workspace **不**存放：

- Canvas JSON / 节点真值
- session JSONL
- Artifact 正文
- 模型密钥、连接 token

Skill / `AGENTS.md` 从产品内置源安装进该 cwd，不按用户复制框架源码。本仓库当前仓库根 `.coresearch/` 是「全机一份 Agent cwd」；多用户后必须下沉为每个 Project 一份 workspace，不能再共用。

### Path guard（MVP，不是安全 sandbox）

Workspace 文件访问统一经过 path resolver：把相对路径 resolve / canonicalize 后，强制检查结果仍位于 `workspaceRoot` 内。拒绝 `../`、绝对路径、其他 Project 根路径。

这只是应用层 path guard。Pi 官方说明 `cwd` / Project Trust **不限制**工具实际可访问的操作系统资源；Pi 默认继承启动进程权限。真正强隔离要靠 OS / container / VM，属于后续范围，本轮不定方案。

## 4. DataRoot 与 Artifact

```text
<hostDataRoot>/projects/<projectId>/data/
  sessions/                      # Pi sessionDir
  artifacts/<artifactId>/
    metadata.json
    content.md                   # 或未来对象存储中的 blob
  papers/
  indexes/
  cache/
```

`sessions` / `papers` / `indexes` / `cache` 同属 Data Store，不进 Workspace，也不进 Canvas 表。

### Artifact 契约

Artifact 是 **Project-scoped、immutable、带明确来源的人类保存派生产物**，不等于 Canvas Node，不反向修改节点。沿用现有 Tool：

```ts
research_artifact_write({ kind, title, content, sourceNodeIds })
research_artifact_list({})
research_artifact_read({ artifactId })
```

- Tool 不接受 `projectId` 或绝对存储路径。
- 作用域由 `ProjectContext + 当前 session / turn` 推导。
- 正文存于 `<dataRoot>/artifacts/<artifactId>/`，或未来对象存储。
- 数据库只存索引，不存正文。
- Canvas Node 只保存 `artifactId`，不保存正文或磁盘路径。
- 无原地 update / delete；修订即创建新 Artifact。
- 伪造其他 Project 的 Artifact ID 必须失败。

公开索引字段：

```text
id
project_id
kind
title
storage_path
content_hash
created_by
created_at
session_id / turn_id
source_node_ids
```

`kind` 仍按研究节点与论文产物：`seed-brief`、`direction-map`、`rq-comparison`、`problem-evidence`、`hypothesis-test-plan`、`approach-tradeoff`、`method-protocol`、`evaluation-matrix`、`idea-review`、`paper-plan`、`paper-draft`、`paper-audit`、`export`。普通 `explore` / `commit` 不自动生成 Artifact。

## 5. 第一版表

尽量少。路径一律服务端推导。

- `users`
- `projects`（`id, owner_id, name`）
- `canvases`（`id, project_id`）
- `canvas_nodes` / `canvas_edges`（带 `project_id`，便于日后 RLS）
- `sessions`（`id, project_id, runtime_session_id`）
- `artifacts`（见上一节）

预留：`project_members(project_id, user_id, role)`。当前不实现。Resolver 的 membership check 现在就是 owner 校验；加表后同一套 API / Tool / `ProjectContext` 继续用。

JWT 只证明人，不证明 Project。日后 RLS 的语义是：业务表的 `project_id` 必须落在「我拥有或我是成员」的集合里。本轮不写 migration 或 policy。

不在本文设定 idle recycle、worker 拓扑、turn timeout、container 上限等边界值。

## 6. 与本地 `.coresearch` / `.data` 的映射

当前本机实现仍是单机一份 Agent cwd + 按 `userId` 分项目目录，作为过渡，**不是**托管权威布局：

| 本机现状 | 多用户定案 |
| --- | --- |
| 仓库 `.coresearch/`（全机一份 cwd） | 每个 Project 的 `workspace/` |
| `.data/users/<userId>/projects/<hash>/` | `<hostDataRoot>/projects/<projectId>/` |
| 项目目录内的 `canvas.json` | Postgres Canvas |
| 项目目录内的 `artifacts/` | `<dataRoot>/artifacts/` |
| `.data/sessions/`（整机一份） | `<dataRoot>/sessions/` |
| `.data/auth.json`、`.data/agent.json` | 平台密钥与本机 Agent 配置，不进 Project Workspace |

本轮不迁移 `ProjectFileStore`、不改 IndexedDB 键、不把本机目录改成托管形状。

## 7. Out of Scope

本轮明确不做：

- container / sandbox 编排，或「一 Project 一 container」
- Supabase migration、RLS policy、`project_members` 实现
- Runtime 改造、Pi / Codex worker 拓扑
- 本地 `ProjectFileStore` 路径迁移
- IndexedDB / localStorage 的 `infinite-canvas` 键改名
- 擅自确定 timeout、idle recycle、未来 OS 级 sandbox 方案
- 把 session / cache / log 纳入 Human commits
