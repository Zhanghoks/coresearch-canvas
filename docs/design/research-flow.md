# CoResearch Research Flow

- 日期：2026-09-22
- 状态：产品流程真值。本文记录已拍板的 Research Flow、人机边界和 Canvas 承诺规则。
- 范围：从模糊研究兴趣到可版本化的 Idea V1，以及此后的文献刷新循环。本次不实现页面、Skill 或检索。
- 下游分步契约见 [idea-formation/](./idea-formation/README.md)；若与本文冲突，以本文为准，分步文档待回写。
- 关联：[Idea 结构设计](./idea-structure.md)、[空间设计](./space.md)、[研究画布](./canvas/research-canvas.md)、[Huabu 领域映射](./canvas/huabu-domain-binding.md)。

下文的 Agent Harness 例子只用于说明流程，不表示当前用户已确认该研究方向。

## 1. 产品原则

CoResearch 不是「Agent 自动帮用户生成一个 Idea」。

> **Agent 持续探索、提出候选、解释文献；用户负责确认、保留、组合和推进。Canvas 只保存用户认为值得留下的研究对象。**

压成一句：

> **Agent 负责扩大可能性空间、寻找证据和提出候选；用户通过对话、选择和拖拽不断缩小空间；Canvas 记录用户已经认可的研究状态；文献持续反过来推动这些状态更新。**

这是 CoResearch 与普通 Deep Research、Paper Search、AI Idea Generator 的分界。系统不替用户决定研究什么，也不把未确认的推荐写成研究事实。

## 2. 两条并行通道

流程中的每一步都同时走两条通道，而不是先聊完再画一张图。

```text
Agent Conversation
负责：探索 / 推荐 / 搜索 / 解释 / 比较 / 挑战 / 验证

Canvas
负责：保存 / 组织 / 连接 / 版本化 / 显示用户已经认可的研究对象
```

| 通道 | 产品角色 | 里面可以出现什么 | 不构成什么 |
|---|---|---|---|
| Conversation | Exploration Space | 候选方向、临时解释、检索结果、比较、挑战、未确认综述 | 已认可的研究对象 |
| Canvas | Commitment Space | 用户拖入、保存或确认过的对象及其关系、版本 | Agent 刚提出的全部候选 |

```text
Conversation = Exploration Space
Canvas       = Commitment Space
```

对话里的卡片可以很多、可以丢弃、可以再找一批。只有进入 Canvas 的对象才成为正式 Research Object。画布不是聊天记录的镜像，也不是 Agent 工作区。

## 3. Candidate 与 Canvas Node

同一类对象在两条通道里身份不同：

```text
Agent Candidate     = Agent 提议，status = proposed
Canvas Research Object = 用户认为值得保留，status = saved 或更高
```

用户把 Conversation 中的候选拖入 Canvas（或等价的保存动作）后，才创建对应的领域对象，并投影为画布节点。忽略、关闭、换一批，都不会留下正式对象。

| 动作 | 结果 |
|---|---|
| 感兴趣，拖入 Canvas | 创建 saved 对象 |
| 想了解更多 | 留在 Conversation 中追问 |
| 不感兴趣 | 忽略，不写 Canvas |
| 都不满意 | 让 Agent 再找别的 |
| 想更偏理论 / evaluation | Agent 调整搜索，仍先出 Candidate |

「选中深入」是比「保存」更强的用户决定。用户可以同时保存多条 Direction，但一次 Deep Dive 只针对用户指定要深入的那一条。

## 4. 完整流程

```text
Research Interest
      ↓
1. Seed Framing
      ↓
2. Direction Exploration
      ↓
3. Direction Deep Dive
      ↓
4. Research Question Formation
      ↓
5. Evaluation Exploration
      ↓
6. Method Exploration
      ↓
7. Research Design Co-Design
      ↓
8. Idea Draft
      ↓
9. Idea Review
      ↓
Idea V1
      ↺
11. Literature Refresh / Revision
```

这是初次形成 Idea 的导航顺序，不是单向 Wizard。任何一步被新文献或用户改口挑战后，都可以回到对应对象修改，并生成新的 revision。完成条件是该步的 Exit Gate，不是 Agent 穷尽搜索。

前半段必须严格区分三个问题：

```text
Seed Framing       我大概想研究什么？
Direction Polish   我到底想研究哪片区域？
Direction Deep Dive 这片区域的研究究竟如何发展？
```

其中 Direction Exploration 以 **Direction Coverage** 为目标，而不是固定生成多少条 Direction；Deep Dive 只有在用户明确选择一条 Direction 后才启动。

产品总图：

```text
USER
“我想研究 Agent Harness 自进化”
                 │
                 ▼

          🌱 SEED FRAMING
        用户确认研究兴趣
                 │
                 ▼

       DIRECTION EXPLORATION
                 │
       Agent 推荐 Direction
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼

 Candidate   Candidate   Candidate
 Direction   Direction   Direction

      │
      │ 用户感兴趣
      │ Drag to Canvas
      ▼

        SAVED DIRECTIONS

      │ 用户确认深入
      ▼

       DIRECTION DEEP DIVE
      ────────────────────
      Research Questions
      Methods
      Evaluation
      Papers
      Findings
      Limitations
      Phases
      Frontier
      ────────────────────
                 │
                 ▼

      RESEARCH QUESTION THREADS

        RQ1    RQ2    RQ3

                 │
         用户选择 / 组合
                 ▼

              PROBLEM
                 │
                 ▼
            HYPOTHESIS
                 │
                 ▼
             APPROACH
                 │
                 ▼

       METHOD ↔ EVALUATION
                 │
                 ▼

             ✦ IDEA V1
                 │
                 ▼

              REVIEW
                 │
          ┌──────┴──────┐
          │             │
       保持当前       修改部分
          │             │
          └──────┬──────┘
                 ▼

             IDEA V2
                 │
                 ↺
        LITERATURE REFRESH
```

