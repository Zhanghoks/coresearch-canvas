<!-- CoResearch managed skill resource -->
# Paper scripts

Cwd is `.coresearch`. Do not register these as Pi tools. Call them with `bash`.

```bash
PAPER_SCRIPTS="skills/paper-writing/scripts"
[ -f "$PAPER_SCRIPTS/bib_hygiene.py" ] || PAPER_SCRIPTS="canvas-agent/skills/paper-writing/scripts"
```

| Script | Done when |
| --- | --- |
| `paper_scaffold.py <dir>` | `paper/main.tex` exists |
| `bibtex_fetch.py --title "..." [--author "..."]` | prints BibTeX or `VERIFY` |
| `arxiv_fetch.py <id-or-query>` | prints JSON metadata |
| `bib_hygiene.py paper/` | uncited keys removed or listed |
| `extract_cites.py paper/` | JSON of cite keys + sentences |
| `claim_numbers.py paper/ [results/]` | JSON of paper numbers vs result files |
| `hash_inputs.py paper/` | writes `paper/.aris/input-hashes.json` |
| `verify_audits.py paper/ --assurance draft\|submission` | exit 0/1, writes `.aris/audit-verifier-report.json` |
| `figure_spec.py spec.json out.svg` | SVG written |
| `compile_paper.sh paper/` | PDF or a missing-toolchain report |

Network scripts may use the system network. Never invent BibTeX.
