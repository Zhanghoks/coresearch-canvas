---
name: paper-flow
description: 把写论文、大纲、LaTeX、编译、图表、引用审计、返修或讲稿路由到对应 paper Skill。用户说写论文、投稿、rebuttal、幻灯或海报时使用。
---

# Paper Flow

论文 Skill 走 ARIS 主线，用 bash 调 `skills/paper-writing/scripts/`，不要注册或调用新的 Pi tool。画布桥见 [Canvas bridge](../paper-writing/references/canvas-bridge.md)。脚本表见 [Scripts](../paper-writing/references/scripts.md)。

先 `canvas_get_state`。有 Idea 时以 Idea 文档为叙事来源；没有则问用户要 NARRATIVE_REPORT 或主题。

| 用户意图 | Skill |
| --- | --- |
| 写论文全流程 / 从报告到 PDF | `paper-writing` |
| 写大纲 / paper plan | `paper-plan` |
| 写 LaTeX / 起草章节 | `paper-write` |
| 编译 PDF | `paper-compile` |
| 实验图、对比表 | `paper-figure` |
| 架构/流程矢量图 | `figure-spec` |
| Mermaid 流程图 | `mermaid-diagram` |
| 方法示意图 | `paper-illustration` |
| 核对数字 | `paper-claim-audit` |
| 核对引用 | `citation-audit` |
| 证明审查 | `paper-proof` |
| 润色循环 | `paper-improve` |
| 审稿意见 / rebuttal | `paper-rebuttal` |
| 幻灯 | `paper-slides` |
| 海报 | `paper-poster` |
| 演讲稿 | `paper-talk` |
| 搜索论文 / 找文献 / 相关工作 | `paper-lit` |

完成标准：点名并改用上表 Skill，不在本文件里写 LaTeX。
