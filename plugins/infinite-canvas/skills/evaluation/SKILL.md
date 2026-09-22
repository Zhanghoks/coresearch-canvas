---
name: evaluation
description: 审计 Evaluation 能否支持或反驳主张，并判断能否进入 Idea 综合。用户说检查是否检验假设、补充失败判据、综合为 Idea 时使用。
---

# Evaluation

核心问题：什么结果支持或反驳主张？  
探索动作不创建 Idea。综合改为 `idea` Skill 的 `synthesize`。

## Tools

1. `canvas_get_state`。
2. 探索：`research_workflow_advance`

```json
{ "kind": "explore", "sourceNodeIds": ["<evaluation-id>"], "action": "<用户可见动作原文>" }
```

逐项审计主张—指标、数据、基线、失败判据、成本和泛化。缺口指回对应上游，不自动建 Idea。

3. 用户明确要求形成 Idea 时改用 `idea` Skill，不要在本 Skill 里 `commit` 一个 idea。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：主张与指标对应 / 主要与次要指标 / 数据与基线 / 实验条件 / 失败判据 / 成本与泛化 / 计划和已有结果。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存评测矩阵时，改用 `research-workspace` 写 `evaluation-matrix`，来源为 Evaluation 及其检验对象。
