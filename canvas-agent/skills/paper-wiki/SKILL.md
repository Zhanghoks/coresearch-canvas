---
name: paper-wiki
description: 把已核验论文写入本地 literature wiki，记录 typed 关系。用户说文献库、research wiki、ingest paper、论文知识库时使用。
---

# Paper Wiki

不要注册 Pi tool。只存 Paper 实体和边，不把 Idea / Experiment / Claim 写入 wiki（那些在画布）。脚本见 [Scripts](../paper-lit/references/scripts.md)。

```bash
LIT="skills/paper-lit/scripts"
[ -f "$LIT/paper_wiki.py" ] || LIT="canvas-agent/skills/paper-lit/scripts"
python3 "$LIT/paper_wiki.py" init literature-wiki
python3 "$LIT/paper_wiki.py" ingest_paper literature-wiki --arxiv-id 1706.03762 --thesis "..."
python3 "$LIT/paper_wiki.py" add_edge literature-wiki --from paper:slug_a --to paper:slug_b --type extends --evidence "..."
```

边类型：`extends` / `contradicts` / `addresses_gap` / `inspired_by` / `supersedes`。按 `(from,to,type)` 去重。目标页不存在时警告，不阻塞。`## Connections` 由边生成，不要手改。无 arXiv 时用 `--title --authors --year`。

完成标准：`literature-wiki/papers/<slug>.md` 存在或已跳过重复，并更新 `index.md`。
