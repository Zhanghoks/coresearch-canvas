# Skill 仓库、Workspace 与 Artifact

## 目标

研究流程按九种节点拆为可发现的 Skill，但状态迁移只由 `research_workflow_advance` 校验。Canvas 节点是用户确认后的研究承诺；Artifact 是用户明确保存或导出的不可变 Markdown 派生产物，不能反向充当节点真值。

固定边界：

- Project 从当前 Canvas 的 `projectId` 推导；模型不能传用户、Project、Workspace ID 或文件路径。
- 普通 `explore` / `commit` 不自动生成 Artifact。
- 修改 Artifact 通过新写一份版本表达；首期没有 update / delete。
- 本地 Workspace 是 Canvas Agent 的运行目录，不等于已经具备云同步的研究后端。多用户托管布局见 [project-workspace-and-artifacts.md](./project-workspace-and-artifacts.md)；托管权威路径按 `projectId`，不再使用 `users/<userId>/`。

## Skill 仓库

```text
canvas-agent/skills/                 # 权威源（npm 包内置，唯一手改处）
  research-flow/                     # 节点路由
  research-workspace/                # Artifact 路由
    SKILL.md
    references/
      artifact-contract.md
      workspace-layout.md
  seed/ ... idea/                    # 九种节点 Skill

.coresearch/skills/                  # Canvas Agent 运行时安装副本
plugins/infinite-canvas/skills/      # Codex 插件发布副本（研究 Skill 由脚本同步）
  canvas/                            # 插件独有：操作当前画布
  open-canvas/                       # 插件独有：打开本地 CoResearch 画布
```

**权威源 vs 发布副本**：九种节点 Skill、`research-flow`、`research-workspace` 只在 `canvas-agent/skills/` 维护。修改后运行 `plugins/infinite-canvas/scripts/sync-skills.sh`，同步到 Codex 插件目录（不含双方各自的 `README.md`）。`canvas/` 与 `open-canvas/` 仅存在于插件侧，不同步覆盖。

每个节点 Skill 负责提示词写作边界、所需 Canvas 读取、合法下一步和可选 Artifact 类型。工具负责硬约束，Skill 不复制状态机。内置 Skill 安装器递归安装 `references/`；带管理标记的文件可随版本更新，用户改写过的文件不会被覆盖。

| 节点 | 下一步 | 可保存 Artifact |
| --- | --- | --- |
| Seed | Direction | `seed-brief` |
| Direction | Research Question | `direction-map` |
| Research Question | Problem | `rq-comparison` |
| Problem | Hypothesis | `problem-evidence` |
| Hypothesis | Approach | `hypothesis-test-plan` |
| Approach | Method + Evaluation | `approach-tradeoff` |
| Method | Evaluation 修订 | `method-protocol` |
| Evaluation | Idea 综合前审计 | `evaluation-matrix` |
| Idea | Review / Export | `idea-review`、`export` |

## Artifact Tool

```ts
research_artifact_write({ kind, title, content, sourceNodeIds })
research_artifact_list({})
research_artifact_read({ artifactId })
```

`CanvasSession` 从当前活跃 Canvas 获取 `projectId`，从当前 Agent turn 获取 `conversationId` 与 `turnId`，再调用存储层。即使调用参数夹带 `projectId`，Schema 也会丢弃它，存储层只收到服务端推导的作用域。

## 本地存储

```text
.coresearch/
  AGENTS.md
  skills/
.data/users/<userId>/projects/<sha256(projectId)[0:24]>/
  project.json
  canvas.json
  artifacts/<artifact-id>/
    metadata.json
    content.md
```

每次写入先在同一 `artifacts/` 下完成临时目录，再原子 rename 为最终目录。每个 Artifact 独立存储，不维护共享可争用的 manifest；列表通过扫描元数据生成。`metadata.json` 记录 `schemaVersion`、Project、kind、标题、来源节点、内容哈希、创建时间、actor、Conversation 与 turn。读取时重新验证 Project 和正文 SHA-256。

## Project Data 读取模型

Artifact 写入成功只代表服务端持久化完成，不会自动创建画布节点。产品通过独立的只读 Data API 展示当前 Project 的派生产物：

```text
GET /data/artifacts?clientId=<current-browser-client>
GET /data/artifacts/:artifactId?clientId=<current-browser-client>
```

服务端按 `clientId → CanvasSnapshot.projectId → ResearchArtifactStore` 解析作用域；接口不接受 `projectId`、Workspace 路径或用户 ID。客户端伪造其他 Project 的 Artifact ID 时，读取会在当前 Project 目录内失败。每次 `research_artifact_write` 成功后，Canvas Agent 广播 `artifacts_changed`，浏览器重新读取自己的 Project 数据。

运行内容分为三层，避免互相冒充：

1. Conversation / Turn 由 Agent 原生会话历史负责；
2. Artifact 保存正文以及 `conversationId`、`turnId`、`sourceNodeIds`，形成可追溯的研究输出；
3. Canvas Node 只保存用户确认后的研究承诺，不因 Artifact 写入而自动变化。

左侧“研究数据”是只读投影：列表展示 Artifact 类型、标题和时间，详情展示 Markdown 正文与运行来源。它不是新的数据副本，也不把本地 Canvas 宣称为云端真值。

## 托管形态

多用户领域模型见 [project-workspace-and-artifacts.md](./project-workspace-and-artifacts.md)。托管隔离 key 是 `projectId`，权威路径不再使用 `users/<userId>/`。

公共 Tool 接口不变。服务端从 JWT 与路由 membership 解析 `ProjectContext`，元数据进 `artifacts` 表，正文进 `<hostDataRoot>/projects/<projectId>/data/artifacts/<artifactId>/`（或未来对象存储）。这是目标映射，不代表当前本机 `.data/users/<userId>/projects/` 已迁移，也不代表已实现云同步。
