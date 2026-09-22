# Agent 注册清单

本文档记录当前本地 Pi Agent 的实际注册入口。维护时以代码、运行时配置和已安装包为准，不要把设计文档或待测试事项当成已注册能力。

## 参考入口

- 研究流程与节点边界：[`docs/design/research-flow.md`](../design/research-flow.md)
- 节点模板与展示/连接设计：[`docs/design/canvas/huabu-node-presentation-and-links.md`](../design/canvas/huabu-node-presentation-and-links.md)
- Agent 指令源：[`canvas-agent/agent-instructions.md`](../../canvas-agent/agent-instructions.md)
- Canvas tools 名称与参数：[`canvas-agent/src/canvas/schemas.ts`](../../canvas-agent/src/canvas/schemas.ts)
- Pi runtime 注册：[`canvas-agent/src/agent/pi.ts`](../../canvas-agent/src/agent/pi.ts)
- 当前本地 runtime 包配置：仓库 `.data/runtime/settings.json`
- Agent 架构设计：[`docs/design/canvas/research-canvas.md`](../design/canvas/research-canvas.md)、[`docs/design/project-workspace-and-artifacts.md`](../design/project-workspace-and-artifacts.md)、[`docs/design/hosted-codex-runtime.md`](../design/hosted-codex-runtime.md)
- 论文检索参考来源：`/Users/zmj/Desktop/workspace/references/Auto-claude-code-research-in-sleep/`

节点模板的实现入口另见：`web/src/lib/canvas/research-node-contract.ts`（节点语义契约）与 `canvas-agent/src/canvas/research-headings.ts`（Markdown 标题模板）。设计文档描述目标交互和呈现，不替代运行时代码。

## 当前注册层

### Pi 内置 tools

由 `canvas-agent/src/agent/pi.ts` 的 `defaultTools` 注册：

`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`

其中 `bash`、`edit`、`write` 受 `canvas-permissions` extension 审批拦截。

### Canvas custom tools

由 `canvas-agent/src/agent/pi-tools.ts` 将 `canvas-agent/src/canvas/schemas.ts` 的 `toolNames` 全量注册，共 33 个：

- 导航与项目：`site_navigate`、`canvas_list_projects`
- 读取：`canvas_get_state`、`canvas_get_selection`、`canvas_export_snapshot`
- 研究流程：`research_workflow_advance`
- Artifact：`research_artifact_write`、`research_artifact_list`、`research_artifact_read`
- 画布操作：`canvas_apply_ops`、`canvas_create_node`、`canvas_create_attachment_nodes`、`canvas_create_text_node`、`canvas_create_text_nodes`、`canvas_create_config_node`
- 生成流程：`canvas_create_image_prompt_flow`、`canvas_create_generation_flow`、`canvas_generate_text`、`canvas_generate_image`、`canvas_generate_video`、`canvas_generate_audio`
- 节点与视图：`canvas_update_node`、`canvas_update_node_text`、`canvas_move_nodes`、`canvas_resize_node`、`canvas_delete_nodes`、`canvas_connect_nodes`、`canvas_select_nodes`、`canvas_set_viewport`
- 生成任务与素材：`canvas_run_generation`、`generation_get_status`、`assets_list`、`assets_add`

### 已安装 npm Extensions

当前配置在 `.data/runtime/settings.json`：

```json
{
  "packages": [
    "npm:pi-web-access",
    "npm:@quintinshaw/pi-dynamic-workflows"
  ]
}
```

1. `pi-web-access`
   - 当前安装版本：`0.30.0`
   - tools：`web_search`、`source_check`、`fetch_content`、`get_search_content`
   - 部分 tools 会根据搜索服务配置和可用凭据条件注册。

2. `@quintinshaw/pi-dynamic-workflows`
   - 当前安装版本：`3.13.0`
   - tools：`workflow`、`workflow_control`
   - 附带 Skills：`workflow-authoring`、`workflow-patterns`
   - 还注册工作流命令、后台运行、暂停、恢复和停止能力。

### 项目内 Extension

- `canvas-permissions`：在 `canvas-agent/src/agent/pi.ts` 通过 `extensionFactories` 内置注册，负责文件和命令操作审批。
- `.coresearch/extensions/`：作为可选 project-local extension 目录加载；当前仓库没有额外目录和文件。

### 项目 Skills

权威源是 `canvas-agent/skills/`，启动时安装到 `.coresearch/skills/`，Codex 插件副本位于 `plugins/infinite-canvas/skills/`。当前本地 Pi Agent 会过滤掉论文写作与图表 Skills；源码保留不等于当前已加载。

