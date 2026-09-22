# Direction-first Research Flow

Status: ready-for-agent
Label: ready-for-agent
权威流程：[Research Flow](../../docs/design/research-flow.md)

## Problem Statement

当前研究流程虽然已经区分了 Seed、Direction Exploration 和 Direction Deep Dive，但实现和设计容易把它们压缩成传统的「Seed → Direction → Deep Dive」线性向导。这样会带来四个问题：

1. Seed 被过早解释成研究问题、方法或创新点，用户还没有机会确认真实兴趣。
2. Direction Exploration 被误解为生成固定数量的方向，无法表达“尽可能覆盖研究空间、直到新增方向趋于饱和”的目标。
3. 用户对某条方向“有点接近但不准确”的反馈会被错误地推进成 Deep Dive，而不是继续导航和收缩研究空间。
4. Research Wiki、Conversation 和 Canvas 的职责混在一起，导致系统候选被误写成用户承诺，或用户保存的对象被当成文献事实。

## Solution

维护一条以用户决策为边界、以证据为基础的 Direction-first Research Flow：

```text
Research Interest
  → Seed Framing
  → Direction Exploration（coverage-first）
  ↔ Direction Polish（可重复的局部导航）
  → Selected Direction
  → Direction Deep Dive（脉络重建）
  → Research Question
  → Problem
  → Hypothesis
  → Approach
  → Method & Evaluation Co-Design
  → Idea Synthesis / Review / Revision
```

Research Wiki 作为贯穿所有检索和阅读动作的知识层；Conversation 负责临时探索；Canvas 只保存用户主动保留、选择或确认的研究对象。Agent 扩大可能性空间、寻找证据并提出候选，用户负责选择、修正、保存、组合和推进。

## User Stories

1. As a researcher, I want to保存我的原始研究兴趣原话, so that系统不会在第一步丢失我的真实意图。
2. As a researcher, I want to看到一个轻量、可编辑的 Seed 草稿, so that我可以确认系统是否正确理解了兴趣。
3. As a researcher, I want to通过对话继续打磨 Seed, so that我不必在开始时填写完整的研究问题、方法和评价方案。
4. As a researcher, I want to把 Seed 保持在 initial、refining 或 ready_for_exploration 等轻量状态, so that Seed 不会被伪装成已经完成的研究对象。
5. As a researcher, I want to明确触发“开始探索方向”, so that系统不会因为自动生成了 SearchBrief 就擅自开始研究。
6. As a researcher, I want to在 Direction Exploration 中看到尽可能覆盖研究空间的一级方向, so that系统不会为了凑固定数量而压缩领域结构。
7. As a researcher, I want to看到检索覆盖范围、查询族、时间边界和待核查区域, so that我知道方向地图的边界。
8. As a researcher, I want to看到“本轮未发现新方向”与“所有方向已找到”的区别, so that系统不会做出无法证明的穷尽声明。
9. As a researcher, I want to让 Agent 围绕已发现方向继续扩展邻近研究空间, so that我可以发现初始聚类遗漏的方向。
10. As a researcher, I want to在 Conversation 中暂存方向候选, so that我可以比较候选而不污染正式 Canvas。
11. As a researcher, I want to把感兴趣的 Direction 拖入 Canvas, so that我可以明确表达“这条方向值得保留”。
12. As a researcher, I want to同时保存多条 Direction, so that我可以保留研究空间中的多个可能入口。
13. As a researcher, I want to告诉 Agent 某条 Direction“接近但不准确”, so that系统可以进入 Direction Polish 而不是直接 Deep Dive。
14. As a researcher, I want to用自然语言补充关注对象、边界或评价视角, so that新的方向候选能更贴近我的意图。
15. As a researcher, I want to重复 Direction Polish, so that我可以逐步缩小研究区域而不是一次性做出不可逆选择。
16. As a researcher, I want to看到 Polish 候选与原 Direction、用户补充和新证据的关系, so that我能判断它是否真的更接近。
17. As a researcher, I want to明确选择某个 Direction 进入 Deep Dive, so that重型研究只针对我真正想理解的区域。
18. As a researcher, I want to让 Deep Dive 重建问题、方法、能力、评价、限制和后续响应, so that我得到研究脉络而不只是按年份排列的论文清单。
19. As a researcher, I want to看到 Method 的输入、步骤、输出、基线和消融, so that我能理解方法实际上如何工作。
20. As a researcher, I want to看到 Evaluation 的数据、对照、指标、失败判据和成本, so that我能判断能力主张是否被真正检验。
21. As a researcher, I want to区分作者陈述、系统综合、推断和待核查内容, so that我不会把综合结论误认为原文事实。
22. As a researcher, I want to在 Direction Dossier 中查看起源、阶段、方法族、评价范式、能力、限制、分支和 frontier, so that我能决定下一步研究问题。
23. As a researcher, I want to让检索到的文献自动进入 Research Wiki, so that后续探索可以复用既有知识。
24. As a researcher, I want to让 Conversation 只展示当前运行的候选和解释, so that临时结果不会被误认为正式研究承诺。
25. As a researcher, I want to让 Canvas 只包含我主动保存或确认的对象, so that画布表达我的研究上下文。
26. As a researcher, I want to把 Wiki 中的 Paper 拖入 Canvas, so that我可以把系统知识转成自己的工作材料。
27. As a researcher, I want to让新文献以追加的 Snapshot、Assessment 或 revision 呈现, so that系统不会静默改写我已经确认的对象。
28. As a researcher, I want to从 Deep Dive 产物中选择 Research Question, so that后续 Problem 形成有明确来源。
29. As a researcher, I want to在 Problem、Hypothesis、Approach、Method 和 Evaluation 之间保持可追溯关系, so that最终 Idea 的推理链可审查。
30. As a researcher, I want to在任意阶段回到上游对象并生成新 revision, so that新证据或新理解可以修正研究方向。

