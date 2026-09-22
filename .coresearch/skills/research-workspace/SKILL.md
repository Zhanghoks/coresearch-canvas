---
name: research-workspace
description: 保存、列出或读取当前 Canvas Project 的研究 Artifact。用户说保存分析、导出研究说明、查看产物、读取某个 Artifact 时使用。
---

# Research Workspace

Canvas 节点是研究承诺的权威表达；Artifact 是不可变的 Markdown 派生产物。只有用户明确要求保存或导出时才写，不要在普通 explore / commit 后自动写。

## Tools

- 保存：`research_artifact_write({ kind, title, content, sourceNodeIds })`
- 列表：`research_artifact_list({})`
- 读取：`research_artifact_read({ artifactId })`

不得传入路径、用户或 Project；工具从当前 Canvas 推导作用域。修改已有产物时创建新 Artifact，不覆盖旧内容。

执行前按节点类型选择 `kind`，完整映射见 [Artifact contract](references/artifact-contract.md)。需要解释运行目录时读取 [Workspace layout](references/workspace-layout.md)。
