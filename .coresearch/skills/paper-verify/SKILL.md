---
name: paper-verify
description: 核验候选论文是否真实存在，防止编造 arXiv/DOI。用户说核验文献、verify papers、防幻觉引用时使用。
---

# Paper Verify

不要注册 Pi tool。对 `paper-lit` 搜到的候选做 arXiv → CrossRef → Semantic Scholar 三层核验。

```bash
LIT="skills/paper-lit/scripts"
[ -f "$LIT/verify_papers.py" ] || LIT="canvas-agent/skills/paper-lit/scripts"
mkdir -p .aris/verify-papers
python3 "$LIT/verify_papers.py" --input .aris/verify-papers/candidate_papers.json --output .aris/verify-papers/verified.json
```

输入每项至少有 `arxiv_id`、`doi`、`title` 之一。输出保留全部条目：`verified` / `unverified` / `verify_pending`。不要静默丢弃，不要把未核验升成已核验，不要用手写 ID 填空。

完成标准：写出 `verified.json`，并在表里标出每篇状态。
