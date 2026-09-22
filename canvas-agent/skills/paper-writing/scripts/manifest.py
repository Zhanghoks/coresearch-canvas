# CoResearch managed skill resource
"""Append a MANIFEST.md row. Usage: python3 manifest.py <title> <path>"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: manifest.py <title> <path>", file=sys.stderr)
        return 2
    title, target = sys.argv[1], sys.argv[2]
    path = Path("MANIFEST.md")
    if not path.exists():
        path.write_text("# Manifest\n\n| Time | Title | Path |\n| --- | --- | --- |\n")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with path.open("a") as handle:
        handle.write(f"| {stamp} | {title} | {target} |\n")
    print(str(path.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