## 5. Canvas 的三层

画布最终同时承担三种阅读层次。它们可以同时存在于同一张 Space，不必做成三个产品。

### 5.1 Exploration：我在哪个研究空间里？

```text
Seed
Directions
Papers
Questions
```

### 5.2 Reasoning：我的研究逻辑是什么？

```text
Problem
Hypothesis
Approach
Method
Evaluation
```

### 5.3 Synthesis：我现在形成了什么研究 Idea？

```text
Idea Summary
Review
Versions
```

Frame 只组织视图。把 Paper 拖进 Method Frame，不会把 Paper 改成 Method，也不会自动写成「借用了该方法」。

## 6. 各步

### 0. Research Interest

用户可以非常模糊：

> 我想研究 agent harness 自进化。

系统只需要理解「用户现在大概对什么感兴趣」。不要在这一刻要求填写：

```text
Research Gap
Method
Hypothesis
Contribution
Evaluation
```

原始输入原样保存。尚未形成 Seed，也没有 Idea。

### 1. Seed Framing

**目标**：把模糊兴趣变成一个足以启动文献探索、又没有过早限制方向的研究 Seed。

Agent 只做轻量语义澄清，例如：

```text
“Agent Harness 自进化”可能有几种理解：

A. 自动优化 Harness
B. 根据任务经验持续修改 Harness
C. 长期 Continual Evolution
D. Self-improving Agent Infrastructure

你更接近哪一种？
```

这些选项是对原话的理解候选，不是文献发现的 Research Direction。用户可以多选、组合或直接自由输入。输入已经足够清楚时，跳过选择题，直接给出可确认的 Seed。

用户确认后形成：

```text
🌱 SEED · confirmed

Agent Harness 自进化

探索 Agent 如何根据自身运行过程、
反馈和经验持续修改其运行 Harness。
```

Seed **不包含** Direction，也不包含：

```text
Skills / Tools / Memory
Gap
Method
Novelty
Evaluation
```

组件范围、方法路线和创新点都还太早。用户后来若主动补了组件，那是后续对象的内容，不是把 Seed 升级成研究问题。

Seed Detail 只保留：

```text
原始输入
当前主题理解
相关概念
版本历史
确认状态
```

例如：

```text
原始输入
“我想研究 agent harness 自进化”

当前主题理解
探索 Agent 如何根据自身运行过程、
反馈和经验持续修改其运行 Harness。

相关概念
agent harness
self-evolving agent
self-improving agent
harness optimization

状态
✓ 用户已确认
```

检索用的 SearchBrief 可以从已确认 Seed 派生，但它是检索工件，不是 Seed 正文，也不进入已确认概念。

**Exit Gate**：用户确认 `Seed = confirmed`。未确认不进入 Direction Exploration，也不把整理文案标成已确认。

### 2. Direction Exploration

Seed 之后的第一轮文献探索。核心问题：

> 围绕这个 Seed，目前有哪些值得继续看的研究方向？

Agent 流水线：

```text
Seed
↓
search planning
↓
paper retrieval
↓
canonicalize / dedup
↓
rough clustering
↓
Direction candidates
```

这一步做的是 Recall-first 的粗聚类和差异化推荐，不是把整个领域的研究脉络重建出来。Agent 的停止条件是：在当前 Seed、查询计划和覆盖记录下，继续扩展搜索已基本不再产生新的一级研究方向；不能用“生成 5 个方向”之类的固定数量代替覆盖判断。完整脉络属于下一步 Deep Dive。

Direction Coverage 至少记录：

- 已覆盖的查询族、来源类型、时间范围和主题边界；
- 已识别的一级 Direction，以及每条 Direction 的区分依据；
- 仍未核查、来源不足或可能重复的区域；
- 本轮停止的理由和可继续搜索的入口。

“未找到新的 Direction”只能说明本轮未发现新增路线，不能声明“所有 Direction 都已找到”。

Direction Candidate **首先只存在于 Conversation**：

```text
我先找到几条比较不同的研究路线：

┌─────────────────────────────┐
│ DIRECTION                   │
│ Automatic Harness Evolution │
│                             │
│ 如何让 Agent 自动发现       │
│ Harness 弱点并提出修改？    │
│                             │
│ 4 related works             │
│                       ⠿ Drag│
└─────────────────────────────┘

┌─────────────────────────────┐
│ DIRECTION                   │
│ Credit & Attribution        │
│                             │
│ Harness 发生变化后，        │
│ 如何知道哪个 Edit 真正有效？│
│                             │
│ 5 related works             │
│                       ⠿ Drag│
└─────────────────────────────┘
```

