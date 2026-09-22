<!-- CoResearch managed skill resource -->
# Artifact contract

| 来源阶段 | kind | 典型内容 |
| --- | --- | --- |
| Seed | `seed-brief` | 原始兴趣、澄清、边界 |
| Direction | `direction-map` | 方向空间、分歧、选择依据 |
| Research Question | `rq-comparison` | 问题比较与可回答性 |
| Problem | `problem-evidence` | 问题范围与证据审计 |
| Hypothesis | `hypothesis-test-plan` | 机制、预测、证伪条件 |
| Approach | `approach-tradeoff` | 路线取舍与风险 |
| Method | `method-protocol` | 输入、步骤、输出、基线、消融 |
| Evaluation | `evaluation-matrix` | 主张—指标、对照、失败判据 |
| Idea | `idea-review` | 逻辑、证据和风险审阅 |
| 论文规划 | `paper-plan` | Claims-Evidence Matrix、章节与图表计划 |
| 论文草稿 | `paper-draft` | 叙事报告或投稿前说明，不替代 `paper/` 源文件 |
| 论文审计 | `paper-audit` | 数字/引用/验收门禁报告 |
| 跨阶段导出 | `export` | 引用已确认节点的完整研究说明 |

调用 `research_artifact_write` 时只传 `kind`、`title`、Markdown `content`、真实 `sourceNodeIds`。Artifact 不创建或修改研究节点；需要改变研究承诺时回到对应节点 Skill。
