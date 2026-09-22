---
name: paper-slides
description: 把论文收成会议幻灯。用户说做 slides、组会 PPT、talk slides 时使用。
---

# Paper Slides

默认 Beamer，除非用户指定 Markdown/reveal。结构：问题 → 方法一张总图 → 关键结果 2–4 页 → 局限。不要把论文章节逐页粘贴。

每页一个主张。数字必须来自已审计表格。缺数据标缺口页，不编造。

写出 `paper/slides.tex` 或 `paper/slides.md`。有 Beamer 时用 `latexmk` 编 PDF。

完成标准：页数与时长匹配（约 1 页/分钟），有标题页和结论页。