用户在这一阶段不是「选一个然后结束」，而是持续探索：感兴趣则拖入 Canvas，想了解则追问，不满意则再找，想偏理论或 evaluation 则让 Agent 改搜索。

#### Direction Polish：在地图中导航，而不是进入 Deep Dive

用户可能觉得某条 Direction 接近但仍不准确，例如：

```text
Process / Trajectory Evaluation
        ↓ 用户补充“我关心执行过程中的行为质量”
Direction Polish
        ↓ 局部重搜、重聚类、保留原方向来源
Execution Behavior Quality
```

Direction Polish 的问题是“我到底想研究哪片区域”，不是“这片区域已经发展成什么样”。它可以由以下动作触发：

- 用户指出某个候选方向过宽、过窄或概念不准；
- 用户补充关注对象、边界、时间范围或评价视角；
- 用户要求围绕某个方向继续展开邻近区域；
- 用户要求更换查询表达、补充检索范围或比较相邻方向。

Polish 运行局部搜索并生成新的 Direction candidates。新候选先回到 Conversation；只有用户保存后才进入 Canvas，且必须保留与原 Direction、用户补充和新增证据的来源关系。Polish 不直接创建 Research Question、Problem、Hypothesis 或 Deep Dive Dossier。

用户可以重复 Polish，也可以放弃当前候选回到整张 Direction Map。系统不把“接近”自动解释为用户选择，不把一次追问自动解释为确认。

Canvas 此时可以是：

```text
             🌱 Seed
          Agent Harness
               │
       ┌───────┼────────┐
       ▼       ▼        ▼

 Direction  Direction  Direction
 Credit     Continual  Integrity
```

用户可以同时保存多个 Direction。保存不等于选中深入。

**Exit Gate**：用户发现至少一个自己真正想深入理解的 Direction，并明确指定深入。例如：

> 我对 Credit & Attribution 最感兴趣。

此时该 Direction 进入 `selected_for_deep_dive`。结束条件不是 Agent 找完所有方向，也不是用户必须确认唯一 Direction；用户可以保存多条 Direction，但每次 Deep Dive 必须明确当前深入对象。

### 3. Direction Deep Dive

CoResearch 最重要的中间阶段之一。它不是「再推荐几篇论文」，也不是先写一篇方向综述，而是：

> 围绕一个 Selected Direction，检索真实论文，将论文拆成可追问、可回到原文的原子 Research Section，再从这些 Section 聚合出当前 Direction 的 Research Map。

V1 的执行链路固定为：

```text
Selected Direction
      ↓
Focused Deep Research
      ↓
真实论文检索 + 去重 + 尽量获取全文
      ↓
Research Wiki 摄入
      ↓
逐篇论文理解
      ↓
抽取 Paper Sections
      ↓
形成 Direction Research Map
```

对 `Credit & Attribution` 这类方向，系统要回答：

```text
这个方向为什么出现？
最早在解决什么问题？
经历了哪些阶段？
每个阶段有哪些主流 Methods？
这些 Methods 怎么评估？
哪些论文是 Milestone？
每一阶段解决了什么？
又留下了什么问题？
现在发展到什么 Frontier？
```

研究脉络不是论文链表：

```text
Paper A → Paper B → Paper C
```

而是证据支撑下的问题—方法—评价循环：

```text
Research Question
        ↓
Method Families
        ↓
Evaluation Paradigm
        ↓
Results / Findings
        ↓
Limitations
        ↓
Next Research Question
```

论文是这些变化的证据，但 Deep Dive 不能跳过论文级证据直接生成脉络。

#### 3.1 Paper Evidence：Deep Dive 的最小数据单元

最小数据单元固定为：

```text
Paper
  ↓
Paper Section
```

一篇 Paper 可以包含多个同类型 Section，不强制“一篇论文一个 Problem / Method / Result”。V1 的 Section 类型为：

```text
problem
method
evaluation
result
limitation
```

每个 Paper Section 至少包含：

```text
type             Section 类型
title            可读标题
summary          面向浏览的短摘要
detail           可追问的详细解释
sourceLocation   原文定位（章节、页码、表格或稳定文本片段）
paperId          所属 Paper
```

Section 的 `summary` 和 `detail` 是系统整理，但必须能回到 `sourceLocation`。如果只能访问摘要，就只能生成摘要级 Section；全文、实验条件、表格和显著性不能靠模型记忆补造。

典型论文可以被拆成：

```text
Paper A
├─ Problem
├─ Method
├─ Method Detail
├─ Evaluation Setup
├─ Evaluation Metric
├─ Result
└─ Limitation
```

用户点击任何 Section 时，追问上下文自动绑定：

```text
当前 Direction
+ 当前 Paper
+ 当前 Paper Section
+ Section 对应的原文证据
```

因此用户可以分别追问 Method 如何实现、Result 与 baseline 相差多少、Limitation 是作者明确承认还是系统综合，而不需要重新向 Agent 粗略描述上下文。

#### 3.2 Direction Synthesis：从 Paper Sections 聚合 Research Map

Deep Dive 的第二层才是方向级综合：

```text
Layer 1 — Paper Evidence
Paper A → Problem / Method / Evaluation / Result / Limitation
Paper B → Problem / Method / Evaluation / Result / Limitation

Layer 2 — Direction Synthesis
Current Problems
Current Methods
Evaluation Practices
Observed Results
Common Limitations
```

