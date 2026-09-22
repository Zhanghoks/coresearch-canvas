# CoResearch managed skill resource
"""Gate ARIS-style paper audit JSON. Usage: python3 verify_audits.py <paper-dir> --assurance draft|submission"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

MANDATORY = {
    "PAPER_CLAIM_AUDIT.json": "paper-claim-audit",
    "CITATION_AUDIT.json": "citation-audit",
    "PROOF_AUDIT.json": "paper-proof",
}
ALLOWED = {"PASS", "WARN", "FAIL", "NOT_APPLICABLE", "BLOCKED", "ERROR"}
BLOCKING = {"FAIL", "BLOCKED", "ERROR"}
REQUIRED = {"audit_skill", "verdict", "reason_code", "summary", "generated_at"}


def load(path: Path) -> dict:
    return json.loads(path.read_text())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paper_dir")
    parser.add_argument("--assurance", default="")
    args = parser.parse_args()
    root = Path(args.paper_dir)
    assurance_file = root / ".aris" / "assurance.txt"
    assurance = args.assurance or (assurance_file.read_text().strip() if assurance_file.exists() else "draft")
    rows = []
    blocking = False
    for filename, skill in MANDATORY.items():
        path = root / filename
        row = {"file": filename, "skill": skill, "status": "MISSING"}
        if not path.exists():
            if assurance == "submission":
                blocking = True
            rows.append(row)
            continue
        try:
            data = load(path)
        except Exception as error:
            row.update({"status": "SCHEMA_INVALID", "error": str(error)})
            blocking = True
            rows.append(row)
            continue
        missing = sorted(REQUIRED - set(data))
        verdict = str(data.get("verdict", ""))
        if missing or verdict not in ALLOWED:
            row.update({"status": "SCHEMA_INVALID", "missing": missing, "verdict": verdict})
            blocking = True
        elif assurance == "submission" and verdict in BLOCKING:
            row.update({"status": "BLOCKING_VERDICT", "verdict": verdict})
            blocking = True
        else:
            row.update({"status": "OK", "verdict": verdict})
        rows.append(row)
    report = {
        "assurance": assurance,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
        "ok": not blocking,
    }
    out = root / ".aris" / "audit-verifier-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not blocking else 1


if __name__ == "__main__":
    raise SystemExit(main())
