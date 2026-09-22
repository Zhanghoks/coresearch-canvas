---
name: paper-plan
description: 从 Idea 或叙事报告生成论文大纲与 Claims-Evidence Matrix。用户说写大纲、paper outline、论文规划时使用。
---

# Paper Plan

读 [Writing](../paper-writing/references/writing-principles.md) 和 [Canvas](../paper-writing/references/canvas-bridge.md)。

1. `canvas_get_state`，收集 Idea / Method / Evaluation 文档。没有则读 `NARRATIVE_REPORT.md` 或请用户用 3 句说明贡献。
2. 抽出 3–5 条可证伪 claim，建 Claims-Evidence Matrix。无证据的格子标 `needs evidence`，不编造实验。
3. 选定 venue 与页数（默认 ICLR 9 页正文）。结构 5–8 节，服务一条因果脊：缺口 → 问题 → 方法 → 证据。
4. 规划 Figure/Table 与引用槽。风格参考只影响结构密度，不抄写参考论文用语。
5. 写出 `PAPER_PLAN.md`（title、one-sentence contribution、matrix、逐节要点、figure plan、citation plan）。
6. 用户要求保存时：`research-workspace` kind `paper-plan`，`sourceNodeIds` 用真实 Idea/上游 ID。

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
python3 "$PAPER_SCRIPTS/manifest.py" "PAPER_PLAN" PAPER_PLAN.md
```

完成标准：每条 claim 都有证据状态；hero figure 写清比较什么。