Direction Synthesis 的每一个判断都必须带 Section evidence refs，并能向下展开到 Paper、Section 和原文位置。例如：

```text
Common Limitation: LLM Judge inconsistency
  → Paper A / Limitation 2
  → Paper C / Result 1
  → Paper F / Discussion 3
```

必须严格区分：

| 层 | 允许表达 | 不允许表达 |
|---|---|---|
| Paper Evidence | 作者报告的结果、作者明确承认的限制、原文中的方法细节 | 把系统推断写成作者原话 |
| Direction Synthesis | 多篇 Paper Section 的归纳、比较和研究路线判断 | 没有 evidence refs 的“共识”或“当前 frontier” |

系统综合需要标注 `author_reported`、`cross_paper_synthesis`、`system_inference` 或 `needs_verification`。一篇论文中的 Result 不能自动升级为整个 Direction 的能力；多篇论文的相似现象也不能隐藏任务、数据、指标和时间范围。

跨论文综合后的研究脉络仍围绕以下单元组织，而不是按年份或论文标题排列：

```text
Problem / Research Question
        ↓
Method：输入、步骤、机制、输出、基线与消融如何实现
        ↓
Capability：在什么任务、条件和范围内获得了什么能力
        ↓
Evaluation：用什么数据、对照、指标和失败判据观察能力
        ↓
Observed Limitation：限制具体落在哪些条件、对象或交互上
        ↓
Next Method / Reframing：后续工作如何响应，证据是否充分
```

因此 Deep Dive 不能只输出“2023 年 A、2024 年 B、2025 年 C”的 chronology。Method 与 Evaluation 必须尽可能解释到可追问的实现层：研究对象是什么、改变了哪些输入或组件、运行过程如何展开、输出如何被消费、比较基线是什么、评价如何隔离贡献、失败如何被识别。读不到全文或实验细节时必须标记 coverage / verification 状态，不能用模型记忆补齐。

每一个 Phase 应包含 Research Question、Methods、Evaluation、Representative Papers、Capabilities、Limitations。例如：

```text
PHASE 2
Component-level Attribution

Research Question
如何判断哪个 Harness Component 真正产生贡献？

Methods
• Ablation
• Observability
• Component-wise comparison

Evaluation
• Ablation Delta
• Contribution Score
• Attribution Fidelity

Representative Papers
AHE
Paper B
Paper C

Capabilities
✓ 可以分析 Component-level effect

Limitations
× Multi-component interaction 不清楚
× Context dependence 没有充分处理
```

最终应能并排看到多轨脉络，而不是一条必然进步的直线：

```text
TIME ─────────────────────────────────────→

Research Questions
整体是否提升 → 哪个 Component 有贡献 → 哪个 Edit 有贡献
→ 连续 Edit 如何归因 → History / Interaction Effects

Methods
Aggregate Evaluation → Component Ablation → Edit Verification
→ Continual State Tracking → Interaction-aware Attribution

Evaluation
Task Score → Ablation Delta → Credit Reliability
→ Retention / Forgetting → Attribution Fidelity

Papers
Paper A → AHE → HarnessBank → HCL → Recent Frontier
```

Canvas 建议：

```text
Direction = Frame
Phase     = Frame
Paper     = Paper Node
Paper Section = 可展开的 Atomic Section
Research Question = ResearchQuestion Node
```

Paper Section 默认先作为 Conversation / Research Wiki 中可点击的证据卡片展示；用户需要把它作为研究上下文保留时，才拖入 Canvas。拖入 Canvas 的 Section 仍然引用 Paper 和 sourceLocation，不复制成脱离来源的自由文本。

```text
┌──────────── Credit & Attribution ─────────────┐

 Phase 1
 ┌─────────────┐
 │ Paper A     │
 │ Paper B     │
 └─────────────┘
      ↓
 Research Question
 “如何知道某个 component 是否真的有贡献？”

      ↓

 Phase 2
 ┌─────────────┐
 │ AHE         │
 │ Paper C     │
 └─────────────┘
      ↓
 Research Question
 “多个 edit 是否会产生 interaction？”

      ↓

 Current Frontier
 Paper D
 Paper E

 Research Question
 “Edit effect 是否依赖 prior harness state？”

└───────────────────────────────────────────────┘
```

**最终产物**不是一份脱离证据的综述文本，而是由 Paper Evidence 支撑的 Direction Research Map / Dossier：

```text
Direction Overview
Origin
Research Phases
Research Questions
Method Families
Evaluation Paradigms
Milestone Papers
Capabilities
Limitations
Branches
Current Frontier
Latest Verification
```

路线标题、阶段划分和综合解释是系统综合，必须带 Section evidence refs、来源与覆盖状态；证据不足时标为待核查，不补造起源或演化链。Direction Map 的 Result、Limitation、Method Family 等聚合项都必须能展开到一个或多个 Paper Section。

**Exit Gate**：选定 Direction 的论文检索和 Wiki 摄入完成到可见的 coverage 状态；已抽取一批可追问的 Paper Sections；Direction Research Map 的主要聚合项可以回溯到证据；用户开始面对其中的 Problem / Limitation 线索。用户也可以先保存 Map，稍后再选问题。

