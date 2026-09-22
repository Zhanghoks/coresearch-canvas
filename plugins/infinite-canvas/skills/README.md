# Codex 插件侧研究 Skill 副本

研究节点 Skill（九种节点 + `research-flow` + `research-workspace`）的**权威源**是仓库根下的 `canvas-agent/skills/`。

修改权威源后运行：

```bash
./scripts/sync-skills.sh
```

本目录中的 `canvas/` 与 `open-canvas/` 为插件独有，不会被同步覆盖。

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
| `canvas` | （插件）操作当前画布 | — | MCP 画布工具 |
| `open-canvas` | （插件）打开本地 CoResearch | — | 启动 Agent + 打开前端 |

共享循环：`explore` 只返回对话候选 → 用户明确确认 → `commit` 或 `synthesize` 才写画布。
