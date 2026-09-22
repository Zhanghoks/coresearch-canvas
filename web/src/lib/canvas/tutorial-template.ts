import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function createResearchTutorialProject(): Partial<CanvasProject> {
    const now = new Date().toISOString();
    const nodes: CanvasNodeData[] = [
        {
            id: "tutorial_guide",
            type: CanvasNodeType.Note,
            title: "教程｜从 Seed 形成研究 Idea",
            position: { x: -420, y: 40 },
            width: 300,
            height: 260,
            metadata: {
                status: "success",
                content:
                    "1. 在 Seed 中写下研究兴趣。\n2. 点击“继续研究”，选择“探索研究方向”。\n3. 在对话中比较 Agent 提出的候选。\n4. 明确保留哪些候选，再让 Agent 写入画布。\n5. 按 Direction → RQ → Problem → Hypothesis → Approach → Method / Evaluation → Idea 继续。",
                document:
                    "# 教程：人和 Agent 如何共同形成研究\n\n画布只保存你愿意承担的研究判断；Agent 的候选先留在对话中。\n\n## 基本循环\n\n1. **写节点**：卡片只写一句核心判断，完整论证进入 Markdown 文档。\n2. **请 Agent 探索**：从节点的“继续研究”选择动作。\n3. **比较候选**：要求 Agent 给出差异、依据、反证和未知项。\n4. **明确保留**：只有你明确说“保留第几个 / 写入画布”，Agent 才创建或修改节点。\n5. **连回依据**：新节点连接到它实际来源的上游节点。\n\n研究可以回到上游修订；Method 与 Evaluation 联合设计；Idea 综合多个已选择的上游对象，而不是自动生成的终点。",
            },
        },
        {
            id: "tutorial_seed",
            type: CanvasNodeType.Seed,
            title: "Seed｜输入你的研究想法",
            position: { x: -40, y: 40 },
            width: 300,
            height: 320,
            metadata: {
                status: "success",
                document: "# Seed\n\n## 原始输入\n\n## 当前主题理解\n\n## 相关概念\n\n## 待澄清的问题\n\n输入研究兴趣后，点击“继续研究 → 探索研究方向”。Agent 先在对话中提出候选；明确告诉 Agent 保留哪些方向后，再将它们加入画布。",
            },
        },
    ];

    return {
        title: "教程｜从 Seed 形成研究 Idea",
        createdAt: now,
        updatedAt: now,
        nodes,
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "dots",
        showImageInfo: false,
        viewport: { x: 520, y: 120, k: 0.72 },
    };
}