### 3.1 Research Wiki：贯穿全程的知识层

Research Wiki 不是一个用户步骤，也不是 Direction 与 Deep Dive 之间的中转页面。它是所有 Research 操作持续写入的 Project-scoped 知识层：Direction Exploration、Direction Polish、Deep Dive、Research Question、Problem Formation 和 Literature Refresh 都可以向其中追加 Work、版本、全文片段、元数据、关系与证据。

三者边界固定为：

| 层 | 职责 | 用户看到的状态 |
|---|---|---|
| Research Wiki | 系统保存可复用的文献知识、来源、证据和关系 | 可检索、可追溯、允许状态不完整 |
| Conversation | 当前运行的候选、解释、比较、追问和临时结果 | 可很多、可丢弃、未构成研究承诺 |
| Canvas | 用户主动保存、组织和确认的研究对象与关系 | 代表当前工作上下文和承诺 |

检索到的 Paper 默认先进入 Wiki，并在 Conversation 中以候选或证据卡片展示；用户拖入 Canvas 后才成为当前 Canvas 的正式 Paper / Research Object。Wiki 中有记录不等于用户认可，Conversation 中出现不等于事实已确认，Canvas 中保存也不等于文献已经证明该对象。

Wiki 更新不得静默改写用户已确认的 Seed、Direction、Problem 或 Idea。新证据应形成追加的 Snapshot、Assessment 或 revision，并通过 Conversation 提示用户是否需要回到上游对象修订。

### 4. Research Question Formation

Deep Dive 完成后，用户手上已经有很多真实论文拆出的 Problem、Method、Evaluation、Result 和 Limitation。此时用户还不是在定义 Problem，而是在回答：

> 这些已有研究里，什么具体问题值得我继续追问？

Research Question 不由 Agent 脱离证据突然生成，而是从一个或多个 Paper Section 派生。它仍然属于理解已有研究的阶段，不等同于 Research Gap、Novelty 或用户自己的 Problem。

#### 4.1 从 Section 开始探索

用户点击一个 Problem、Limitation 或 Result Section 后，可以先继续理解：

```text
为什么会出现这个问题？
哪些论文发现了它？
现在有哪些解决方法？
有没有专门评估这个现象的工作？
这个结果的条件、范围和证据强度是什么？
```

Section 追问继续绑定当前 Direction、Paper、Section 和 sourceLocation。Ask 是解释已有证据，不创建 Research Question，也不改变 Canvas。

当用户选中一个或多个 Section 并表达兴趣时，Agent 才能提出带来源的 Research Question candidates。例如：

```text
Source Sections

Limitation A
不同 LLM judge 判断不一致

Result B
某些 judge 与 human agreement 较低

Method C
现有方法通常使用 single judge
```

候选可以处于不同问题层次，必须明确差异：

```text
RQ1  描述现象：不同 LLM Judge 的一致性有多高？
RQ2  解释原因：哪些因素影响评价稳定性？
RQ3  寻找方法：能否设计比 single judge 更可靠的评价方法？
```

候选仍先存在于 Conversation。用户可以选一个、组合多个、拒绝、继续追问，或者要求 Agent 改写；未确认前不写入 Canvas。

#### 4.2 Research Question 的最小对象

Research Question V1 只保存：

```text
Question
Why This Question
Derived From       一个或多个 Paper Section
Current Evidence   相关 Paper / Section / targeted search 结果
Status             exploring | confirmed
Revision           当前问题表述版本
```

RQ 不提前包含 Novelty、Research Gap、Problem、Method、Contribution 或 Hypothesis。`Why This Question` 描述用户为什么对它感兴趣，不把兴趣改写成“该问题尚未解决”。`Current Evidence` 描述目前已知工作，不宣布问题已经值得做或一定没有人做过。

#### 4.3 Ask、Targeted Search 与 Polish

Research Question 草稿或已确认 RQ 保持可追问：

| 动作 | 作用 | 是否改变 RQ |
|---|---|---|
| Ask | 解释当前 Section、RQ 和已有研究 | 否，结果进入 Conversation / Wiki |
| Targeted Search | 围绕 RQ 做更窄的文献检索，并把新证据摄入 Wiki | 更新 Current Evidence，不自动确认 RQ |
| Polish | 根据用户反馈重写范围、对象、条件或关系，形成新 revision | 是，用户仍需确认新版本 |

Targeted Search 的链路是：

```text
Research Question
      ↓
Focused Literature Search
      ↓
直接相关论文 / 相邻论文 / 冲突证据
      ↓
Research Wiki
      ↓
Current Evidence 更新
```

“本次没有找到直接相关论文”只能成为 `needs_verification` 或 coverage 记录，不能直接生成 Open Gap、Novelty 或 Problem。

Polish 例子：

```text
RQ v0
不同 LLM Judge 对 Coding Agent trajectory 的评价是否一致？
        ↓ 用户补充关注 prompt、model capability、trajectory length
RQ v1
在 Coding Agent trajectory evaluation 中，
judge model、evaluation prompt 和 trajectory complexity
如何影响 LLM Judge 与人工判断之间的一致性？
```

用户明确说“这个问题我有兴趣研究”或执行等价的确认动作后，才创建 Canvas Research Question Node，并保留 `derivedFromSectionRefs`、revision 和确认来源。

