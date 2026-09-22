---
name: paper-scholar
description: 用 Semantic Scholar 搜已发表论文和引用数，并用 research-source 卡片列出。用户说 semantic scholar、找期刊论文、venue papers、citation search 时使用。
---

# Paper Scholar

不要注册 Pi tool。已发表 venue 用此脚本；预印本改用 `paper-arxiv`。有 `externalIds.ArXiv` 时记下，不要再去 arXiv 重拉一遍。

```bash
LIT="skills/paper-lit/scripts"
[ -f "$LIT/semantic_scholar_fetch.py" ] || LIT="canvas-agent/skills/paper-lit/scripts"
python3 "$LIT/semantic_scholar_fetch.py" search "QUERY" --max 10 --year 2022-
```

默认过滤 Computer Science / Engineering、Journal+Conference。脚本失败则警告并回到 `paper-arxiv` / `web_search`。

对话输出：每篇论文一行，包进 `research-source` 围栏。`{"kind":"paper","title":"标题","url":"真实链接","authors":"作者","summary":"一句贡献"}`。有 arXiv id 时 url 用 abs 页。

完成标准：打印带 venue 与 citationCount 的 JSON，或说明源不可用。
