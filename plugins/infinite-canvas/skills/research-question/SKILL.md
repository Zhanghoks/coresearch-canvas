---
name: research-question
description: 把 Research Question 收窄为可研究的 Problem 候选。用户说收窄问题、核查已有工作、提出 Problem 候选时使用。
---

# Research Question

核心问题：具体想知道什么？  
下一阶段：Problem。问题线索不是已经核实的研究空白。

## Tools

1. `canvas_get_state`。用户说「这个」时先 `canvas_get_selection`。
2. 探索：`research_workflow_advance`

```json
{ "kind": "explore", "sourceNodeIds": ["<rq-id>"], "action": "<用户可见动作原文>" }
```

给出 2–4 个 Problem。每个说明来源 RQ、范围、非目标、已有处理与具体不足。未检索到 ≠ 从未有人做过。

3. 用户确认后 `commit`，`candidates[].nodeType` 只能是 `problem`。
4. 明确保存证据时用 `canvas_create_node` 建 `web` / `pdf` 并连到该 RQ 或来源 Direction。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：研究问题 / 对象与条件 / 已有处理 / 尚不确定的部分 / 来源与核查范围。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存问题比较时，改用 `research-workspace` 写 `rq-comparison`，来源为被比较的 Research Question。
