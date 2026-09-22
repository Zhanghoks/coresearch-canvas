# CoResearch managed skill resource
"""Keep only cited BibTeX keys. Usage: python3 bib_hygiene.py <paper-dir>"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def cited_keys(tex: str) -> set[str]:
    keys: set[str] = set()
    for match in re.finditer(r"\\cite[a-zA-Z]*\{([^}]*)\}", tex):
        keys.update(part.strip() for part in match.group(1).split(",") if part.strip())
    return keys


def split_entries(bib: str) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for block in re.split(r"(?=@\w+\{)", bib):
        match = re.match(r"@\w+\{([^,]+),", block.strip())
        if match:
            entries.append((match.group(1).strip(), block.strip()))
    return entries


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "paper")
    tex_files = [root / "main.tex", *sorted((root / "sections").glob("*.tex"))]
    tex = "\n".join(path.read_text(errors="ignore") for path in tex_files if path.exists())
    cited = cited_keys(tex)
    bib_path = root / "references.bib"
    if not bib_path.exists():
        print("missing references.bib", file=sys.stderr)
        return 1
    entries = split_entries(bib_path.read_text(errors="ignore"))
    dead = sorted({key for key, _ in entries} - cited)
    missing = sorted(cited - {key for key, _ in entries})
    kept = [body for key, body in entries if key in cited]
    bib_path.write_text("\n\n".join(kept) + ("\n" if kept else ""))
    print(f"cited={len(cited)} kept={len(kept)} dead={len(dead)} missing={len(missing)}")
    if dead:
        print("DEAD " + " ".join(dead))
    if missing:
        print("MISSING " + " ".join(missing))
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
