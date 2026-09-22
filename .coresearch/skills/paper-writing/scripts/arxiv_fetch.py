# CoResearch managed skill resource
"""arXiv Atom API. Usage: python3 arxiv_fetch.py <arxiv-id-or-search>"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

NS = {"a": "http://www.w3.org/2005/Atom"}


def query(term: str) -> str:
    if re.fullmatch(r"\d{4}\.\d{4,5}(v\d+)?", term) or term.lower().startswith("arxiv:"):
        arxiv_id = term.split(":")[-1]
        return f"http://export.arxiv.org/api/query?id_list={urllib.parse.quote(arxiv_id)}"
    return f"http://export.arxiv.org/api/query?search_query=all:{urllib.parse.quote(term)}&start=0&max_results=5"


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: arxiv_fetch.py <id-or-query>", file=sys.stderr)
        return 2
    url = query(sys.argv[1])
    req = urllib.request.Request(url, headers={"User-Agent": "CoResearch-paper-skills/1"})
    with urllib.request.urlopen(req, timeout=20) as response:
        root = ET.fromstring(response.read())
    papers = []
    for entry in root.findall("a:entry", NS):
        arxiv_id = (entry.findtext("a:id", default="", namespaces=NS) or "").rsplit("/", 1)[-1]
        papers.append({
            "id": arxiv_id,
            "title": " ".join((entry.findtext("a:title", default="", namespaces=NS) or "").split()),
            "summary": " ".join((entry.findtext("a:summary", default="", namespaces=NS) or "").split())[:800],
            "published": entry.findtext("a:published", default="", namespaces=NS),
            "authors": [author.findtext("a:name", default="", namespaces=NS) for author in entry.findall("a:author", NS)],
            "pdf": next((link.get("href") for link in entry.findall("a:link", NS) if link.get("title") == "pdf"), ""),
        })
    print(json.dumps(papers, ensure_ascii=False, indent=2))
    return 0 if papers else 1


if __name__ == "__main__":
    raise SystemExit(main())
