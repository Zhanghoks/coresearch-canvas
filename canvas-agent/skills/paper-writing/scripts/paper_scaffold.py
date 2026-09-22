# CoResearch managed skill resource
"""Create a venue-agnostic paper/ tree. Usage: python3 paper_scaffold.py [paper-dir]"""
from __future__ import annotations

import sys
from pathlib import Path

MAIN = r"""\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb,booktabs,graphicx,hyperref,natbib}
\input{math_commands}
\title{Working Title}
\author{Anonymous Authors}
\begin{document}
\maketitle
\begin{abstract}
\input{sections/0_abstract}
\end{abstract}
\input{sections/1_introduction}
\input{sections/2_related_work}
\input{sections/3_method}
\input{sections/4_experiments}
\input{sections/5_conclusion}
\bibliographystyle{plainnat}
\bibliography{references}
\appendix
\input{sections/A_appendix}
\end{document}
"""

MATH = r"""\newcommand{\R}{\mathbb{R}}
\newcommand{\E}{\mathbb{E}}
\DeclareMathOperator*{\argmin}{arg\,min}
\DeclareMathOperator*{\argmax}{arg\,max}
"""

SECTIONS = {
    "0_abstract": "% abstract body only\n",
    "1_introduction": "\\section{Introduction}\n",
    "2_related_work": "\\section{Related Work}\n",
    "3_method": "\\section{Method}\n",
    "4_experiments": "\\section{Experiments}\n",
    "5_conclusion": "\\section{Conclusion}\n",
    "A_appendix": "\\section{Appendix}\n",
}


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "paper")
    sections = root / "sections"
    figures = root / "figures"
    aris = root / ".aris"
    sections.mkdir(parents=True, exist_ok=True)
    figures.mkdir(exist_ok=True)
    aris.mkdir(exist_ok=True)
    (root / "main.tex").write_text(MAIN)
    (root / "math_commands.tex").write_text(MATH)
    (root / "references.bib").touch()
    for name, body in SECTIONS.items():
        path = sections / f"{name}.tex"
        if not path.exists():
            path.write_text(body)
    print(str(root.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
