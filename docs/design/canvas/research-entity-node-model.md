# Research Entity Node / Group / Section 设计

- 状态：目标设计；不表示当前 Canvas runtime 已完成迁移。
- 范围：定义研究实体、探索分组、实体内部 Section、关系和 Agent context 的共同语义。
- 关联：[Research Flow](../research-flow.md)、[研究画布](./research-canvas.md)、[Huabu 领域映射](./huabu-domain-binding.md)、[Idea 结构设计](../idea-structure.md)。
- 当前边界：本仓库当前仍使用既有研究节点和 plain JSON Canvas 数据模型；本设计不伪造服务端 Research Domain、revision 校验或自动 stale 传播。

## 1. 三层模型

```text
Entity Node = 可以独立指代、追问、引用、版本化的研究实体
Group       = 一次探索产生的一组实体的视觉与 provenance 容器
Section     = 实体内部可独立聚焦、追问、替换的内容单元
```

- Entity Node 承载长期研究身份和跨流程关系。
- Group 只解释一批 Node 为什么一起出现、由哪次运行产生以及如何布局；Group 不承载研究结论。
- Section 有自己的 ID 和证据引用，但默认不占用 Canvas 一级节点；它通过所属 Node 被访问或投影。

## 2. V1 Entity Node

V1 只保留六种一级实体：

| Node | 语义 | 长期存在 |
|---|---|---|
| Seed | 用户最初的研究兴趣 | 是 |
| Direction | 一块具体研究空间 | 是 |
| Paper | 一篇真实论文 | 是 |
| Research Element | 从论文中抽出的明确研究事实或概念 | 是 |
| Research Question | 用户决定继续追问的问题 | 是 |
| Idea | 用户正在形成的研究设计 | 是 |

`Research Element` 使用 subtype 区分 `problem`、`method`、`evaluation`、`result`、`limitation`。这些 subtype 不各自建立一套平行顶层领域模型。

### 2.1 Seed

Seed 卡片保持轻量：

```text
Seed { id, title, originalInput, currentFraming, status, revision }
```

Seed 通过 `derives` / `derived_from` 关系连接 Direction，不提前包含 Problem、Method、Novelty 或 Evaluation。

### 2.2 Direction

```text
Direction {
  id, title, summary, scope,
  sourceSeedId, refinedFromDirectionId?,
  evidencePaperIds[], status, revision
}
```

Direction 可以形成 `Coding Agent Evaluation → Process Evaluation → Execution Behavior Quality` 的细化链。`refines` 表示研究空间变窄或表述变准确，不表示前一个方向被删除。

### 2.3 Paper

Paper 是稳定的真实论文身份：

```text
Paper {
  id, doi?, arxivId?, s2Id?,
  title, authors, year, venue,
  abstract, summary, wikiRef, fullTextStatus, sectionIds[]
}
```

全文、版本、元数据和原文片段归 Research Wiki；Canvas Paper Node 是 Paper Entity 的 projection。身份去重和版本关系不能靠 Canvas 标题匹配代替。

### 2.4 Research Element

```text
ResearchElement {
  id,
  type: problem | method | evaluation | result | limitation,
  title, statement, detail, directionId,
  evidenceRefs[], revision
}
```

`evidenceRefs` 必须精确到 Paper 和 Paper Section：

```text
{ paperId, paperSectionId, role }
```

没有 Section 级证据时可以显示 `needs_verification`，不能把只有 Paper 标题的关联伪装成精确支持。

### 2.5 Research Question

```text
ResearchQuestion {
  id, question, scope,
  derivedFromElementIds[], evidencePaperIds[],
  literatureStatus, revision
}
```

RQ 可以由 `problem` / `limitation` / `result` 通过 `motivates` 或 `raises_question` 产生。RQ 不自动声明 Gap、Novelty 或 Problem。

### 2.6 Idea

Idea Canvas 卡片保持简单，完整内容打开后按 Section 展示：

```text
Idea {
  id, title, summary, currentSemanticVersion,
  reviewStatus, sectionIds[]
}
```

Idea Section：

```text
IdeaSection {
  id, ideaId, type, currentContent,
  sourceEntityIds[], evidenceRefs[], revision, reviewStatus
}
```

V1 的 Idea Section 类型为 `problem`、`research_question`、`core_claim`、`method`、`evaluation`、`evidence`、`risk`、`contribution`。用户点击 Method Section 做 Prior Art Search 时，只更新该 Section 的 Evidence / Proposal，不重做整个 Idea。

## 3. Paper Section

Paper Section 是 Paper 内部可寻址的证据单元，不是一级 Canvas Node：

```text
PaperSection {
  id, paperId,
  type: problem | method | evaluation | result | limitation | other,
  title, summary, sourceLocation, sourceTextRef
}
```

