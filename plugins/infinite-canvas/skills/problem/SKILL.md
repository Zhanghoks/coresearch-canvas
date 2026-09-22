---
name: problem
description: 从已确认 Problem 提出可证伪 Hypothesis。用户说寻找支持与反证、检查问题范围、提出机制假设时使用。
---

# Problem

核心问题：我决定研究什么困难？  
下一阶段：Hypothesis。必须交代来源 RQ、范围和已有方法的具体不足。

## Tools

1. `canvas_get_state`。用户说「这个」时先 `canvas_get_selection`。
2. 探索：`research_workflow_advance`

```json
{ "kind": "explore", "sourceNodeIds": ["<problem-id>"], "action": "<用户可见动作原文>" }
```

给出 2–4 套 Hypothesis。机制、预测、证伪条件、替代解释分开写。方法名称和预期提升不是假设证据。

3. 用户确认后 `commit`，`candidates[].nodeType` 只能是 `hypothesis`。
4. 明确保存证据时用 `canvas_create_node` 建 `web` / `pdf`，连到该 Problem。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：问题表述 / 为什么重要 / 源自哪些研究问题 / 范围与非目标 / 现有方法的不足 / 证据与待核查项。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存问题与证据审计时，改用 `research-workspace` 写 `problem-evidence`，来源包含 Problem 和实际引用的证据节点。
