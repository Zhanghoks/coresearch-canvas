---
name: research-flow
description: 按当前研究节点路由到对应 Skill。用户继续研究、探索候选、保留候选、形成 Idea、审阅 Idea 或查找研究证据时使用。
---

# Research Flow

先 `canvas_get_state`（或用户说「这个」时 `canvas_get_selection`），看当前节点类型，再改用对应 Skill：

| 当前节点 | Skill |
| --- | --- |
| seed | `seed` |
| direction | `direction` |
| research_question | `research-question` |
| problem | `problem` |
| hypothesis | `hypothesis` |
| approach | `approach` |
| method | `method` |
| evaluation | `evaluation` |
| idea | `idea` |

研究卡片的新增和连线只用 `research_workflow_advance`。`explore` 不写画布；用户明确确认后才 `commit`；形成 Idea 用 `synthesize`。不要用 `canvas_create_node` 或 `canvas_apply_ops` 跨过阶段。

## Entity Node / Group / Section 设计

目标模型见 [Research Entity Node / Group / Section](../../../docs/design/canvas/research-entity-node-model.md)。在讨论或规划新能力时，区分：Entity Node 是长期研究实体，Group 是一次探索的视觉/provenance 容器，Section 是实体内部可寻址内容。当前 runtime 尚未迁移到这套六类 Entity Node；不要把目标设计描述成已实现能力。

Paper / Idea 的 Section 可以作为 Agent context 的最小聚焦对象，但读取、追问或搜索 Section 不等于写入 Canvas。只有用户明确确认，才允许通过现有工作流写入研究节点。

## 节点文档

卡片 Preview 用独立的 `metadata.summary`，长文在一篇 `metadata.document`。权威 `##` 只是骨架，用户自定义标题必须保留。

- 修改前读完整 document，整篇提交，不要只替换某一节。
- 保留用户正文、自定义 `##` 和现有顺序；权威标题缺失时只追加到文末。
- 核心含义变化时同步 `summary`；不要从 Markdown 自动摘一句当 summary。
- 用户明确说「补全骨架」时才追加缺失的权威 `##`。
- 不要把 Deep Dive 材料预填进 Direction 文档。

用户明确要求保存、导出或读取阶段产物时，改用 `research-workspace`。不要在每次探索后自动生成 Artifact。

用户要求搜索论文、找文献或 related work 时，改用 `paper-lit`。检索用 bash 脚本，不要注册新 Pi tool。
