---
name: mermaid-diagram
description: 把流程写成 Mermaid 并导出 SVG。用户说 mermaid、流程图、状态图时使用。
---

# Mermaid Diagram

用于控制流、状态机、时序。架构分层优先 `figure-spec`。

1. 把图写成 `figures/mermaid/<name>.mmd`。节点 id 用字母数字，标签用引号。
2. 有 `mmdc` 时导出 SVG；否则保留 `.mmd` 并说明缺渲染器。

```bash
mkdir -p figures/mermaid
# 有 mermaid-cli 时：
mmdc -i figures/mermaid/flow.mmd -o figures/mermaid/flow.svg
python3 skills/paper-writing/scripts/manifest.py "mermaid" figures/mermaid/
```

完成标准：`.mmd` 可渲染，或明确 `NO_MMDC`。
