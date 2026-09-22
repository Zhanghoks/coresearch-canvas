---
name: citation-audit
description: 核对每条引用是否支持所在句子。用户说核对引用、citation audit、引用对不上时使用。
---

# Citation Audit

读 [Assurance](../paper-writing/references/assurance.md)。

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
python3 "$PAPER_SCRIPTS/extract_cites.py" paper
python3 "$PAPER_SCRIPTS/bib_hygiene.py" paper
```

对每条 cite：读 bib 摘要或用已有 `web_search`/`fetch_content` 核对句子是否被该文献支持。不支持则改句子、换文献或删除引用。禁止把未读论文塞进 Related Work。

写出 `CITATION_AUDIT.json`（key、sentence、verdict、note）。

```bash
python3 "$PAPER_SCRIPTS/verify_audits.py" paper --assurance "$(cat paper/.aris/assurance.txt 2>/dev/null || echo draft)"
```

完成标准：每个 `\cite` 都有 verdict；MISSING_IN_BIB 为 0。
