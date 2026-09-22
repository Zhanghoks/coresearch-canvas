import { RESEARCH_DOCUMENT_SECTIONS } from "@research-headings";
import type { CanvasNodeData, ResearchFlowNodeType } from "@/types/canvas";

type ResearchContract = { question: string; next: string; boundary: string; sections: readonly string[]; actions: string[] };

export const researchContracts: Record<ResearchFlowNodeType, ResearchContract> = {
    seed: {
        question: "我对什么感兴趣？",
        next: "探索 Direction 候选",
        boundary: "保留原始兴趣和含义；不代填研究空白、方法、贡献或评价方案。",
        sections: RESEARCH_DOCUMENT_SECTIONS.seed,
        actions: ["澄清 Seed", "探索研究方向", "查相关研究"],
    },
    direction: {
        question: "这个主题可以往哪一片研究空间探索？",
        next: "形成 Research Question",
        boundary: "保持宽泛，说明包含与排除范围；具体可回答的问题属于 RQ。保存方向不等于选定深入。",
        sections: RESEARCH_DOCUMENT_SECTIONS.direction,
        actions: ["深入研究此方向", "展开子方向", "梳理研究问题"],
    },
    research_question: {
        question: "我具体想知道什么？",
        next: "确认 Problem",
        boundary: "明确对象、条件和可回答的问题；问题线索不自动成为研究空白或已选 Problem。",
        sections: RESEARCH_DOCUMENT_SECTIONS.research_question,
        actions: ["收窄问题", "核查已有工作", "提出 Problem 候选"],
    },
    problem: {
        question: "我决定研究什么困难，为什么值得研究？",
        next: "提出可证伪 Hypothesis",
        boundary: "交代源自哪些 RQ、适用范围和已有方案的具体不足；未检索到不等于从未有人做过。",
        sections: RESEARCH_DOCUMENT_SECTIONS.problem,
        actions: ["寻找支持与反证", "检查问题范围", "提出机制假设"],
    },
    hypothesis: {
        question: "什么机制可能解释问题，会产生什么可反驳的预测？",
        next: "选择 Approach",
        boundary: "必须区分机制、预测和证伪条件；方法名称和预期提升不是假设证据。",
        sections: RESEARCH_DOCUMENT_SECTIONS.hypothesis,
        actions: ["挑战假设", "补充证伪条件", "比较检验策略"],
    },
    approach: {
        question: "总体采用什么策略解决或检验？",
        next: "联合设计 Method / Evaluation",
        boundary: "说明策略与假设的对应及取舍；实现步骤放在 Method，实验判据放在 Evaluation。",
        sections: RESEARCH_DOCUMENT_SECTIONS.approach,
        actions: ["比较替代策略", "识别取舍", "联合设计 Method / Evaluation"],
    },
    method: {
        question: "具体怎么实施并形成可复现的比较？",
        next: "对齐 Evaluation",
        boundary: "写清输入、步骤、输出与对照；区分计划和已完成实现，同时设计 Evaluation。",
        sections: RESEARCH_DOCUMENT_SECTIONS.method,
        actions: ["细化实施步骤", "检查基线与消融", "对齐评价方案"],
    },
    evaluation: {
        question: "什么结果支持或反驳当前主张？",
        next: "综合为 Idea",
        boundary: "每个指标对应具体主张；给出对照和失败判据，验证计划不能写成实验结果。",
        sections: RESEARCH_DOCUMENT_SECTIONS.evaluation,
        actions: ["检查是否检验假设", "补充失败判据", "综合为 Idea"],
    },
    idea: {
        question: "已选择的研究判断共同形成了什么研究？",
        next: "Review / Revision",
        boundary: "综合已确认的上游对象并保留引用；缺失项明确留空，不生成一条新研究路线来补齐。",
        sections: RESEARCH_DOCUMENT_SECTIONS.idea,
        actions: ["审阅推理链", "检查证据缺口", "比较最近邻工作"],
    },
};

export function getResearchContract(type: string): ResearchContract | undefined {
    return Object.prototype.hasOwnProperty.call(researchContracts, type) ? researchContracts[type as ResearchFlowNodeType] : undefined;
}

export function nodeDocumentMarkdown(node: CanvasNodeData) {
    return typeof node.metadata?.document === "string" ? node.metadata.document : "";
}
