---
name: paper-writing
description: ARIS Workflow 3：从叙事报告做到可投稿 PDF。用户说写论文全流程、从报告到 PDF、paper writing pipeline 时使用。
---

# Paper Writing

编排：`paper-plan` → `paper-figure` / `figure-spec` → `paper-write` → `paper-compile` → `paper-improve` → 审计门禁。

常量：默认 venue `ICLR`，assurance `draft`，AUTO_PROCEED 仅在用户明确说「一路做完」时为 true。脚本与门禁见 [Scripts](references/scripts.md)、[Assurance](references/assurance.md)、[Writing](references/writing-principles.md)、[Canvas](references/canvas-bridge.md)。

## Phase 0

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
mkdir -p paper/.aris
echo draft > paper/.aris/assurance.txt   # 或 submission
python3 "$PAPER_SCRIPTS/paper_scaffold.py" paper
```

用户说投稿/submission/max 时写成 `submission`。

## Phase 1–5

1. 改用 `paper-plan`。完成标准：`PAPER_PLAN.md` 有 Claims-Evidence Matrix。用户未说一路做完则停下来出示大纲。
2. 数据图用 `paper-figure`；架构图用 `figure-spec`。完成标准：`figures/` 有文件或已标明手工图缺口。
3. 改用 `paper-write`。完成标准：`paper/sections/*.tex` 可编译，bib 只含引用条目。
4. 改用 `paper-compile`。完成标准：有 `paper/main.pdf`，或脚本报告 `NO_LATEX`。
5. 改用 `paper-improve`（默认 2 轮）。然后：
   - 有数字则 `paper-claim-audit`
   - 有 `\cite` 则 `citation-audit`
   - 有 theorem 则 `paper-proof`
   - `python3 "$PAPER_SCRIPTS/verify_audits.py" paper --assurance <level>`

## Phase 6

`verify_audits.py` 非 0 时不得宣称 submission-ready。用户要求保存时用 `research-workspace` 写 `paper-draft` / `paper-audit`。

完成标准：给出 `paper/main.pdf`（或 NO_LATEX）、assurance 级别、审计 JSON 路径。
