# CoResearch managed skill resource
"""Fetch BibTeX from DBLP then CrossRef. Usage: python3 bibtex_fetch.py --title "..." [--author "..."] [--doi "..."]"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request


def fetch(url: str, headers: dict[str, str] | None = None, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "CoResearch-paper-skills/1"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def dblp(title: str, author: str) -> str | None:
    query = urllib.parse.quote(f"{title} {author}".strip())
    data = json.loads(fetch(f"https://dblp.org/search/publ/api?q={query}&format=json&h=3"))
    hits = data.get("result", {}).get("hits", {}).get("hit") or []
    if not hits:
        return None
    key = hits[0].get("info", {}).get("key")
    if not key:
        return None
    return fetch(f"https://dblp.org/rec/{key}.bib").decode("utf-8", "ignore")


def crossref(doi: str) -> str | None:
    raw = fetch(f"https://doi.org/{doi}", headers={"Accept": "application/x-bibtex", "User-Agent": "CoResearch-paper-skills/1"})
    text = raw.decode("utf-8", "ignore").strip()
    return text or None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", default="")
    parser.add_argument("--author", default="")
    parser.add_argument("--doi", default="")
    args = parser.parse_args()
    text = None
    if args.title:
        try:
            text = dblp(args.title, args.author)
        except Exception as error:
            print(f"% VERIFY DBLP failed: {error}", file=sys.stderr)
    if not text and args.doi:
        try:
            text = crossref(args.doi)
        except Exception as error:
            print(f"% VERIFY CrossRef failed: {error}", file=sys.stderr)
    if not text:
        print("% [VERIFY] no DBLP/CrossRef hit")
        return 2
    print(text.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
