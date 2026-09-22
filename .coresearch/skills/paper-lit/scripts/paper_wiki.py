# CoResearch managed skill resource
"""Paper-only wiki. Usage: python3 paper_wiki.py init|ingest_paper|add_edge DIR ..."""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

NS = "http://www.w3.org/2005/Atom"
EDGE_TYPES = {"extends", "contradicts", "addresses_gap", "inspired_by", "supersedes"}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(title: str, author: str, year: int) -> str:
    last = re.sub(r"[^a-z0-9]+", "", (author.split()[-1] if author else "anon").lower())
    words = re.findall(r"[a-z0-9]+", title.lower())
    key = "_".join(words[:4]) or "paper"
    return f"{last}{year}_{key}"[:80]


def fetch_arxiv(arxiv_id: str) -> dict:
    url = f"http://export.arxiv.org/api/query?id_list={urllib.parse.quote(arxiv_id)}"
    req = urllib.request.Request(url, headers={"User-Agent": "CoResearch-paper-lit/1"})
    with urllib.request.urlopen(req, timeout=20) as response:
        root = ET.fromstring(response.read())
    entry = root.find(f"{{{NS}}}entry")
    if entry is None:
        raise RuntimeError(f"arXiv miss: {arxiv_id}")
    authors = [a.findtext(f"{{{NS}}}name") or "" for a in entry.findall(f"{{{NS}}}author")]
    title = " ".join((entry.findtext(f"{{{NS}}}title") or "").split())
    published = (entry.findtext(f"{{{NS}}}published") or "")[:4]
    abstract = " ".join((entry.findtext(f"{{{NS}}}summary") or "").split())
    return {"arxiv_id": arxiv_id, "title": title, "authors": authors, "year": int(published or 0), "venue": "arXiv", "abstract": abstract}


def init_wiki(root: Path) -> None:
    for name in ("papers", "graph"):
        (root / name).mkdir(parents=True, exist_ok=True)
    (root / "graph" / "edges.jsonl").touch()
    for name, text in {
        "index.md": "# Literature wiki\n\n(empty)\n",
        "log.md": f"# Log\n\n- {now()} wiki initialized\n",
        "query_pack.md": "# Query pack\n\n(empty)\n",
    }.items():
        path = root / name
        if not path.exists():
            path.write_text(text, encoding="utf-8")
    print(f"Wiki initialized: {root}")


def append_log(root: Path, line: str) -> None:
    with (root / "log.md").open("a", encoding="utf-8") as file:
        file.write(f"- {now()} {line}\n")


def rebuild(root: Path) -> None:
    pages = sorted((root / "papers").glob("*.md"))
    lines = ["# Literature wiki\n", f"{len(pages)} papers\n"]
    for page in pages:
        title = next((ln[2:].strip() for ln in page.read_text(encoding="utf-8").splitlines() if ln.startswith("# ")), page.stem)
        lines.append(f"- [{title}](papers/{page.name})")
    (root / "index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    pack = ["# Query pack\n", "Top papers:\n"]
    pack.extend(lines[2:14])
    (root / "query_pack.md").write_text("\n".join(pack) + "\n", encoding="utf-8")


def ingest_paper(root: Path, arxiv_id: str, title: str, authors: str, year: int, venue: str, thesis: str) -> None:
    if not (root / "papers").exists():
        raise RuntimeError("run init first")
    meta = {}
    if arxiv_id:
        try:
            meta = fetch_arxiv(arxiv_id)
        except Exception as error:
            if not title:
                raise
            print(f"WARN: {error}; using manual metadata", file=sys.stderr)
            meta = {"arxiv_id": arxiv_id, "title": title, "authors": [a.strip() for a in authors.split(",") if a.strip()], "year": year, "venue": venue or "arXiv", "abstract": ""}
    else:
        if not (title and authors and year):
            raise RuntimeError("manual ingest needs --title --authors --year")
        meta = {"arxiv_id": "", "title": title, "authors": [a.strip() for a in authors.split(",") if a.strip()], "year": year, "venue": venue or "unknown", "abstract": ""}
    slug = slugify(meta["title"], meta["authors"][0] if meta["authors"] else "", int(meta.get("year") or 0))
    page = root / "papers" / f"{slug}.md"
    if page.exists():
        print(f"Paper already ingested: {page.name}")
        return
    author_yaml = json.dumps(meta["authors"], ensure_ascii=False)
    body = f"""---
type: paper
node_id: paper:{slug}
title: {json.dumps(meta["title"], ensure_ascii=False)}
authors: {author_yaml}
year: {meta.get("year") or 0}
venue: {json.dumps(meta.get("venue") or "unknown", ensure_ascii=False)}
external_ids:
  arxiv: {json.dumps(meta.get("arxiv_id") or None)}
added: {now()}
---

# {meta["title"]}

## One-line thesis

{thesis or meta.get("abstract", "")[:280]}

## Connections

[AUTO-GENERATED from graph/edges.jsonl — do not edit]

## Abstract (original)

> {meta.get("abstract") or ""}
"""
    page.write_text(body, encoding="utf-8")
    rebuild(root)
    append_log(root, f"ingest_paper {page.name}")
    print(f"Paper ingested: {page.name}")


def add_edge(root: Path, from_id: str, to_id: str, edge_type: str, evidence: str) -> None:
    if edge_type not in EDGE_TYPES:
        raise RuntimeError(f"unknown edge type {edge_type}")
    targets = {f"paper:{p.stem}" for p in (root / "papers").glob("*.md")}
    if to_id not in targets:
        print(f"WARN: dangling target {to_id}", file=sys.stderr)
    edges = root / "graph" / "edges.jsonl"
    existing = edges.read_text(encoding="utf-8") if edges.exists() else ""
    key = f"{from_id}\t{to_id}\t{edge_type}"
    if any(key == "\t".join([json.loads(line).get("from", ""), json.loads(line).get("to", ""), json.loads(line).get("type", "")]) for line in existing.splitlines() if line.strip()):
        print("Edge exists; skip")
        return
    with edges.open("a", encoding="utf-8") as file:
        file.write(json.dumps({"from": from_id, "to": to_id, "type": edge_type, "evidence": evidence, "added": now()}, ensure_ascii=False) + "\n")
    append_log(root, f"add_edge {from_id} -{edge_type}-> {to_id}")
    print("Edge added")


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    init_p = sub.add_parser("init")
    init_p.add_argument("root")
    ingest_p = sub.add_parser("ingest_paper")
    ingest_p.add_argument("root")
    ingest_p.add_argument("--arxiv-id", default="")
    ingest_p.add_argument("--title", default="")
    ingest_p.add_argument("--authors", default="")
    ingest_p.add_argument("--year", type=int, default=0)
    ingest_p.add_argument("--venue", default="")
    ingest_p.add_argument("--thesis", default="")
    edge_p = sub.add_parser("add_edge")
    edge_p.add_argument("root")
    edge_p.add_argument("--from", dest="from_id", required=True)
    edge_p.add_argument("--to", required=True)
    edge_p.add_argument("--type", dest="edge_type", required=True)
    edge_p.add_argument("--evidence", default="")
    args = parser.parse_args()
    try:
        if args.cmd == "init":
            init_wiki(Path(args.root))
        elif args.cmd == "ingest_paper":
            ingest_paper(Path(args.root), args.arxiv_id, args.title, args.authors, args.year, args.venue, args.thesis)
        else:
            add_edge(Path(args.root), args.from_id, args.to, args.edge_type, args.evidence)
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
