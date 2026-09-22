# CoResearch 后端数据管理设计

> 状态：目标架构设计；本仓库当前尚未完成 Research DB、对象存储、Project membership 或 Canvas projection 迁移。
>
> 相关实现规格：[Project、Workspace 与 Artifact](./project-workspace-and-artifacts.md)、[托管 Codex Runtime](./hosted-codex-runtime.md)、[Research Flow](./research-flow.md)。

## 1. 核心原则

后端数据管理只保留一套研究事实，并把运行时、展示层和派生产物分开：

> **Project 是权限与数据隔离边界；Research DB 是研究对象真值；Canvas 是投影；Workspace 是 Agent 可写工作目录；Research Wiki 是 Project 内长期文献知识库；Paper Workspace 是论文生产目录。**

因此，以下文件或目录都不能各自成为研究事实的第二来源：

```text
canvas.json
literature-wiki/
paper/
Artifact
session JSONL
```

它们分别是 Canvas materialization、Wiki materialization、论文工作区、不可变派生产物或运行时记录；需要重建时应从数据库和对象存储重新生成。

## 2. 顶层对象关系

```text
User
  │ membership
  ▼
Project                         # 权限与隔离边界
  ├── Research Space            # 研究对象真值
  │     ├── Seed
  │     ├── Direction
  │     ├── Research Element
  │     ├── Research Question
  │     └── Idea
  │
  ├── Research Wiki             # Project 内长期文献知识
  │     ├── Paper
  │     ├── Paper Source
  │     ├── Paper Section / Fragment
  │     ├── Reading
  │     └── Paper Relation
  │
  ├── Canvas / Spaces            # 研究对象的 UI 投影
  │     ├── Node Projection
  │     ├── Edge Projection
  │     └── Group Projection
  │
  ├── Agent Workspace            # Pi / Codex 的 cwd
  ├── Sessions / Runs
  ├── Artifacts
  └── Paper Workspaces            # 论文生产目录
        ├── Plan
        ├── Draft
        ├── Figures
        ├── Audits
        └── Output
```

Project 不再按 `userId` 作为权威目录归属。用户通过 membership 访问 Project：

```text
projects/<projectId>/
project_members(project_id, user_id, role)
```

`userId` 来自 JWT，只用于身份和 membership 校验；不能决定 Project 的权威数据路径。

## 3. 三类存储及权威性

| 存储层 | 内容 | 权威性 |
|---|---|---|
| PostgreSQL / Research DB | Project、membership、Research Entity、关系、Revision、Group、Wiki metadata、Idea Anchor、状态 | 研究对象和关系的真值 |
| Object Storage | PDF、解析全文、图片、附件、Artifact 正文、编译 PDF | 大文件内容的真值 |
| Project Workspace | `AGENTS.md`、Skills、论文源码、临时文件、脚本产物 | Agent 工作区，不是研究知识真值 |

Research DB 负责“是什么、属于谁、与什么有关、当前哪个 revision”；Object Storage 负责“文件内容是什么”；Workspace 负责 Agent 在一次工作中的可写文件环境。

## 4. Project 与权限边界

目标请求链：

```text
Browser
  → Auth / JWT
  → ProjectResolver
  → ownership / membership check
  → ProjectContext
       ├── Research DB API
       ├── Canvas Projection API
       ├── Agent Runtime
       └── Object Storage API
```

服务端根据 JWT、URL 的 `projectId` 和 membership 生成 `ProjectContext`。请求体、Agent prompt 和 Tool input 不得提供可信租户范围。

```ts
type ProjectContext = {
  userId: string;        // JWT only
  projectId: string;     // URL + membership
  canvasId: string;      // server lookup
  projectRoot: string;   // server-derived
  workspaceRoot: string; // server-derived
  dataRoot: string;      // server-derived
  sessionId?: string;
  runId?: string;
};
```

所有业务表带 `project_id`，即使当前已经通过 join 可以推导，也为后续 RLS、审计和查询隔离保留显式边界。

## 5. Research Entity

统一 registry 先覆盖当前研究主流程：

```text
research_entities
  id
  project_id
  type                    # seed / direction / research_element /
                          # research_question / idea
  created_by
  created_at
  updated_at
  archived_at
```

Entity 的正文不应被 Canvas Node 或 Markdown 文件独占。需要版本化时使用独立 revision：

```text
research_entity_revisions
  id
  entity_id
  project_id
  revision
  title
  summary
  document
  status                  # draft / confirmed / superseded / archived
  created_by
  created_at
```

研究流程中的确认仍遵循：

```text
Agent proposes → User confirms → Research DB commits revision
```

未确认的候选只属于 Conversation / Run，不自动成为 Research Entity。

## 6. Paper 与 Project Paper

Paper 需要与 Project 内的使用方式分离。同一篇论文可以被多个 Project 使用：

```text
papers                         # 可复用的全局论文目录
  id
  doi
  arxiv_id
  semantic_scholar_id
  title
  authors
  year
  venue

project_papers                 # Project 对论文的关系
  project_id
  paper_id
  status
  added_by
  first_seen_run_id
  created_at
```

Project 不重复保存 Paper metadata，但各自可以拥有不同的：

- 阅读状态
- 阅读笔记
- Paper Relation
- Idea Anchor
- 研究问题关联

## 7. Canvas 是 Projection

Canvas Node 不再等同于 Research Entity：

```text
Research Entity
      ↓ projection
Canvas Node
```

```text
canvas_nodes
  id
  project_id
  canvas_id
  entity_type
  entity_id
  x
  y
  width
  height
  display_state

canvas_edges
  id
  project_id
  canvas_id
  source_node_id
  target_node_id
  relation_type

canvas_groups
  id
  project_id
  canvas_id
  type
  title

canvas_group_members
  group_id
  node_id
  order_index
```

