---
name: paper-compile
description: 编译 paper/ 为 PDF 并报告页数与未定义引用。用户说编译论文、latexmk、出 PDF 时使用。
---

# Paper Compile

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
bash "$PAPER_SCRIPTS/compile_paper.sh" paper
python3 "$PAPER_SCRIPTS/hash_inputs.py" paper
```

退出码 3 表示没有 LaTeX 工具：报告 `NO_LATEX`，不要假装已生成 PDF。

成功后检查：`paper/main.pdf` 存在；日志里 undefined reference/citation 为 0 或列出剩余项；对照 venue 页数。

完成标准：给出 PDF 路径或 `NO_LATEX`，以及未定义引用列表。
