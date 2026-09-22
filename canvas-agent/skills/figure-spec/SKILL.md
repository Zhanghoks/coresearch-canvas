---
name: figure-spec
description: 用 JSON 规格生成确定性架构/流程图 SVG。用户说架构图、pipeline 图、figure spec 时使用。
---

# Figure Spec

适合分层架构、工作流、拓扑。数据曲线用 `paper-figure`。

写 `figures/specs/<name>.json`：

```json
{
  "title": "Method overview",
  "width": 720,
  "height": 360,
  "nodes": [{"id": "a", "label": "Encode", "x": 40, "y": 80, "w": 120, "h": 48}],
  "edges": [{"from": "a", "to": "b", "label": "z"}]
}
```

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
python3 "$PAPER_SCRIPTS/figure_spec.py" figures/specs/overview.json figures/overview.svg
python3 "$PAPER_SCRIPTS/manifest.py" "figure-spec" figures/overview.svg
```

未知 node id 时脚本失败：先修 JSON。完成标准：SVG 可打开，节点与边和规格一致。