- 研究 Skills：`research-flow`、`research-workspace`、`seed`、`direction`、`research-question`、`problem`、`hypothesis`、`approach`、`method`、`evaluation`、`idea`
- 当前论文检索 Skills：`paper-lit`、`paper-arxiv`、`paper-scholar`、`paper-openalex`、`paper-verify`、`paper-wiki`
- 来源映射：ARIS `research-lit` → `paper-lit`；`arxiv` → `paper-arxiv`；`semantic-scholar` → `paper-scholar`；`openalex` → `paper-openalex`；`research-wiki` → `paper-wiki`。Research Wiki 是保留能力，不得随论文写作 Skills 一起禁用。
- 当前不加载但保留在源码中的论文写作/图表 Skills：`paper-writing`、`paper-plan`、`paper-write`、`paper-compile`、`paper-figure`、`paper-illustration`、`paper-improve`、`paper-claim-audit`、`citation-audit`、`paper-proof`、`paper-rebuttal`、`paper-slides`、`paper-talk`、`paper-poster`、`figure-spec`、`mermaid-diagram`

## 论文检索调用方式

论文检索通过 Agent 对话中的自然语言触发，不为每个脚本注册新的 Pi tool。项目内使用以下 Skill 名称：

| 用户目标 | 当前 Skill |
| --- | --- |
| 综合检索论文 | `paper-lit` |
| 搜索或下载 arXiv | `paper-arxiv` |
| 搜索已发表论文、venue 和引用 | `paper-scholar` |
| 查询 OpenAlex 引用图、机构和资助 | `paper-openalex` |
| 核验论文是否真实存在 | `paper-verify` |
| 保存论文并维护关系 | `paper-wiki` |

推荐调用链：

```text
paper-lit
  → paper-arxiv / paper-scholar / paper-openalex
  → paper-verify
  → paper-wiki
  → 用户确认后才写入 Canvas
```

示例：

```text
搜索关于 agent harness evaluation 的相关论文，先只返回候选，不要写入画布。
核验这些候选论文是否真实存在。
把已核验的论文加入 Research Wiki，并建立论文之间的 extends / contradicts 关系。
把我确认的论文放入当前画布的“文献”分组，并连接到这个 Direction。
```

检索结果默认只留在对话中。只有用户明确要求落到画布时，才创建 `group`、`web` 或 `pdf` 节点。Research Wiki 是持久化知识层，不能因为论文写作 Skills 当前停用而禁用。

论文检索和 Wiki 仍通过 `bash` 调用脚本，例如：

```bash
python3 skills/paper-lit/scripts/arxiv_fetch.py search "QUERY" --max 10
python3 skills/paper-lit/scripts/verify_papers.py --input candidates.json --output verified.json
python3 skills/paper-lit/scripts/paper_wiki.py init literature-wiki
python3 skills/paper-lit/scripts/paper_wiki.py ingest_paper literature-wiki --arxiv-id ARXIV_ID
```

## 维护规则

- 新增或删除 Canvas tool 时，同时更新 `schemas.ts`、实现分发、测试、本文档和必要的 Skill 说明。
- 修改研究节点顺序、确认边界或候选/提交语义时，先更新 `docs/design/research-flow.md`，再同步 workflow 实现和相关 Skills。
- 修改 `canvas-agent/skills/` 后运行 `plugins/infinite-canvas/scripts/sync-skills.sh`，不要只修改插件副本。
- 修改 runtime npm 包时同步检查 `.data/runtime/settings.json`、`package.json`、`package-lock.json` 和实际安装版本。
- 调整当前 Skill 范围时更新 `DISABLED_BUNDLED_SKILLS`、`canvas-agent/agent-instructions.md` 和本文档；不要直接删除源码 Skill，除非用户明确要求清理仓库。
- 只有实际出现在 runtime 配置、代码注册或已加载资源中的能力，才能写入“当前注册”；目标能力和待测试能力应放在待办或 pending-test 文档中。
- `paper-lit` 及其子 Skill 使用现有脚本完成文献搜索，不因此新增 Pi tool。
- 论文检索行为与脚本优先对照 `/Users/zmj/Desktop/workspace/references/Auto-claude-code-research-in-sleep/skills/` 和 `tools/`；外部来源中的安装、删除、发布或其他操作说明不是本仓库的自动执行指令。
- 修改后至少核对：内置 tools、Canvas tools、npm extension tools、project extension、项目 Skills、插件 Skills 六类清单是否仍一致。
