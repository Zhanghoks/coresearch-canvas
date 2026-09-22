# 托管 Codex Runtime：多用户 Agent 网关

> 地位：实现规格。产品流程真值仍是 [research-flow.md](./research-flow.md)；本文只管运行时与隔离。
>
> **隔离 key 已收敛**：领域模型见 [project-workspace-and-artifacts.md](./project-workspace-and-artifacts.md)。托管权威路径按 `projectId` 划分（`<hostDataRoot>/projects/<projectId>/workspace|data`），不再使用 `users/<userId>/`。`userId` 只来自 JWT，用于 ownership / membership。下文若仍写 `User × Project` 目录，以该定案为准。

一句话定案：

> **服务器安装 Codex CLI；`agent-api` 是唯一 Web Gateway；每个 `User × Project` 对应一个隔离的 Codex Runtime，每个 Conversation 对应该 Runtime 内的一条 Codex Thread。浏览器永远不直接连接 Codex。**

## Problem Statement

现在想让 Agent 读写研究画布，用户必须在自己电脑上装 Codex CLI、跑本机 Canvas Agent。换设备就失效，也无法给多人提供统一体验。已有托管 Agent API 走 Pi，和本机 Codex 能力不一致。

## Solution

Codex 装在服务器上。浏览器登录后只和 `agent-api` 说话。每个 Project 有独立工作目录、Skill 和 Codex 历史；同一 Project 下多条对话共享 Runtime、各自对应一条 Thread。画布写入仍须用户确认：**AI proposes. Human commits.**

## User Stories

1. As a researcher, I want to use Agent after signing in, so that I do not install local software.
2. As a researcher, I want each Project to keep its own Agent workspace, so that switching Projects does not mix context.
3. As a researcher, I want multiple Conversations in one Project, so that I can separate exploration threads.
4. As a researcher, I want conversation lists to come from the product database, so that titles I named are the source of truth.
5. As a researcher, I want to continue an old Conversation, so that Codex resumes the mapped thread.
6. As a researcher, I want streamed replies and tool progress, so that I can see the Agent working.
7. As a researcher, I want to abort a running turn, so that a bad prompt can be stopped.
8. As a researcher, I want one Conversation to reject concurrent turns, so that history is not interleaved.
9. As a researcher, I want different Conversations to run in parallel, so that a long task does not block another question.
10. As a researcher, I want SSE to resume after disconnect, so that I do not lose events.
11. As a researcher, I want Agent canvas edits to wait for my confirm, so that unendorsed claims never become Canvas Nodes.
12. As a researcher, I want rejected proposals to leave the canvas unchanged, so that I keep control.
13. As a researcher, I want confirmed ops persisted with a new revision, so that refresh restores the same canvas.
14. As a researcher, I want identity to come only from my JWT, so that request bodies cannot impersonate me.
15. As a researcher, I want canvas tools to take no Project parameter, so that the model cannot read another Project.
16. As a researcher, I want my Project directories and Codex home isolated, so that another user never sees my files or threads.
17. As a researcher, I want platform model credentials never sent to the browser, so that keys stay server-side.
18. As a platform operator, I want a crashed Project runtime to affect only that Project, so that other users keep working.
19. As a platform operator, I want the next turn after a crash to recreate the runtime and resume the thread, so that users do not restart by hand.
20. As a platform operator, I want browsers to speak only product events, so that replacing Codex later does not change the frontend.

## Implementation Decisions

### Mapping

```text
User            1:N   Project
User × Project  1:1   Codex app-server Runtime
Project         1:N   Conversation
Conversation    1:1   Codex Thread
Conversation    1:N   AgentRun
AgentRun        1:N   RuntimeEvent
```

### Keep RuntimeAdapter

Codex is a second `RuntimeAdapter`. `RuntimeManager` is unchanged. The process pool lives inside the Codex adapter.

### Directories

```text
<hostDataRoot>/projects/<projectId>/
├── workspace/     # Agent cwd（Pi / Codex 共用这层语义）
├── data/          # sessions / artifacts / papers / indexes / cache
└── tmp/           # 运行时临时目录（可选；不属于 Workspace 真值）
```

`projectId` is the isolation key. Path hashing, if used, is only to prevent traversal, not authorization. Do not put `userId` in the authoritative path. See [project-workspace-and-artifacts.md](./project-workspace-and-artifacts.md).

### Credentials

Supabase Auth is the product identity. Codex keys are platform infrastructure, injected into the child process from server env. They are never written to user directories, the database, or the browser.

### Sandbox and MCP

Default sandbox is read-only. Product capabilities go through a project-scoped MCP that carries an ephemeral runtime token and calls a loopback private API. Tool parameters must not include user, Project, or path.

```text
Tool Scope = Runtime Scope
```

### RequestContext

```ts
type ProjectContext = {
  userId: string;        // JWT only
  projectId: string;     // URL + membership
  canvasId: string;      // server lookup, Project 1:1
  projectRoot: string;
  workspaceRoot: string;
  dataRoot: string;
  sessionId?: string;
  runId?: string;
};
```

Request bodies and tool inputs cannot supply tenant scope. See [project-workspace-and-artifacts.md](./project-workspace-and-artifacts.md).

### Canvas truth

Server snapshot is durable persistence. Browser state is the active editing truth. Writes: Agent proposes → human confirms → browser applies → revision advances → persist → tool result.

### Events

Browser sees only product events. Codex JSON-RPC stays inside the adapter. Protocol version stays independent from session storage version.

### Unset limits

Idle recycle, max runtimes, start timeout, turn timeout, token TTL, and body size limits are not set in this spec. Do not invent values.

## Testing Decisions

Test observable behavior. Do not start a real Codex binary.

- Seam 1: `RuntimeAdapter.execute` with the in-memory store.
- Seam 2: replaceable JSON-RPC transport that records cwd, `CODEX_HOME`, thread/start vs resume, and event mapping.
- Seam 3: `ResearchStore` thread binding and canvas snapshot persistence.
- Seam 4: runtime token parse/reject.

Prior art: `agent-api/src/domain.test.ts` and `canvas-agent` Codex JSON-RPC client tests.

## Out of Scope

Project sharing, user-owned model credentials, horizontal scaling, removing the local Canvas Agent, removing the Pi adapter, Research Domain versioning, container isolation, and hosting the nine node Skills / Artifact tools.

## Further Notes

Codex app-server is experimental. `web`, Postgres, and canvas must not depend on its JSON-RPC shape. This is the current local path lifted to multi-user hosting, not a new product.
