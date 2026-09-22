---
name: seed
description: 澄清研究兴趣并从 Seed 探索 Direction 候选。用户说澄清 Seed、探索研究方向、查相关研究、我对什么感兴趣时使用。
---

# Seed

核心问题：我对什么感兴趣？  
下一阶段：Direction。保留原话与整理后的主题理解，不写入方法、贡献或评价方案。

## Tools

1. `canvas_get_state` 定位 Seed。用户说「这个」时先 `canvas_get_selection`。
2. 探索：

```json
{ "kind": "explore", "sourceNodeIds": ["<seed-id>"], "action": "<用户可见动作原文>" }
```

调用 `research_workflow_advance`。按返回的 `prompt` 在对话里给出 3–6 个可比较 Direction。每条用下面的格式，界面会收成可拖到画布的方向卡片。正文用节点标题称呼节点，不要写 `seed-…` 这类内部 id。

**D1. 标题** — 轴：分类轴
- 核心判断：一句
- 范围 / 排除：…
- 依据：…
- 取舍：…

3. 用户明确说保留 / 采用 / 写入后：

```json
{
  "kind": "commit",
  "sourceNodeIds": ["<seed-id>"],
  "confirmation": "<用户确认原文>",
  "candidates": [{ "nodeType": "direction", "title": "…", "summary": "…", "document": "…" }]
}
```

`nodeType` 只能是 `direction`。查相关研究先在对话比较；明确保存证据才创建 `web` / `pdf`。

## Document

读完整 `metadata.document` 后整篇改写。保留用户正文与自定义 `##`。权威骨架：原始输入 / 当前主题理解 / 相关概念 / 待澄清的问题。核心含义变化时同步 `metadata.summary`。

## Artifact

用户明确要求保存 Seed 梳理时，改用 `research-workspace` 写 `seed-brief`，`sourceNodeIds` 只放相关 Seed。