Section 的 `summary` 和 `sourceLocation` 必须可回到 Research Wiki 的原文版本。只能访问摘要时只能形成摘要级 Section，不得补造全文实验细节。

用户点击 Paper 的 Method Section 时，Agent context 自动绑定：

```text
Direction + Paper + Paper Section + source evidence
```

## 4. Group

Group 是统一的视觉与 provenance 容器，不为每种探索场景复制一套实体：

```text
Group {
  id,
  type: direction_exploration | direction_refinement | deep_dive
      | rq_exploration | method_exploration | evaluation_exploration,
  title,
  sourceEntityIds[], childNodeIds[], runId?, createdAt
}
```

示例：

```text
Group: direction_exploration
source: Seed A
children: Direction 1, Direction 2, Direction 3

Group: deep_dive
source: Direction 3
children: Paper A, Paper B, Method M, Limitation L, Evaluation E
```

Group 负责运行来源、子 Node 的默认布局、折叠和整体浏览；不负责保存研究语义、不自动确认候选、不替代 Node 关系，也不是 Paper、RQ 或 Idea 的长期身份。

## 5. 关系

V1 优先使用少量有明确端点的关系：

| From | Relation | To | 含义 |
|---|---|---|---|
| Seed | `derives` | Direction | Seed 探索出了方向 |
| Direction | `refines` | Direction | 方向被进一步收窄 |
| Paper | `about` | Direction | 论文涉及该方向 |
| Paper | `supports` / `contradicts` | Research Element | 论文支持或挑战判断 |
| Method | `addresses` | Problem / Limitation | 方法处理什么困难 |
| Evaluation | `evaluates` | Method / Claim | 如何检验方法或主张 |
| Result | `result_of` | Method | 结果来自哪个方法 |
| Result | `measured_by` | Evaluation | 结果如何测量 |
| Problem / Limitation | `motivates` | Research Question | RQ 从哪里产生 |
| Result | `raises_question` | Research Question | 结果引出新的追问 |
| Research Question | `guides` | Method / Evaluation | RQ 约束设计和评价 |
| Idea | `grounded_in` | Research Question | Idea 的核心问题 |
| Idea | `uses` | Method | Idea 当前方案 |
| Idea | `evaluated_by` | Evaluation | Idea 如何验证 |
| Idea | `motivated_by` | Limitation | Idea 为什么出现 |
| Idea | `supported_by` | Paper | 重要相关证据 |

关系必须校验合法端点和来源。引用关系、主题相近、方法继承、支持、冲突和用户选择不能用同一个无语义 Edge 表示。

## 6. Agent Context 与 Canvas 投影

```text
Ask Paper Section
  = Direction + Paper + Paper Section + source evidence

Polish Direction
  = Seed + current Direction + user feedback + related evidence

Form Research Question
  = Direction + selected Research Elements + supporting Sections

Check Idea Method Section
  = Idea + current Method Section + dependent Sections + prior-art evidence
```

读取 Section 不等于写入 Canvas；搜索结果先进入 Research Wiki / Conversation。只有用户明确 Accept、Save、Confirm 或等价动作，才创建或替换 Entity Node / Section。

Canvas 推荐投影：

```text
Seed
  ↓
Direction Exploration Group
  ├─ Direction A
  ├─ Direction B
  └─ Direction C

Selected Direction
  ↓
Deep Dive Group
  ├─ Paper Nodes
  ├─ Research Element Nodes
  └─ 可展开的 Paper Sections

Research Question
  ↓
Idea
  └─ 可单独操作的 Idea Sections
```

Paper Section 和 Idea Section 默认以内嵌、抽屉或详情面板展示；只有用户明确需要把 Section 当作工作对象时，才允许以带父 Node 引用的投影出现。Section 不能脱离父 Entity 伪装成长期一级 Node。

## 7. 当前实现边界与迁移顺序

本设计是目标语义，不改变当前实现事实：

- 当前运行时仍有既有的 `seed`、`direction`、`research_question`、`problem`、`hypothesis`、`approach`、`method`、`evaluation`、`idea` 节点类型。
- 当前 Canvas 仍以本地 plain JSON 为过渡真值；本设计不代表已经有服务端实体表或版本化关系校验。
- 当前 `metadata.document` 是研究卡片长文档，不等于已经实现可寻址的 Section 存储；Agent 不能声称 Section replacement 已可用。
- 当前 `research_workflow_advance` 继续是研究主流程的写入边界；新增能力应先扩展公共 workflow seam，不绕过确认直接调用普通 Canvas 写工具。

建议迁移顺序：先建立稳定 Entity / Section identity 和 evidence refs，再建立 Group provenance / layout，最后实现 Section-level Proposal、dependency check 和 semantic revision。
