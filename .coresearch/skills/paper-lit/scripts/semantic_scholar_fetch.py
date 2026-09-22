# CoResearch managed skill resource
"""Semantic Scholar Graph API. Usage: python3 semantic_scholar_fetch.py search QUERY [--max N] [--year 2022-] [--min-citations N]"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from search_auth import search_value

API = "https://api.semanticscholar.org/graph/v1"
FIELDS = "paperId,title,abstract,year,venue,publicationTypes,url,authors,externalIds,citationCount,tldr,openAccessPdf"


def headers() -> dict[str, str]:
    out = {"User-Agent": "CoResearch-paper-lit/1", "Accept": "application/json"}
    key = search_value("semantic-scholar")
    if key:
        out["x-api-key"] = key
    return out


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers=headers())
    last: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            last = error
            if error.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(f"S2 HTTP {error.code}") from error
        except (urllib.error.URLError, TimeoutError) as error:
            last = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"S2 failed: {last}")


def row(paper: dict) -> dict:
    tldr = paper.get("tldr") or {}
    return {
        "paperId": paper.get("paperId"),
        "title": paper.get("title"),
        "year": paper.get("year"),
        "venue": paper.get("venue"),
        "citationCount": paper.get("citationCount"),
        "authors": [a.get("name") for a in (paper.get("authors") or [])],
        "externalIds": paper.get("externalIds") or {},
        "url": paper.get("url"),
        "tldr": tldr.get("text") if isinstance(tldr, dict) else tldr,
        "abstract": (paper.get("abstract") or "")[:800],
    }


def search(query: str, max_results: int, year: str, min_citations: int) -> list[dict]:
    params = {
        "query": query,
        "limit": str(max(1, min(max_results, 100))),
        "fields": FIELDS,
        "fieldsOfStudy": "Computer Science,Engineering",
        "publicationTypes": "JournalArticle,Conference",
    }
    if year:
        params["year"] = year
    if min_citations:
        params["minCitationCount"] = str(min_citations)
    data = get(f"{API}/paper/search?{urllib.parse.urlencode(params)}")
    return [row(item) for item in data.get("data") or []]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("cmd", choices=["search"])
    parser.add_argument("query")
    parser.add_argument("--max", type=int, default=10)
    parser.add_argument("--year", default="")
    parser.add_argument("--min-citations", type=int, default=0)
    args = parser.parse_args()
    try:
        rows = search(args.query, args.max, args.year, args.min_citations)
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0 if rows else 1
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
