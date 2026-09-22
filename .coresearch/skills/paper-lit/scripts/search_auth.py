# CoResearch managed skill resource
"""Read literature search credentials from env or repo .data/search.json."""
from __future__ import annotations

import json
import os
from pathlib import Path

ENV_BY_ID = {
    "semantic-scholar": "SEMANTIC_SCHOLAR_API_KEY",
    "openalex": "OPENALEX_EMAIL",
    "verify-email": "ARIS_VERIFY_EMAIL",
}


def search_value(api_id: str) -> str:
    env_name = ENV_BY_ID.get(api_id, "")
    if env_name:
        current = os.environ.get(env_name, "").strip()
        if current:
            return current
    data = _read_file()
    return str(data.get(api_id) or "").strip()


def _read_file() -> dict:
    for start in (Path.cwd(), Path(__file__).resolve().parent):
        for root in [start, *start.parents]:
            path = root / ".data" / "search.json"
            if path.is_file():
                try:
                    value = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    return {}
                return value if isinstance(value, dict) else {}
    return {}
