<!-- CoResearch managed skill resource -->
# Search sources

Default `paper-lit` sources: `arxiv` + existing `web_search`. Opt-in: `scholar`, `openalex`.

| ID | Script / tool | Use |
| --- | --- | --- |
| `arxiv` | `arxiv_fetch.py` | preprints |
| `web` | `web_search` / `fetch_content` | Scholar snippets, pages |
| `scholar` | `semantic_scholar_fetch.py` | IEEE/ACM venue + citations |
| `openalex` | `openalex_fetch.py` | open citation graph |

Dedup key order: arXiv ID → DOI → normalized title. Published venue metadata from Scholar wins over preprint; keep arXiv PDF link. A source that fails warns and continues. If every requested source fails, stop and say so.

Optional credentials are configured in Agent 配置 and stored in `.data/search.json`:

| ID | Env | Required |
| --- | --- | --- |
| `arxiv` | — | no |
| `web` | — | no |
| `semantic-scholar` | `SEMANTIC_SCHOLAR_API_KEY` | no |
| `openalex` | `OPENALEX_EMAIL` | no |
| `verify-email` | `ARIS_VERIFY_EMAIL` | no |

Do not call Zotero/Obsidian/DeepXiv/Gemini MCP. Do not add Pi tools.