```text
RQ1  如何可靠估计单个 Edit 的贡献？
RQ2  多个 Edit 是否存在 Interaction？
RQ3  Edit Effect 是否依赖 Prior State？
RQ4  Good Harness Update 是否真的被 Agent 利用？
RQ5  Continual Evolution 中如何避免 Forgetting？
```

这些候选必须继续携带对应的 Section evidence refs。用户可以先点击候选查看它由哪些 Problem / Limitation / Result Section 组合而来，再决定是否确认。

这些问题首先是领域里存在的线索，不是用户已经决定要研究的 Problem。用户继续通过 Agent 探索区别、已有工作、最近文献，或把线索合起来理解。RQ 确认只表示“我想继续追问这个问题”，不表示它是 Gap 或尚未被解决。

感兴趣的 Research Question 保存到 Canvas：

```text
Direction
   │
   ├── RQ2 Multi-edit Interaction
   └── RQ3 History Dependence
```

Research Question 的用户生命周期使用：

```text
exploring → confirmed → revised
```

文献相对于该问题的状态是独立的 Current Evidence / Verification 状态，可以记录 `needs_verification`、`active`、`partially_addressed`、`addressed`、`superseded` 或 `inconclusive`；不能把它与用户是否确认 RQ 混成一个状态。不要随便显示 `Open Gap ✓`。没有经过针对该问题的核查，就不能把线索升级成空白。

**Exit Gate**：用户已从一个或多个 Paper Sections 确认至少一个 Research Question，RQ 有 `derivedFromSectionRefs`、当前证据和可追溯 revision。Targeted Search 可以仍为 partial / needs_verification；下一步才是判断该 RQ 被解决到什么程度并形成 Problem。

### 5. Evaluation Exploration

Research Question 确认后，流程从“理解领域”切换到“构造自己的研究设计”。第一步不是发明 Method，而是回答：

> 如果我要研究这个问题，需要观察什么现象，什么结果才算支持或反驳我的解释？

Evaluation Exploration 不是简单选择 Metric，而是从 RQ 拆出 Evaluation Targets，再检索真实论文中的 Evaluation Sections，形成可比较的 Evaluation Strategy candidates。

```text
Research Question
      ↓
What needs to be measured?
      ↓
Evaluation Targets
      ↓
Evaluation-focused Literature Search
      ↓
Evaluation Sections → Research Wiki
      ↓
Evaluation Strategy Candidates
```

候选至少说明 Target、观察对象、数据/对照、指标、失败判据、成本与限制。例如可以分别比较 Human Agreement、Cross-Judge Consistency、Prompt Robustness、Ranking Stability 和 Perturbation Sensitivity。

Agent 尽可能建立 Evaluation Landscape，用户选择、组合或修改适合当前 RQ 的 Evaluation Strategy。此阶段不生成 Method，不把某个指标自动解释成解决方案。

**Exit Gate**：用户确认需要观察的 Evaluation Targets 和一组可比较的 Evaluation Strategy；每项策略有来源、适用范围与已知限制。具体实验协议仍未确定。

### 6. Method Exploration

只有在用户明确“我要如何判断方案有效”之后，才进入 Method Exploration。此时搜索目标从“如何评估”切换为：

> 现有研究用了哪些方法来解决相似问题，并且这些方法能否覆盖已确认的 Evaluation Strategy？

```text
Selected Evaluation Strategy
      ↓
Method-focused Deep Research
      ↓
真实论文 → Paper Sections → Research Wiki
      ↓
Method Landscape
```

Method Candidate 至少说明：解决什么问题、如何实现、依赖什么输入、产生什么输出、使用哪些 Evaluation、已有 Result、Limitations 和 Supporting Literature。候选可以包括 Multi-Judge Ensemble、Pairwise Comparison、Rubric-based Evaluation、Calibrated Judge、Debate / Critique、Reference-based Evaluation 或 Learned Evaluator，但不预设固定 taxonomy。

**Exit Gate**：用户确认一个或多个需要继续比较的 Method Candidates，并且每个候选都能连接到至少一项 Evaluation Strategy。用户仍可以回到 Evaluation Exploration 补充评价目标。

### 7. Research Design Co-Design

这一阶段将 RQ、Evaluation 和 Method 收敛为可审阅的 Research Design Candidate。核心关系不是单独选择 Method 和 Evaluation，而是：

```text
Research Claim
      ↕
Method
      ↕
Evaluation
```

Research Design Candidate 至少包含：

```text
Research Question
Core Claim
Method
Evaluation
Supporting Literature
Known Risks
```

必要时在这一阶段补充 Problem、Mechanism、Predictions、Falsifiers 和总体 Approach。Problem 回答“我要把什么困难转成自己的研究对象”，Hypothesis 回答“为什么它会发生以及什么观察可以证伪”，Approach 回答“采用什么总体检验策略”；它们都不能跳过已经确认的 Evaluation Targets。

例如：

```text
Claim
多 Judge 聚合可以降低单一 Judge 的系统性偏差

Method
异构 Judge 独立评分 → reliability weighting → aggregation

Evaluation
Human Agreement + Cross-Judge Consistency + Prompt Robustness + Cost
```

