---
name: idea
description: 把已选择的 Problem、Hypothesis、Approach、Method、Evaluation 综合为 Idea，或审阅现有 Idea。用户说综合为 Idea、形成 Idea 草稿、审阅推理链、检查证据缺口时使用。
---

# Idea

核心问题：已选择对象形成什么研究？  
综合必须引用已选择的 Problem、Hypothesis、Approach、Method、Evaluation。Review 不写入新的核心研究对象。

目标节点模型见 [Research Entity Node / Group / Section](../../../docs/design/canvas/research-entity-node-model.md)。Idea 是由可独立追问、验证和替换的 Sections 组成的持续演化对象；Method、Claim、Evaluation 等 Section 的局部检索不能自动重写整个 Idea。当前工具仍以完整 Idea 节点文档为写入边界，Section-level replacement 和 dependency check 尚未实现，不能在 Agent 回复中声称已经可用。

## Tools

1. `canvas_get_state`，收集用户实际选择的上游节点 ID。
2. 形成 Idea：`research_workflow_advance`

```json
{
  "kind": "synthesize",
  "sourceNodeIds": ["<problem-id>", "<hypothesis-id>", "<approach-id>", "<method-id>", "<evaluation-id>"],
  "confirmation": "<用户请求形成 Idea 的原文>",
  "candidates": [{ "nodeType": "idea", "title": "…", "summary": "…", "document": "…" }]
}
```

每次一份 Idea。工具会把真实来源连上。缺任一必需上游会被拒绝。

3. 审阅已有 Idea：`kind=explore`，source 为该 Idea。只做逻辑、证据、最近邻与风险审计。用户接受某项修改后，回到对应上游 Skill 重新 explore/commit，再重新 synthesize。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：研究概述 / 上游对象与用户决定 / 问题与机制 / 方法与验证 / 与最近邻工作的差异 / 证据缺口 / 风险与下一步。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存审阅报告时，改用 `research-workspace` 写 `idea-review`；明确要求导出完整研究说明时写 `export`。两者都必须引用真实来源节点。
