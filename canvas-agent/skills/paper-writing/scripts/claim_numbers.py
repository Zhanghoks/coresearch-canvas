# CoResearch managed skill resource
"""Compare numeric literals in TeX against result files. Usage: python3 claim_numbers.py <paper-dir> [results-dir]"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

NUMBER = re.compile(r"(?<![A-Za-z])(\d+\.\d+|\d+)(?![A-Za-z])")


def numbers_in(text: str) -> list[str]:
    return NUMBER.findall(text)


def collect_results(root: Path) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    if not root.exists():
        return found
    for path in root.rglob("*"):
        if path.suffix.lower() not in {".json", ".jsonl", ".csv", ".tsv", ".yaml", ".yml"}:
            continue
        found[str(path)] = numbers_in(path.read_text(errors="ignore"))
    return found


def main() -> int:
    paper = Path(sys.argv[1] if len(sys.argv) > 1 else "paper")
    results = Path(sys.argv[2] if len(sys.argv) > 2 else "results")
    tex_files = [paper / "main.tex", *sorted((paper / "sections").glob("*.tex"))]
    paper_numbers: dict[str, list[str]] = {}
    for path in tex_files:
        if path.exists():
            paper_numbers[str(path)] = numbers_in(path.read_text(errors="ignore"))
    result_numbers = collect_results(results)
    result_set = {value for values in result_numbers.values() for value in values}
    unmatched = sorted({value for values in paper_numbers.values() for value in values if "." in value and value not in result_set})
    report = {
        "paper_numbers": paper_numbers,
        "result_files": {key: len(value) for key, value in result_numbers.items()},
        "unmatched_decimals": unmatched,
        "has_numeric_claims": any(values for values in paper_numbers.values()),
        "has_result_files": bool(result_numbers),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["has_numeric_claims"] and not report["has_result_files"]:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