用户可以选择、组合、修改或拒绝多个 Research Design Candidates。Agent 必须指出现有机制与 proposed difference，避免把已有 Method 包装成 Novelty；具体数据集、样本数、随机种子、threshold、run order 和算力属于之后的 Experiment Planning，不在本阶段锁定。

**Exit Gate**：用户确认至少一个 Research Design Candidate，且每个 Core Claim 都有对应 Method、Evaluation、Supporting Literature 和 Known Risks。未对齐的 Candidate 留在 Conversation，不进入 Idea Draft。

### 8. Idea Draft

Idea Draft 不是 Agent 凭空生成的新 Idea，而是把用户前面确认过的研究对象组合成第一份可审阅草稿：

```text
Selected Direction
        ↓
Deep Dive
        ↓
Paper Section / Limitation
        ↓
Research Question
        ↓
Evaluation Strategy
        ↓
Method
        ↓
Research Design Candidate
        ↓
Idea Draft
```

Idea Draft V1 只包含：

```text
Research Problem
Research Question
Motivation / Limitation
Proposed Method
Core Claim
Evaluation Strategy
Related Evidence
Open Risks
```

它仍然是 Draft，不是 `Idea V1 confirmed`。发现缺口时只能提出 Review Comment、Open Question 或要求用户回到上游修订，不能在 Synthesis 阶段凭空增加核心对象。

**Exit Gate**：已有一份引用 Research Design Candidate 的 Idea Draft，进入 Review；用户尚未确认 Idea。

#### 8.1 Idea 是可替换 Section 的持续演化对象

Idea 不是一次生成后固定的长文档，而是一组相互依赖、可独立追问和替换的 Sections：

```text
Idea
├─ Problem
├─ Research Question
├─ Core Claim
├─ Method
├─ Evaluation
├─ Evidence / Related Work
├─ Limitation / Risk
└─ Contribution
```

每个 Idea Section 至少维护四层：

```text
Current       当前用户认可或正在使用的版本
Evidence      支持、重叠、反驳或待核查的文献证据
Proposals     Agent 提出的替代版本或修订建议
History       被替换的历史版本和替换原因
```

用户点击单个 Section 后，可以执行：

```text
Ask / Search / Challenge
        ↓
真实论文检索与证据审查
        ↓
Section Proposal
        ↓
用户 Accept / Edit / Reject
        ↓
替换当前 Section 或保留原版本
```

例如 Method Section 的 Similarity / Prior Art Search 必须分别展示：

```text
Overlap       已有工作覆盖了什么
Difference    当前 Idea 具体不同在哪里
Uncertain     哪些组合关系仍未核查
```

不能把“存在相似工作”直接写成“不新颖”。用户可以保留、修改、替换或继续搜索；Agent 不得自动覆盖 Current。

普通修改只是同一 Section 的 replacement；如果 Method 的变化可能影响 Claim、Evaluation 或 Contribution，系统执行 dependency check，列出需要重新审阅的依赖 Section，但不自动替用户修改它们：

```text
Method changed
      ↓
Claim        ⚠ recheck
Evaluation   ⚠ recheck
Contribution ⚠ recheck
```

Idea 的默认循环不是最后统一查一次 novelty，而是每个 Section 都可以持续进行 Prior Art Search、Similarity Check、Evidence Review 和局部 Proposal。Idea working state 可以暂时混合旧 Section 与新 Section；用户确认相关依赖后，才形成新的语义 Idea revision。

### 9. Idea Review

Idea Draft 形成后必须 Review；但 Review 不是唯一一次文献检查。各 Section 可以随时触发局部检查，整体 Review 负责检查这些局部更新组合后是否仍然成立：

```text
Problem → Research Question 是否成立？
Research Question → Claim   是否仍然对应？
Claim → Method               是否真的能检验？
Method → Evaluation          评价是否覆盖 Claim？
Closest Work             有没有真正比较？
Contribution             是否把已有工作包装成自己的？
Scope                    是不是越来越大？
```

Review 不是打分。不要：

```text
Novelty 9.1/10
Feasibility 8.7/10
```

而应该：

```text
Logic Chain            ✓
Literature Position    ◐ Needs more verification
Evaluation Alignment   ✓
Scope                  ✓
Open Risks             2
```

Review Comment 必须可由用户处置：

```text
“causal attribution” 这个表述可能过强。

建议：改成 interaction effect estimation。

[接受] [编辑] [拒绝]
```

只有用户确认后，才更新 Idea。Keep 画布变更 ≠ 确认研究表述。

**Exit Gate**：用户确认当前 Idea Snapshot（可带仍须核查的标记）。`confirmed` 表示用户认可这一版表达、范围和当前定位，不表示 Novel Idea 已证明，也不冻结后续文献更新。

### 10. Idea Versioning

Research Idea 不应该只有一个最终版本。

```text
Idea V1
↓
读到新论文
↓
Problem 被挑战
↓
Method 调整
↓
Idea V2
↓
进一步验证
↓
Idea V3
```

整个系统实际是循环：

```text
Literature
↕
Direction
↕
Research Question
↕
Research Question
↕
Evaluation Strategy
↕
Method
↕
Research Design
↕
Idea
```

新文献或用户改口挑战某个对象时，打开对应步骤，创建新 draft / revision；旧确认快照保持可追溯。不把旧结果静默改写成新范围的结论。

