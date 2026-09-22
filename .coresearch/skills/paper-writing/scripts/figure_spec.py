# CoResearch managed skill resource
"""JSON nodes/edges -> SVG. Usage: python3 figure_spec.py spec.json out.svg"""
from __future__ import annotations

import html
import json
import sys
from pathlib import Path


def box(node: dict) -> str:
    x, y, w, h = (float(node.get(key, 0)) for key in ("x", "y", "w", "h"))
    label = html.escape(str(node.get("label", node.get("id", ""))))
    shape = node.get("shape", "rect")
    if shape == "ellipse":
        return f'<ellipse cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" fill="#fff" stroke="#111" stroke-width="1.5"/>' \
            f'<text x="{x + w / 2}" y="{y + h / 2 + 4}" text-anchor="middle" font-size="12">{label}</text>'
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="#fff" stroke="#111" stroke-width="1.5"/>'
        f'<text x="{x + w / 2}" y="{y + h / 2 + 4}" text-anchor="middle" font-size="12">{label}</text>'
    )


def center(node: dict) -> tuple[float, float]:
    return float(node["x"]) + float(node.get("w", 0)) / 2, float(node["y"]) + float(node.get("h", 0)) / 2


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: figure_spec.py spec.json out.svg", file=sys.stderr)
        return 2
    spec = json.loads(Path(sys.argv[1]).read_text())
    nodes = {str(node["id"]): node for node in spec.get("nodes", [])}
    width = spec.get("width", 720)
    height = spec.get("height", 420)
    title = html.escape(str(spec.get("title", "")))
    edges = []
    for edge in spec.get("edges", []):
        if edge["from"] not in nodes or edge["to"] not in nodes:
            print(f"unknown node in edge {edge}", file=sys.stderr)
            return 1
        x1, y1 = center(nodes[edge["from"]])
        x2, y2 = center(nodes[edge["to"]])
        label = html.escape(str(edge.get("label", "")))
        edges.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#111" stroke-width="1.2" marker-end="url(#arrow)"/>'
            + (f'<text x="{(x1 + x2) / 2}" y="{(y1 + y2) / 2 - 6}" text-anchor="middle" font-size="10">{label}</text>' if label else "")
        )
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#111"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="{width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="600">{title}</text>
  {''.join(edges)}
  {''.join(box(node) for node in nodes.values())}
</svg>
'''
    Path(sys.argv[2]).write_text(svg)
    print(sys.argv[2])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
