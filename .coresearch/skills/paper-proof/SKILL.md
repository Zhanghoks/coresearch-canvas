---
name: paper-proof
description: 审查定理、引理和证明是否自洽。用户说核对证明、theorem audit 时使用。
---

# Paper Proof

薄封装：本仓库没有独立证明核验器。

1. 列出 `theorem`/`lemma`/`proposition`/`corollary` 与对应 proof。
2. 检查假设是否在正文出现、符号是否先定义、证明是否引用未证明步骤。
3. 缺口标 `PROOF_GAP`，不要补假证明。
4. 写出 `PROOF_AUDIT.json`：`{ "theorems": [{"id": "...", "status": "ok|gap", "note": "..."}] }`。无定理时写空数组。

```bash
python3 skills/paper-writing/scripts/verify_audits.py paper --assurance "$(cat paper/.aris/assurance.txt 2>/dev/null || echo draft)"
```

完成标准：每个定理有 status。
