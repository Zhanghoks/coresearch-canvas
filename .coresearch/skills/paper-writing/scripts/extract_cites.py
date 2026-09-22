# CoResearch managed skill resource
"""Extract cite keys and surrounding sentences. Usage: python3 extract_cites.py <paper-dir>"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def sentences_around(text: str, start: int, end: int) -> str:
    left = text.rfind(".", 0, start)
    right = text.find(".", end)
    chunk = text[(left + 1 if left >= 0 else 0):(right + 1 if right >= 0 else len(text))]
    return " ".join(chunk.split())


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "paper")
    rows = []
    for path in [root / "main.tex", *sorted((root / "sections").glob("*.tex"))]:
        if not path.exists():
            continue
        text = path.read_text(errors="ignore")
        for match in re.finditer(r"\\cite[a-zA-Z]*\{([^}]*)\}", text):
            keys = [part.strip() for part in match.group(1).split(",") if part.strip()]
            line = text[:match.start()].count("\n") + 1
            rows.append({
                "file": str(path),
                "line": line,
                "keys": keys,
                "sentence": sentences_around(text, match.start(), match.end()),
            })
    print(json.dumps(rows, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
