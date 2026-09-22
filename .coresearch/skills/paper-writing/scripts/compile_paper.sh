# CoResearch managed skill resource
# compile_paper.sh — try latexmk, then pdflatex. Usage: bash compile_paper.sh <paper-dir>
set -euo pipefail
ROOT="${1:-paper}"
cd "$ROOT"
if command -v latexmk >/dev/null 2>&1; then
  latexmk -pdf -interaction=nonstopmode main.tex
  echo "compiled with latexmk"
  exit 0
fi
if command -v pdflatex >/dev/null 2>&1; then
  pdflatex -interaction=nonstopmode main.tex
  if command -v bibtex >/dev/null 2>&1; then bibtex main || true; fi
  pdflatex -interaction=nonstopmode main.tex
  pdflatex -interaction=nonstopmode main.tex
  echo "compiled with pdflatex"
  exit 0
fi
echo "NO_LATEX: install latexmk or pdflatex" >&2
exit 3
