# CoResearch managed skill resource
"""OpenAlex works search. Usage: python3 openalex_fetch.py search QUERY [--max N] [--year 2022-]"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request

from search_auth import search_value

API = "https://api.openalex.org/works"


def mailto() -> str:
    return search_value("openalex") or search_value("verify-email") or "coresearch@local"


def search(query: str, max_results: int, year: str) -> list[dict]:
    params = {
        "search": query,
        "per-page": str(max(1, min(max_results, 25))),
        "mailto": mailto(),
        "sort": "relevance_score:desc",
    }
    filters = []
    if year.endswith("-") and year[:-1].isdigit():
        filters.append(f"from_publication_date:{year[:-1]}-01-01")
    elif year.isdigit():
        filters.append(f"publication_year:{year}")
    if filters:
        params["filter"] = ",".join(filters)
    req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}", headers={"User-Agent": f"mailto:{mailto()}"})
    with urllib.request.urlopen(req, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
    rows = []
    for item in data.get("results") or []:
        ids = item.get("ids") or {}
        rows.append({
            "id": item.get("id"),
            "title": item.get("display_name"),
            "year": item.get("publication_year"),
            "doi": (ids.get("doi") or "").replace("https://doi.org/", ""),
            "arxiv": (item.get("ids") or {}).get("arxiv") or "",
            "cited_by": item.get("cited_by_count"),
            "venue": ((item.get("primary_location") or {}).get("source") or {}).get("display_name"),
            "url": ids.get("landing_page") or item.get("id"),
            "institutions": [inst.get("display_name") for inst in ((item.get("authorships") or [{}])[0].get("institutions") or [])][:4],
        })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("cmd", choices=["search"])
    parser.add_argument("query")
    parser.add_argument("--max", type=int, default=10)
    parser.add_argument("--year", default="")
    args = parser.parse_args()
    try:
        rows = search(args.query, args.max, args.year)
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0 if rows else 1
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
