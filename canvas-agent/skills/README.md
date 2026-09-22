# Research node skill repository

本目录是研究节点 Skill 的权威源。Codex 插件侧副本由 `plugins/infinite-canvas/scripts/sync-skills.sh` 从此处同步，请勿只改插件目录里的同名 Skill。

研究实体分层的目标设计见 [Research Entity Node / Group / Section](../../docs/design/canvas/research-entity-node-model.md)。Skill 只能引用这份设计作为目标语义；当前运行时的既有研究节点、Canvas 写入边界和未实现能力仍以实际代码为准。

每个研究节点一个 Skill。阶段校验在工具 `research_workflow_advance`，不在 Skill 里再实现一遍。

| Skill | 节点 | 探索后可提交 | 工具 |
| --- | --- | --- | --- |
| `research-flow` | 总路由 | — | 按当前节点改用下表 Skill |
| `research-workspace` | Workspace / Artifact | — | `research_artifact_write/list/read` |
| `seed` | Seed | Direction | `canvas_get_state`、`canvas_get_selection`、`research_workflow_advance` |
| `direction` | Direction | Research Question | 同上；保存证据时 `canvas_create_node`（web/pdf） |
| `research-question` | Research Question | Problem | 同上 |
| `problem` | Problem | Hypothesis | 同上 |
| `hypothesis` | Hypothesis | Approach | `canvas_get_state`、`canvas_get_selection`、`research_workflow_advance` |
| `approach` | Approach | Method + Evaluation（同一次 commit） | 同上 |
| `method` | Method | Evaluation 修订 | 同上 |
| `evaluation` | Evaluation | 无直接下一节点；综合用 `idea` | 同上 |
| `idea` | Idea | Review；综合用 `kind=synthesize` | 同上 |

共享循环：`explore` 只返回对话候选 → 用户明确确认 → `commit` 或 `synthesize` 才写画布。卡片契约在 `web/src/lib/canvas/research-node-contract.ts`，权威 `##` 表在 `canvas-agent/src/canvas/research-headings.ts`，工作流边界在 `canvas-agent/src/canvas/research-workflow.ts`。

论文搜索（ARIS `research-lit` / `research-wiki`）：`paper-lit` 编排，`paper-arxiv` / `paper-scholar` / `paper-openalex` 调 `skills/paper-lit/scripts/`，`paper-verify` 核验，`paper-wiki` 只存 Paper。不要注册 Pi tool。

节点是当前研究承诺的权威表达；Artifact 是用户明确保存或导出的不可变 Markdown 派生产物。模型不能指定用户、Project 或路径，三项 Artifact Tool 均从当前 Canvas 推导 Project。
