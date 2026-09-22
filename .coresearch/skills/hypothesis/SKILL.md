---
name: hypothesis
description: 为 Hypothesis 比较检验策略并形成 Approach 候选。用户说挑战假设、补充证伪条件、比较检验策略时使用。
---

# Hypothesis

核心问题：什么机制产生什么可反驳预测？  
下一阶段：Approach。比较检验策略，不用模型品牌代替路线。

## Tools

1. `canvas_get_state`。用户说「这个」时先 `canvas_get_selection`。
2. 探索：`research_workflow_advance`

```json
{ "kind": "explore", "sourceNodeIds": ["<hypothesis-id>"], "action": "<用户可见动作原文>" }
```

给出 2–4 个 Approach。说明如何覆盖预测、处理混杂、依赖哪些假设、主要取舍和失败方式。

3. 用户确认主 Approach 后 `commit`，`candidates[].nodeType` 只能是 `approach`。未采纳项留在对话。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：机制主张 / 成立条件 / 可检验预测 / 证伪条件 / 替代解释 / 支持与反对证据。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存可证伪性或检验计划时，改用 `research-workspace` 写 `hypothesis-test-plan`，来源为 Hypothesis 及必要上游节点。
