---
name: paper-arxiv
description: 用 arXiv API 搜索或下载预印本，并用 research-source 卡片列出论文。用户说 search arxiv、下 arxiv PDF、arxiv 检索时使用。
---

# Paper arXiv

不要注册 Pi tool。预印本检索用脚本，出版 venue 改用 `paper-scholar`。

```bash
LIT="skills/paper-lit/scripts"
[ -f "$LIT/arxiv_fetch.py" ] || LIT="canvas-agent/skills/paper-lit/scripts"
python3 "$LIT/arxiv_fetch.py" search "QUERY" --max 10
python3 "$LIT/arxiv_fetch.py" download ARXIV_ID --dir papers
```

查询像 `2401.12345` 时直接 `download`。默认只搜元数据；用户明确说下载才 `download`。脚本失败则改用 `web_search`，不要编造 arXiv ID。

对话输出：每篇论文一行 JSON，包进 `research-source` 围栏，不要再列一遍链接。`{"kind":"paper","title":"标题","url":"https://arxiv.org/abs/xxxx.xxxxx","authors":"作者","summary":"一句贡献"}`。url 用 abs 页。

完成标准：打印 JSON 列表，或给出 PDF 路径 / 失败原因。