同一个 Research Entity 可以投影到同一 Project 的多个 Canvas：

```text
Direction dir_123
  ├── Canvas A / node_789
  └── Canvas B / node_456
```

位置、尺寸、视口、选区和显示状态属于 Canvas projection；标题、正文、revision、确认状态和研究关系属于 Research DB。

## 8. Group 与 provenance

Group 不是 Research Entity，不进入 `research_entities`。它可以同时表达：

1. UI 上的分组；
2. 一次 Agent Run 或研究动作产生的 provenance。

例如：

```text
research_groups
  id
  project_id
  canvas_id
  type                    # direction_exploration / deep_dive / literature
  source_entity_id
  source_run_id
  title

research_group_members
  group_id
  entity_id
  order_index
```

这样可以回答：“这些对象是否是同一次 Direction Exploration 或 Deep Dive 产生的？”而不把 Group 误当成新的研究对象。

## 9. Research Wiki

Research Wiki 是 Project 内持续积累的文献知识层。当前文件型 `literature-wiki/` 是 materialization，不是唯一真值。

目标核心表：

```text
papers
paper_sources
paper_sections
paper_fragments
project_papers
paper_readings
paper_relations
```

一篇论文可以有多个来源版本：

```text
Paper
  ├── arXiv v1
  ├── arXiv v2
  ├── publisher PDF
  └── HTML
```

`Paper Fragment` 必须属于具体 `paper_source_id`，不能只属于 Paper；否则版本更新后页码、段落和原文证据会漂移。

研究对象应引用 Fragment，而不是只引用 Paper：

```text
Problem / Idea
  ↓ evidence
Paper → Paper Source → Section → Fragment
```

`index.md`、`query_pack.md`、`log.md` 和 literature report 都是 Derived View，可以从 Research DB、Object Storage 和事件记录重建；不能反过来作为系统判断 Wiki 内容的唯一依据。

## 10. Idea Anchor

Wiki 不直接拥有 Idea。Wiki 描述“世界里有哪些研究”；Idea Anchor 描述“用户的 Idea 如何理解和使用这些研究”。

```text
idea_anchors
  id
  project_id
  idea_id
  idea_section_id
  idea_section_revision_id
  paper_id
  paper_source_id
  paper_fragment_id
  relation                 # supports / contradicts / similar_method /
                           # motivates / evaluation_basis / prior_art
  created_at
```

因此不要在 Paper 或 Fragment 上维护一套反向 `ideaIds` 真值；反向查询通过 Anchor 关系完成。

## 11. Workspace、Artifact 与 Paper Workspace

目标本地 materialization：

```text
<hostDataRoot>/projects/<projectId>/
  workspace/
    AGENTS.md
    skills/
    scratch/

  data/
    sessions/
    artifacts/<artifactId>/
    cache/

  wiki/
    papers/<paperId>/
      manifest.json
      sources/<sourceId>/
        source.pdf
        normalized.md
        sections.json
        extraction.json

  paper-workspaces/<paperWorkspaceId>/
    manifest.json
    plan/
    draft/
    figures/
    bibliography/
    audits/
    output/
```

Artifact 仍然是 Project-scoped、immutable、带来源的派生产物；Paper Workspace 是论文生产目录，不是 Research Entity 或 Wiki 的真值。

## 12. 与当前本地实现的关系

当前仓库仍是本地过渡形态：

| 当前实现 | 目标架构 |
|---|---|
| `.coresearch/` 全机共享 Agent cwd | 每个 Project 独立 `workspace/` |
| `.data/users/<userId>/projects/<hash>/` | `<hostDataRoot>/projects/<projectId>/` |
| `canvas.json` / 浏览器本地 Canvas 数据 | Research DB + Canvas projection |
| `canvas-agent` 文件型 Project store | Project-scoped DB / object storage service |
| `literature-wiki/` Markdown / JSONL | Research DB + source materialization |
| `.data/sessions/` | Project DataRoot / runtime storage |
| `paper/` | Paper Workspace |

本设计不授权当前任务直接迁移路径、IndexedDB/localStorage key、ProjectFileStore 或现有 Canvas 数据；迁移需要单独设计备份、回滚和兼容边界。

## 13. 数据不变量

- 任何 Research Entity、Paper Relation、Group、Anchor、Artifact 都必须属于一个 Project 或通过 Project membership 可达。
- `project_id` 只能由服务端 ProjectContext 推导，不能由模型或请求体指定。
- Canvas projection 删除不能删除 Research Entity；Research Entity 归档也不能静默删除历史 projection。
- Paper Source 删除或替换不能静默改写已有 Fragment 的来源。
- Derived View、cache、session 和日志损坏时可以重建或隔离，不能覆盖 Research DB 真值。
- Agent 只能提出研究对象和关系；用户确认后才提交 Research DB 或 Canvas projection 的产品状态。
- 任何新建存储层都必须先说明其真值归属，不能引入第二套不可追溯的对象 registry。

## 14. 暂不定案

本文不设定以下运行边界：

- 一 Project 一 container / VM 的隔离方案
- timeout、idle recycle、并发上限、token TTL 和 body size
- Postgres migration、RLS policy 和 `project_members` 的具体 SQL
- Research DB 的 ORM、事件总线和索引实现
- Object Storage 厂商与 PDF 解析实现
- Research Wiki 的 embedding、全文检索和增量索引方案

这些边界需要独立的实现规格和验证证据，不能由本数据模型文档隐式决定。
