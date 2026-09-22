---
name: direction
description: 展开 Direction 的范围、子方向与问题线索。用户说深入研究此方向、展开子方向、梳理研究问题、Deep Dive 时使用。
---

# Direction

核心问题：哪片研究空间值得探索？  
下一阶段：Research Question。保存方向不等于选定深入。

## Tools

1. `canvas_get_state`。用户说「这个」时先 `canvas_get_selection`。若点的是空 RQ，沿连线找到所属 Direction。
2. 探索：`research_workflow_advance`

```json
{ "kind": "explore", "sourceNodeIds": ["<direction-id>"], "action": "<用户可见动作原文>" }
```

先用几句话概括范围和未知项。研究脉络写 3–5 条，每条必须用下面的格式，禁止把一条脉络写成一整段。界面会收成可拖到画布的卡片。

**脉络 A. 短标题**
- 主张：一句
- 做法：一句
- 证据：来源，一句结果
- 边界：一句

论文和仓库不要写进脉络段落，另起 `research-source` 围栏逐条列出（`kind` 为 `paper` 或 `repo`，含 title、url、一句 summary）。

Research Question 写 3–5 个，每个单独成块并分点，不要接在标题后面写成一段：

**RQ1. 问题句**
- 对象：
- 条件：
- 可观察结果：
- 依据：
- 取舍：

3. 用户明确选择 1–3 个问题后 `commit`，`candidates[].nodeType` 只能是 `research_question`。
4. 用户把文献卡片拖到画布，或明确要求保存时，再 `canvas_create_node`：标题为「文献」的 `group`，以及 `web` / `pdf`（`metadata.sourceUrl`、一句 `summary`、`groupId`），连到该 Direction。不要把论文列表写成本地 Markdown。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：研究范围 / 包含与排除 / 研究脉络 / 子方向 / 问题线索 / 代表性研究与来源 / 检索覆盖与待核查项。核心含义变化时同步 `metadata.summary`。Deep Dive 材料不要预填进这篇文档。

## Artifact

用户明确要求保存方向空间图时，改用 `research-workspace` 写 `direction-map`，来源为相关 Seed / Direction。
