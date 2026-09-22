---
name: paper-improve
description: 多轮审稿式润色论文。用户说润色论文、改写、paper improve 时使用。
---

# Paper Improve

默认 2 轮。每轮只改一类问题，不要同时大改结构和措辞。

轮次：

1. 结构：每节是否服务因果脊；删重复；Abstract 是否自洽。
2. 证据：数字、表、图是否同源；套话；术语统一。
3. 可读：长句、被动堆砌、未定义缩写。

每轮结束：

```bash
bash skills/paper-writing/scripts/compile_paper.sh paper
```

编译失败先修 TeX。submission 档再跑 `paper-claim-audit` 和 `citation-audit`。

完成标准：说明改了什么、还剩什么；给出最新 PDF 或 `NO_LATEX`。
