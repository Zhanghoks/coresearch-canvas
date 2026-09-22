<!-- CoResearch managed skill resource -->
# Paper search scripts

Cwd is `.coresearch`. Do not register these as Pi tools. Call them with `bash`.

```bash
LIT="skills/paper-lit/scripts"
[ -f "$LIT/arxiv_fetch.py" ] || LIT="canvas-agent/skills/paper-lit/scripts"
```

| Script | Done when |
| --- | --- |
| `arxiv_fetch.py search "QUERY" --max 10` | JSON list of arXiv papers |
| `arxiv_fetch.py download ARXIV_ID --dir papers` | PDF under `papers/` or skip-if-exists |
| `semantic_scholar_fetch.py search "QUERY" --max 10` | JSON list of venue papers |
| `openalex_fetch.py search "QUERY" --max 10` | JSON list of OpenAlex works |
| `verify_papers.py --input candidates.json --output verified.json` | each row tagged verified / unverified / verify_pending |
| `paper_wiki.py init literature-wiki` | `literature-wiki/papers/` exists |
| `paper_wiki.py ingest_paper literature-wiki --arxiv-id ID` | `papers/<slug>.md` or skip-if-exists |
| `paper_wiki.py add_edge literature-wiki --from paper:A --to paper:B --type extends --evidence "..."` | edge appended, dangling target warned |

Sources and dedup: [sources.md](sources.md). Network scripts use the system network. Optional keys come from Agent 配置 / `.data/search.json` / env. Never invent arXiv IDs, DOIs, or BibTeX.
