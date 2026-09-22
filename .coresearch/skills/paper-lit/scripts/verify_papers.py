# CoResearch managed skill resource
"""Verify candidate papers. Usage: python3 verify_papers.py --input candidates.json --output verified.json"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from search_auth import search_value

ARXIV_API = "http://export.arxiv.org/api/query"
CROSSREF = "https://api.crossref.org/works/"
S2 = "https://api.semanticscholar.org/graph/v1/paper/search"
ID_RE = re.compile(r"^(\d{4}\.\d{4,5}|[A-Za-z.-]+/\d{7})(v\d+)?$")


def ua() -> str:
    mail = search_value("verify-email") or "coresearch@local"
    return f"CoResearch-paper-lit/1 (mailto:{mail})"


def get(url: str, timeout: int = 20, extra: dict[str, str] | None = None) -> bytes:
    headers = {"User-Agent": ua(), "Accept": "application/json"}
    if extra:
        headers.update(extra)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def check_arxiv(arxiv_id: str) -> bool:
    clean = arxiv_id.split(":")[-1].rsplit("v", 1)[0] if re.search(r"v\d+$", arxiv_id) else arxiv_id.split(":")[-1]
    body = get(f"{ARXIV_API}?id_list={urllib.parse.quote(clean)}")
    root = ET.fromstring(body)
    return any(True for _ in root.findall("{http://www.w3.org/2005/Atom}entry"))


def check_doi(doi: str) -> bool:
    clean = doi.replace("https://doi.org/", "")
    get(f"{CROSSREF}{urllib.parse.quote(clean)}")
    return True


def check_title(title: str) -> bool:
    params = urllib.parse.urlencode({"query": title, "limit": 1, "fields": "title"})
    extra = {}
    key = search_value("semantic-scholar")
    if key:
        extra["x-api-key"] = key
    data = json.loads(get(f"{S2}?{params}", extra=extra))
    hits = data.get("data") or []
    if not hits:
        return False
    got = re.sub(r"\W+", " ", (hits[0].get("title") or "")).strip().lower()
    want = re.sub(r"\W+", " ", title).strip().lower()
    return want[:40] in got or got[:40] in want


def verify_one(paper: dict) -> dict:
    out = {**paper, "status": "unverified", "method": None, "reason": "no_match"}
    try:
        arxiv_id = (paper.get("arxiv_id") or "").strip()
        doi = (paper.get("doi") or "").strip()
        title = (paper.get("title") or "").strip()
        if arxiv_id and ID_RE.match(arxiv_id.split(":")[-1]):
            if check_arxiv(arxiv_id):
                return {**out, "status": "verified", "method": "arxiv", "reason": None}
        if doi:
            if check_doi(doi):
                return {**out, "status": "verified", "method": "crossref", "reason": None}
        if title:
            if check_title(title):
                return {**out, "status": "verified", "method": "s2", "reason": None}
        if not arxiv_id and not doi and not title:
            return {**out, "status": "error", "reason": "malformed"}
        return out
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as error:
        code = getattr(error, "code", None)
        if code == 404:
            return out
        return {**out, "status": "verify_pending", "reason": "transient_api_failure"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
    papers = json.loads(raw)
    verified = [verify_one(item) for item in papers]
    unverified = sum(1 for item in verified if item["status"] == "unverified")
    rate = unverified / len(verified) if verified else 0
    payload = {
        "verdict": "WARN" if rate > 0.2 or any(item["status"] == "verify_pending" for item in verified) else "PASS",
        "hallucination_rate": round(rate, 3),
        "papers": verified,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output == "-":
        print(text)
    else:
        open(args.output, "w", encoding="utf-8").write(text)
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
