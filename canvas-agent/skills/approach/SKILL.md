---
name: approach
description: 把 Approach 落实为一次联合提交的 Method 与 Evaluation。用户说比较替代策略、识别取舍、联合设计 Method / Evaluation 时使用。
---

# Approach

核心问题：总体用什么策略检验？  
下一阶段：Method 与 Evaluation 必须同一次提交。

## Tools

1. `canvas_get_state`。用户说「这个」时先 `canvas_get_selection`。
2. 探索：`research_workflow_advance`

```json
{ "kind": "explore", "sourceNodeIds": ["<approach-id>"], "action": "<用户可见动作原文>" }
```

候选必须成对：一个 method（输入、步骤、输出、基线、消融）加一个 evaluation（主张—指标、对照、失败判据）。不要先定方法再补指标。

3. 用户确认后一次 `commit`，candidates 里同时包含 `method` 和 `evaluation`。只交其中一个会被工具拒绝。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：总体策略 / 对应的假设与预测 / 候选策略比较 / 取舍与限制 / 待设计的方法。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存路线取舍时，改用 `research-workspace` 写 `approach-tradeoff`，来源为被比较的 Approach。
