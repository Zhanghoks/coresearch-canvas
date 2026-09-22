---
name: paper-lit
description: 按 ARIS 检索并核验论文。对话里用 research-source 卡片列出论文和仓库，用户可拖到画布。用户说搜索论文、找文献、related work、literature review、arxiv 检索时使用。
---

# Paper Lit

文献检索走 ARIS 主线：多源搜索 → 核验 → 综合。用 bash 调 `skills/paper-lit/scripts/`，不要注册或调用新的 Pi tool。脚本表见 [Scripts](references/scripts.md)，来源规则见 [Sources](references/sources.md)。可选搜索密钥在 Agent 配置填写，写入 `.data/search.json`。

```bash
LIT="skills/paper-lit/scripts"
[ -f "$LIT/arxiv_fetch.py" ] || LIT="canvas-agent/skills/paper-lit/scripts"
```

先 `canvas_get_state`，用当前 Seed / Direction / Idea 做查询词。检索结果留在对话；只有用户明确说写入画布时才建「文献」`group` 和 `web`/`pdf`。

## Steps

1. 默认源：`paper-arxiv` + 已有 `web_search`。用户点名 venue/IEEE/引用量时改用 `paper-scholar`；点名机构/资助/开放引文时改用 `paper-openalex`。任一源失败则警告并继续。
2. 把候选写成 `.aris/verify-papers/candidate_papers.json`（`arxiv_id` / `doi` / `title`），改用 `paper-verify`。未核验条目标 `[UNVERIFIED]`，不丢弃，不编造 ID。
3. 按方法家族出表：Paper / Venue / Method / Key Result / Relevance / Source / 核验状态。没读全文的不写评价。
4. 若存在 `literature-wiki/`，改用 `paper-wiki` 摄入前 8–12 篇。用户要求保存综述时改用 `research-workspace`。

## 对话卡片

论文和仓库不要散落成项目符号。每条一行 JSON，包进一个 `research-source` 围栏，界面会收成可拖到画布的卡片。同一条不要在正文里再贴 URL。

- 论文：`{"kind":"paper","title":"标题","url":"https://arxiv.org/abs/xxxx.xxxxx","authors":"作者","summary":"一句贡献"}`
- 仓库：`{"kind":"repo","title":"owner/name","url":"https://github.com/owner/name","summary":"一句说明"}`

`kind` 只能是 `paper` 或 `repo`。url 必须是检索到的真实链接。summary 只写一句。用户把卡片拖到画布，或明确说写入画布时，才建节点。

完成标准：至少列出核验过的论文，或明确写出失败源与待读列表。