## Implementation Decisions

- 维护现有 Research Flow 作为产品流程真值；不创建一条平行的“DeepFlow”产品向导。
- 将前半段语义固定为：Seed Framing 负责“我想研究什么”，Direction Exploration 负责“研究空间有哪些主要区域”，Direction Polish 负责“我想研究哪片区域”，Direction Deep Dive 负责“这片区域如何发展”。
- Seed 只承载用户兴趣、范围和未决术语，不自动加入 Direction、Gap、Novelty、Method、Hypothesis 或 Evaluation。
- Seed 的确认与启动 Direction Exploration 分开：用户确认 Seed 后仍需明确请求开始探索；SearchBrief 是派生检索工件，不是第二份 Seed 真值。
- Direction Exploration 采用 Recall-first、coverage-first 目标；不使用固定 Direction 数量作为停止条件。
- Direction Coverage 必须能表达已覆盖边界、已识别一级方向、待核查区域、重复/不确定区域和停止理由。
- Direction Candidate 默认只存在于 Conversation；用户保存后才创建 Canvas Research Object。保存不等于选中 Deep Dive。
- Direction Polish 是可重复的局部搜索与重聚类操作。它可以生成新的 Direction candidates，但不得直接创建 Research Question、Problem、Hypothesis、Approach、Method、Evaluation 或 Idea。
- 用户可以保存多个 Direction；一次 Deep Dive 必须带有用户明确指定的一个当前 Direction。
- Deep Dive V1 的固定执行链路是 Selected Direction → Focused Deep Research → 真实论文检索/去重/全文获取 → Research Wiki 摄入 → 逐篇论文理解 → Paper Section 抽取 → Direction Research Map。
- Deep Dive 的最小数据单元是 `Paper → Paper Section`。Paper Section V1 类型固定为 `problem`、`method`、`evaluation`、`result`、`limitation`；一篇 Paper 可以拥有多个同类型 Section。
- 每个 Paper Section 至少有 type、title、summary、detail、sourceLocation 和 paperId。Section 的 summary/detail 必须能回到原文位置；只能访问摘要时不得补造全文级方法、实验和结果。
- Deep Dive 的正式产物是由 Paper Evidence 支撑的 Direction Research Map / Dossier，而不是简单 chronology。Dossier 必须围绕 Problem/Question → Method → Capability → Evaluation → Limitation → Next Method/Reframing 组织证据。
- Deep Dive 分为两层：Layer 1 是 Paper Evidence，表达作者报告和原文细节；Layer 2 是 Direction Synthesis，聚合 Current Problems、Current Methods、Evaluation Practices、Observed Results 和 Common Limitations。Layer 2 的每个判断必须带 Section evidence refs，并标记 author-reported、cross-paper-synthesis、system-inference 或 needs-verification。
- 点击 Section 的追问上下文自动绑定当前 Direction、Paper、Paper Section 和对应原文证据；不能要求用户重新手工提供这些上下文。
- Research Question Formation 只处理“基于已有文献，我想继续追问什么”，不直接进入 Problem。用户从一个或多个 Problem / Limitation / Result Section 开始理解，再由 Agent 提出带来源的 RQ candidates。
- RQ candidates 可以是描述现象、解释原因或寻找解决方法的不同层次；这些候选先留在 Conversation，用户选择、修改并明确表达兴趣后才创建 Research Question Node。
- Research Question V1 只保存 Question、Why This Question、Derived From、Current Evidence、Status 和 Revision；不提前加入 Novelty、Gap、Problem、Method、Contribution 或 Hypothesis。
- Research Question 提供 Ask、Targeted Search 和 Polish 三种动作。Targeted Search 只更新 Current Evidence；Polish 创建新 revision；“未找到直接相关工作”不能自动升级为 Open Gap。
- RQ 的用户生命周期（exploring / confirmed / revised）与文献 Verification 状态（needs_verification / active / partially_addressed / addressed / superseded / inconclusive）独立管理。
- RQ 确认后不得直接进入 Method。先进行 Evaluation Exploration：从 RQ 拆出 Evaluation Targets，检索 Evaluation Sections，形成 Evaluation Strategy candidates，由用户选择或组合。
- Evaluation Strategy 确认后才进行 Method Exploration；每个 Method Candidate 必须说明实现方式、已有 Evaluation、Result、Limitation 和 Supporting Literature。
- Method 与 Evaluation 必须在 Research Design Co-Design 中联合收敛为 Research Design Candidate；Problem、Mechanism、Predictions、Falsifiers 和 Approach 作为设计层补充，不得抢在 Evaluation Strategy 之前决定方法。
- Research Design Candidate 至少包含 Research Question、Core Claim、Method、Evaluation、Supporting Literature 和 Known Risks；用户确认后才生成 Idea Draft。
- Idea Draft 不是 confirmed Idea，只组合已确认的 Research Design Candidate，并保留 Related Evidence 与 Open Risks。
- Idea 是由 Problem、Research Question、Core Claim、Method、Evaluation、Evidence / Related Work、Limitation / Risk 和 Contribution 组成的可替换 Section 集合，不是一次生成后固定的长文档。
- 每个 Idea Section 独立维护 Current、Evidence、Proposals 和 History，并支持 Ask、Prior Art / Similarity Search、Challenge、Accept、Edit、Reject 和 Replace。
- Section 的 Prior Art 结果必须拆成 Overlap、Difference 和 Uncertain；存在相似工作不能直接被系统写成“不新颖”。
- Section replacement 只替换当前 Section；如果 Method、Claim、Evaluation 或 Contribution 之间存在依赖，系统执行 dependency check 并提出待审阅 Section，不自动级联修改。
- Idea working state 可以暂时混合不同 Section revision；用户确认 Section 及其依赖审查后，才产生新的 semantic Idea revision。局部 Section Search 是默认循环，不等到最后统一做一次 novelty check。
- Method 说明至少覆盖研究对象、输入、步骤、机制、输出、基线和消融；Evaluation 说明至少覆盖任务/数据、对照、指标、失败判据、成本和泛化检查。缺失内容标记为 unavailable / needs_verification，不用模型记忆补齐。
- Research Wiki 是 Project-scoped 知识层，保存 Work、版本、全文片段、元数据、关系和 Evidence。所有 Research 操作可以向 Wiki 追加内容。
- Conversation 是 Exploration Space；Canvas 是 Commitment Space。Agent 不能把候选、推荐或 Wiki 事实静默写成 Canvas 承诺。
- Canvas 中的保存、选择和确认继续遵循“AI proposes. Human commits”。确认表示用户认可当前表述，不表示文献或实验已经证明它。
- 新文献不静默改写已确认对象；通过追加 Snapshot、Assessment 或 revision 提示用户是否需要回到上游修订。
- 既有 Seed→Idea 工作流接口保持为最高测试 seam：用一个从 Seed 开始的公共工作流入口覆盖 explore、polish、select、deep-dive dossier handoff 和后续 Idea spine。需要新增 seam 时优先新增该入口上的外部行为，而不是测试内部 Agent prompt 拼接。

