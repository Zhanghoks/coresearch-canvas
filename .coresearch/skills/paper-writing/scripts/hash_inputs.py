# CoResearch managed skill resource
"""Hash paper sources for stale-audit checks. Usage: python3 hash_inputs.py <paper-dir>"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "paper")
    files = [root / "main.tex", root / "references.bib", *sorted((root / "sections").glob("*.tex"))]
    hashes = {str(path): digest(path) for path in files if path.exists()}
    out = root / ".aris" / "input-hashes.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(hashes, indent=2) + "\n")
    print(str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
