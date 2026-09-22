---
name: paper-claim-audit
description: 核对正文数字是否来自实验结果。用户说核对数字、claim audit、数字对不上时使用。
---

# Paper Claim Audit

读 [Assurance](../paper-writing/references/assurance.md)。

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
python3 "$PAPER_SCRIPTS/claim_numbers.py" paper results
```

脚本扫 TeX 数字并对照 `results/`。对每个数字：

- 能对上：记 `PAPER_CLAIM_AUDIT.json` 为 supported，附文件路径。
- 对不上：标 mismatch，不改实验结果去迁就正文。
- 无数据：标 `DATA_NEEDED`，正文加 HTML 注释缺口。

```bash
python3 "$PAPER_SCRIPTS/verify_audits.py" paper --assurance "$(cat paper/.aris/assurance.txt 2>/dev/null || echo draft)"
```

用户要求保存时用 `research-workspace` kind `paper-audit`。

完成标准：JSON 覆盖正文中的百分比、倍数和表格数字。