## Testing Decisions

- 测试只验证用户可观察的外部行为：状态转换、候选是否写入正确空间、来源追踪、退出门槛、失败状态和 revision 行为；不测试 prompt 的具体措辞或内部聚类函数调用次数。
- Seed 测试覆盖：原始输入保留、未确认不能启动探索、确认与启动分离、修改后产生新 revision、旧确认不被覆盖。
- Direction Exploration 测试覆盖：空结果/部分覆盖可见、固定数量不是 gate、coverage 记录存在、候选只进入 Conversation、用户保存后才进入 Canvas。
- Direction Polish 测试覆盖：用户反馈会产生局部候选、可重复执行、候选携带来源、不会跳过到 Deep Dive 或后续 Idea 节点。
- Direction Selection 测试覆盖：多个 Direction 可保存，但 Deep Dive 必须绑定一个明确 selected Direction；没有用户选择时不得启动。
- Deep Dive 测试覆盖：固定链路会把真实论文摄入 Wiki 并产出 Paper Sections；一篇 Paper 可有多个同类型 Section；Section 能回到 sourceLocation；Section 点击追问携带 Direction/Paper/Section/证据上下文；Direction Map 的每个聚合项都能展开到一个或多个 Paper Section；Dossier 包含问题、方法、能力、评价、结果、限制和 frontier；方法或评价证据缺失时显示待核查而不是补造结论；Dossier 绑定固定的 Seed / Direction revision。
- Research Question 交接测试覆盖：Problem / Limitation Section 可以生成带 `derivedFromSectionRefs` 的候选 Question；没有 Section evidence refs 时不得把系统总结直接写成用户的 Research Question；用户可以先追问再确认。
- Research Question Formation 测试覆盖：从一个或多个 Section 生成候选；候选能区分描述现象、解释原因和寻找方法；Ask 不创建 Canvas 节点；Targeted Search 只追加 Wiki evidence；Polish 生成新 revision；确认前不写入 Canvas；RQ 不携带提前生成的 Gap / Novelty / Problem / Method / Hypothesis。
- Evaluation Exploration 测试覆盖：RQ 能拆出多个 Evaluation Targets；策略候选来自 Evaluation Sections；未确认前不生成 Method；用户可以选择、组合和拒绝策略；每项策略带适用范围、限制和来源。
- Method Exploration / Research Design 测试覆盖：只有在 Evaluation Strategy 确认后才形成 Method Candidates；每个候选可追溯到 Evaluation；Research Design Candidate 的 Claim、Method、Evaluation 能逐项对齐；未对齐候选不能进入 Idea Draft。
- Idea Draft 测试覆盖：Draft 只组合已确认的 Research Design Candidate，包含 Problem、RQ、Motivation / Limitation、Method、Claim、Evaluation、Evidence 和 Risks；Draft 不自动变为 confirmed Idea。
- Idea Section 测试覆盖：单独点击 Method / Claim / Evaluation 等 Section 可以触发带当前 Idea、Section 和证据上下文的 Ask / Search / Challenge；Prior Art 结果拆分 Overlap / Difference / Uncertain；Proposal 只有 Accept 或 Edit 后才能替换 Current；Reject 不改变当前 Section。
- Idea dependency 测试覆盖：Method replacement 会标记相关 Claim、Evaluation、Contribution 需要 recheck，但不会自动改写；用户确认依赖后才形成新的 semantic revision；History 保留被替换版本和原因。
- Wiki / Conversation / Canvas 测试覆盖：同一 Paper 在三层中的身份和权限不同；拖拽保存才创建 Canvas 对象；Wiki 刷新只追加新证据，不改写 confirmed revision。
- 使用现有 `research_workflow_advance` 的公共行为测试作为 prior art，沿用“explore 不产生 Canvas ops、commit 产生带来源连接的节点、Method 与 Evaluation 联合提交、Idea synthesis 需要完整上游”的断言风格。
- 运行端到端测试时，优先验证真实的用户输入→Agent 运行→候选/证据事件→Conversation/Wiki/Canvas 投影链路；不能用前端伪造事件或固定延时响应替代。

