---
name: paper-figure
description: 从实验结果生成论文数据图和对比表。用户说画实验图、ablation 图、结果表时使用。
---

# Paper Figure

读 `PAPER_PLAN.md` 的 Figure Plan。架构图改用 `figure-spec`，概念插图改用 `paper-illustration`。

1. 只使用 `results/`、`figures/`、`outputs/` 或用户给出的 JSON/CSV。没有数据就列出缺口，不画假曲线。
2. 用 bash 写 matplotlib/seaborn 脚本到 `figures/scripts/`，生成 PDF/PNG，并写 `figures/latex_includes.tex`。
3. 图注写比较对象，不写「如图所示」。
4. 记录数据文件路径，供 `paper-claim-audit` 核对。

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
python3 "$PAPER_SCRIPTS/manifest.py" "figures" figures/
```

完成标准：每个 HIGH 优先级图要么有文件，要么有明确的手工/数据缺口。
