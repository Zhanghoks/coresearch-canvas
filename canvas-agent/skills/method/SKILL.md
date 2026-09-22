---
name: method
description: 审查 Method 是否覆盖假设，并修订对齐的 Evaluation。用户说细化实施步骤、检查基线与消融、对齐评价方案时使用。
---

# Method

核心问题：如何实施？  
下一阶段：Evaluation 修订。区分计划与已完成实现，不捏造实验结果。

## Tools

1. `canvas_get_state`，连同相连 Evaluation 一起读。
2. 探索：`research_workflow_advance`

```json
{ "kind": "explore", "sourceNodeIds": ["<method-id>"], "action": "<用户可见动作原文>" }
```

指出 Method 与 Evaluation 的覆盖缺口，提出需要补充的 Evaluation 候选。

3. 用户确认修订后 `commit`，`candidates[].nodeType` 只能是 `evaluation`。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：对应的主张 / 输入与数据 / 实施步骤 / 输出 / 基线与消融 / 实现状态与限制 / 对应的评价方案。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存实施协议时，改用 `research-workspace` 写 `method-protocol`，来源为 Method 及其关联 Hypothesis / Evaluation。