## Out of Scope

- 本 spec 不实现真实的全文检索、搜索供应商、论文下载、解析、去重或引用图算法。
- 本 spec 不要求 V1 一次性完成所有论文的全文获取；不可访问、解析失败和仅摘要可用都必须保留 coverage / verification 状态。
- 本 spec 不证明 Direction Coverage 已经穷尽整个学术领域，也不自动宣布 frontier、novelty 或 open gap。
- 本 spec 不实现服务端 Research Domain revision、关系校验、stale 自动传播或多用户云同步；当前纯前端模型不伪造这些语义。
- 本 spec 不把 Research Wiki 做成用户必须逐步进入的页面或 Wizard 步骤。
- 本 spec 不新增固定 taxonomy、固定 Direction 数量、推荐分、创新潜力分或自动选中的“最佳方向”。
- 本 spec 不在 Seed 阶段生成正式 Problem、Hypothesis、Method、Evaluation 或 Idea。
- 本 spec 不在 Direction Polish 阶段直接创建 Deep Dive、Research Question 或 Idea。
- 本 spec 不在 Research Question 确认后直接生成 Method；Evaluation Exploration 和 Method Exploration 是独立阶段。
- 本 spec 不把 Idea Section 的相似性结果自动解释为 Novelty 结论，也不自动级联替换依赖 Section。
- 本 spec 不实现实验运行、结果真实性判断、论文写作或生产部署。
- 本 spec 不删除或迁移现有浏览器 `infinite-canvas` 存储键，不改变媒体生成运行时能力。

## Further Notes

- 这是对现有产品流程真值的补充和收敛，后续实现级分步文档应按该顺序回写，尤其是 Seed、Direction Exploration、Direction Deep Dive 和 Research Question 的边界。
- 文档中的“本轮未找到”永远不能直接升级为“无人研究”“仍未解决”或“新颖”。
- 画布中的 Direction、Paper 和 Dossier 是用户工作上下文；Research Wiki 中的证据仍需带来源、范围、截止时间和 verification 状态。
- 当前任务只维护设计文档和 issue-tracker spec，不执行构建、测试或部署。
