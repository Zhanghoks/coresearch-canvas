---
name: canvas
description: 操作当前研究画布，读取节点、创建研究卡片、改摘要、连线，或在用户明确要求时触发生成。
---

# CoResearch Canvas

你正在帮助用户操作 CoResearch 研究画布。需要理解或改动画布时，优先使用已配置的 `infinite-canvas` MCP 工具；不要让用户手动复制 JSON、URL 或 token。

目标实体分层见 [Research Entity Node / Group / Section](../../../docs/design/canvas/research-entity-node-model.md)：Entity Node 是长期研究实体，Group 是探索运行的视觉/provenance 容器，Section 是 Node 内部可寻址内容。该文档是目标设计；当前 runtime 仍使用既有研究节点和本地 Canvas 模型。

## 工作流

- 如果用户还没有打开或连接网页画布，使用 `open-canvas` 技能打开画布，不要要求用户手动复制 URL 或 token。
- 操作前先用 `canvas_get_state` 读取当前画布；如果用户明确提到选中内容、当前节点或“这个”，先用 `canvas_get_selection`。
- 研究主流程节点类型：`seed`、`direction`、`research_question`、`problem`、`hypothesis`、`approach`、`method`、`evaluation`、`idea`。卡片短摘要在 `metadata.summary`，长文在 `metadata.document`。
- 展开某个 Direction、写详细解说或 Deep Dive 时，先在对话中给出候选和依据；只有用户明确要求修订该节点时才写回。
- 搜索论文时创建 `web`/`pdf` 节点和「文献」`group`，连到对应 Direction；不要把论文列表写成本地 Markdown。
- 推进研究主流程时按节点改用 `seed` / `direction` / `research-question` / `problem` / `hypothesis` / `approach` / `method` / `evaluation` / `idea` Skill；工具仍是 `research_workflow_advance`（`explore` → 用户确认 → `commit`，Idea 用 `synthesize`）。不得用普通创建或批量操作工具绕过阶段与确认校验。
- 用户明确要求修订已有研究卡片时使用 `canvas_update_node`，同时维护 `metadata.summary` 和 `metadata.document`；提问、搜索或展开本身不等于同意写入。
- 创建普通文本才用 `canvas_create_text_node`。
- 只有用户明确要求生成图片、视频、音频或文本时，才用 `canvas_generate_text`、`canvas_generate_image`、`canvas_generate_video`、`canvas_generate_audio`。
- 需要把提示词、配置和生成节点串成流程时，使用 `canvas_create_generation_flow` 或项目已有的流程工具。
- 需要批量增删改、移动、连接节点或设置视口时，使用 `canvas_apply_ops`。
- 不要模拟鼠标点击，不要要求用户手动复制 JSON。
- 写入画布的操作会由网页侧边栏做二次确认，按当前工具结果继续推进即可。

## 风格

- 页面文案和画布节点内容默认使用中文。
- 生成节点、配置节点和提示词节点要保持结构清晰，方便用户继续编辑。
- 批量创建节点时注意给节点留出间距，不要堆叠在同一个位置。
- 图片、视频、音频等媒体节点默认保留原始比例；只有用户明确要求自由变形时才改变比例。
- 生成流程尽量少而清楚，优先让用户一眼能看懂节点关系。
