# CoResearch managed skill resource
"""arXiv Atom API. Usage: python3 arxiv_fetch.py search QUERY [--max N] | download ID [--dir papers]"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from search_auth import search_value

NS = "http://www.w3.org/2005/Atom"
API = "http://export.arxiv.org/api/query"
ID_RE = re.compile(r"^(\d{4}\.\d{4,5}|[A-Za-z.-]+/\d{7})(v\d+)?$")


def ua() -> str:
    mail = search_value("verify-email")
    base = "CoResearch-paper-lit/1 (+https://github.com)"
    return f"{base} (mailto:{mail})" if mail else base


def normalize(value: str) -> str:
    text = value.strip()
    if "/abs/" in text:
        text = text.split("/abs/", 1)[1]
    if text.lower().startswith("arxiv:"):
        text = text.split(":", 1)[1]
    return text.rsplit("v", 1)[0] if re.search(r"v\d+$", text) else text


def fetch(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": ua()})
    for attempt in (1, 2, 3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                body = response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt == 3:
                raise RuntimeError(f"arXiv fetch failed: {error}") from error
            time.sleep(2 * attempt)
            continue
        if body.strip() == b"Rate exceeded.":
            if attempt == 3:
                raise RuntimeError("arXiv rate-limited")
            time.sleep(5 * attempt)
            continue
        return body
    raise RuntimeError("arXiv fetch failed")


def parse_entry(entry: ET.Element) -> dict:
    raw = entry.findtext(f"{{{NS}}}id") or ""
    arxiv_id = normalize(raw.rsplit("/", 1)[-1])
    title = " ".join((entry.findtext(f"{{{NS}}}title") or "").split())
    return {
        "id": arxiv_id,
        "title": title,
        "authors": [a.findtext(f"{{{NS}}}name") or "" for a in entry.findall(f"{{{NS}}}author")],
        "abstract": " ".join((entry.findtext(f"{{{NS}}}summary") or "").split())[:1200],
        "published": (entry.findtext(f"{{{NS}}}published") or "")[:10],
        "pdf": f"https://arxiv.org/pdf/{arxiv_id}.pdf",
        "abs": f"https://arxiv.org/abs/{arxiv_id}",
    }


def search(query: str, max_results: int) -> list[dict]:
    query = query.strip()
    params = {"id_list": normalize(query)} if ID_RE.match(normalize(query)) else {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    root = ET.fromstring(fetch(f"{API}?{urllib.parse.urlencode(params)}"))
    return [parse_entry(entry) for entry in root.findall(f"{{{NS}}}entry")]


def download(arxiv_id: str, output_dir: str) -> dict:
    clean = normalize(arxiv_id)
    dest_dir = Path(output_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{clean.replace('/', '_')}.pdf"
    if dest.exists() and dest.stat().st_size > 10240:
        return {"id": clean, "path": str(dest), "skipped": True}
    data = fetch(f"https://arxiv.org/pdf/{clean}.pdf", timeout=60)
    if data[:5] != b"%PDF-" and b"%PDF-" not in data[:1024]:
        raise RuntimeError("download is not a PDF")
    dest.write_bytes(data)
    return {"id": clean, "path": str(dest), "size_kb": len(data) // 1024, "skipped": False}


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    search_p = sub.add_parser("search")
    search_p.add_argument("query")
    search_p.add_argument("--max", type=int, default=10)
    down_p = sub.add_parser("download")
    down_p.add_argument("arxiv_id")
    down_p.add_argument("--dir", default="papers")
    args = parser.parse_args()
    try:
        if args.cmd == "search":
            rows = search(args.query, args.max)
            print(json.dumps(rows, ensure_ascii=False, indent=2))
            return 0 if rows else 1
        print(json.dumps(download(args.arxiv_id, args.dir), ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