## 7. 对象生命周期

跨步骤共用同一套身份升级，不按步骤各发明一套状态机。

```text
proposed   Agent 或系统提出，只在 Conversation
saved      用户拖入或保存到 Canvas，成为 Research Object
selected   用户指定为当前深入 / 组合对象
confirmed  用户确认某一具体 revision
superseded 被更新版本或新决定替代
```

不是每类对象都走完全部状态。Direction 常经过 proposed → saved → selected_for_deep_dive；Idea Section 可以经过 current → proposal → accepted / rejected → superseded；Idea 只有在用户确认当前 Section 组合和依赖审查结果后，才形成 confirmed semantic revision。

三类判断始终分开：

| 判断 | 含义 | 谁能决定 |
|---|---|---|
| 用户是否认可表述 | 这确实是我想保留 / 研究的 | 用户 |
| 文献当前怎么评价它 | 支持、部分覆盖、争议、证据不足 | 有出处的审阅记录 |
| 实验或验证结果如何 | 在指定协议下得到什么观测 | 绑定协议的结果记录 |

确认不等于证实。未找到直接匹配不等于无人做过。负结果不等于对象应自动删除。

## 8. 人机边界

| 角色 | 做 | 不做 |
|---|---|---|
| Agent | 搜索、聚类、解释、比较、提出候选、指出风险、做针对性核查 | 替用户选择方向、确认 Idea、把候选写成已认可对象、宣布全局首创 |
| 用户 | 追问、忽略、保存、组合、确认、接受/编辑/拒绝 Review | 被要求在 Seed 阶段填完整 Idea 问卷 |
| Canvas | 记录已认可对象、组织关系、版本化、显示三层阅读 | 自动镜像 Conversation 里的全部候选 |
| 文献刷新 | 挑战已确认对象、触发新 draft | 静默改写旧确认快照 |

拖入 Canvas 是承诺手势：它表示「值得留下」，还不是「这就是最终 Idea」。最终 Idea 只综合用户确认过的 Reasoning 层对象。

## 9. 与现有分步文档的关系

本文是产品流程真值。[idea-formation/](./idea-formation/README.md) 编号文档仍保存实现级契约（输入输出、Gate、revision、检索约束）。两者冲突时先按本文，再回写分步文档。

| 本文步骤 | 现有文档 | 需要回写的要点 |
|---|---|---|
| 0 Research Interest | 含在 [01-seed.md](./idea-formation/01-seed.md) 输入段 | 保持「先保存原话，不创建 Idea」 |
| 1 Seed Framing | [01-seed.md](./idea-formation/01-seed.md) | Seed 更薄：确认内容不含 Skills/Tools/Memory、Direction、Gap、Method；SearchBrief 降为派生检索工件 |
| 2 Direction Exploration | [03-direction-focus.md](./idea-formation/03-direction-focus.md) | 提到 Deep Dive **之前**；候选先活在 Conversation，保存进 Canvas 才成为对象；结束条件是「至少一个想深入的 Direction」，不是确认最终 Focus |
| 3 Direction Deep Dive | [02-research-landscape.md](./idea-formation/02-research-landscape.md) | 从「先建全领域 Landscape」改为「对用户选中的 Direction 重建脉络」；产物是 Direction Dossier |
| 4 Research Question Formation | 尚无独立文档 | 从 Problem / Limitation / Result Section 派生；支持 Ask / Targeted Search / Polish；禁止随手标记 Open Gap |
| 5 Evaluation Exploration | 尚无独立文档 | 从 RQ 拆 Evaluation Targets，搜索并比较 Evaluation Strategy；不先想 Method |
| 6 Method Exploration | 尚无独立文档 | 在 Evaluation Strategy 明确后搜索 Method Candidates，并绑定已有评价 |
| 7 Research Design Co-Design | [07-research-design.md](./idea-formation/07-research-design.md) | Claim ↔ Method ↔ Evaluation 联合收敛；Problem / Hypothesis / Approach 作为设计层；不做实验协议 |
| 8 Idea Draft | [08-idea-synthesis-review.md](./idea-formation/08-idea-synthesis-review.md) 前半 | 只组合已确认的 Research Design Candidate，不创造新 Idea |
| 9 Idea Review | 08 后半 | 不打分；Comment 必须用户接受/编辑/拒绝 |
| 10 Versioning | 08 与 [Idea 结构设计](./idea-structure.md) | 循环是默认形态，不是 Idea Draft 之后的附录 |

最大结构变化是第 2 / 3 步对调：先广探候选方向，再深挖用户选中的那一条。旧顺序（先全图 Landscape，再选 Focus）不再作为产品导航。

## 10. 明确不是什么

| 其他形态 | CoResearch 不做的事 |
|---|---|
| Deep Research 报告 | 用一篇综述代替用户决定研究方向 |
| Paper Search | 停在论文列表，不形成可确认的研究逻辑 |
| AI Idea Generator | 从兴趣直接生成带贡献声明的 Idea |
| 分步 Wizard | 强制填完十维问卷才能继续 |
| 实验管理系统 | 在 Idea 形成阶段锁定数据集、样本量和算力 |

Idea V1 之后才进入研究执行、实验规划或论文生产。那些工作流读取已确认 Idea，不回写一套平行真值。
