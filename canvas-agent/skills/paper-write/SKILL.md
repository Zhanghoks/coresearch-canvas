---
name: paper-write
description: 按大纲逐节写 LaTeX。用户说写论文、draft LaTeX、开始写章节时使用。
---

# Paper Write

需要 `PAPER_PLAN.md`。没有则先改用 `paper-plan`。原则见 [Writing](../paper-writing/references/writing-principles.md)。

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
python3 "$PAPER_SCRIPTS/paper_scaffold.py" paper
```

已有 `paper/` 时先备份到 `paper-backup-<timestamp>/`。

1. 按大纲创建或对齐 `paper/sections/*.tex`，`main.tex` 只 `\input` 仍存在的文件，删掉不再引用的旧节。
2. 逐节写完整 LaTeX。Abstract 150–250 词、自洽、含一条具体结果。Related Work ≥1 页，按方法家族组织。缺证据处写 `<!-- DATA_NEEDED: ... -->`，不编数字。
3. 每个 `\cite` 的 BibTeX 用脚本取，不凭记忆写：

```bash
python3 "$PAPER_SCRIPTS/bibtex_fetch.py" --title "..." --author "..."
# 或
python3 "$PAPER_SCRIPTS/arxiv_fetch.py" 1706.03762
python3 "$PAPER_SCRIPTS/bib_hygiene.py" paper
```

4. 去套话（delve/pivotal/landscape）、统一术语、核对摘要数字与表格是否同一来源。
5. 匿名投稿不要写作者单位。

完成标准：`bib_hygiene.py` 无 MISSING；无 TODO/TBD（DATA_NEEDED 除外）；章节文件与 `\input` 一致。
