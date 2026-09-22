---
name: paper-openalex
description: 用 OpenAlex 搜开放引文、机构与资助，并用 research-source 卡片列出论文。用户说 openalex、开放引文、机构合作、funding 文献时使用。
---

# Paper OpenAlex

不要注册 Pi tool。开放引文图用此脚本；预印本用 `paper-arxiv`，venue/引用数用 `paper-scholar`。

```bash
LIT="skills/paper-lit/scripts"
[ -f "$LIT/openalex_fetch.py" ] || LIT="canvas-agent/skills/paper-lit/scripts"
python3 "$LIT/openalex_fetch.py" search "QUERY" --max 10 --year 2022-
```

与 Scholar 重复时：引用数/venue 以 Scholar 为准，机构字段保留 OpenAlex。无 API Key。失败则警告并继续其他源。

对话输出：每篇论文一行，包进 `research-source` 围栏。`{"kind":"paper","title":"标题","url":"真实链接","authors":"作者","summary":"一句贡献"}`。

完成标准：打印 JSON，或说明源不可用。
