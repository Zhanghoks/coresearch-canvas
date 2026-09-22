import crypto from "node:crypto";

import { appendMissingAuthoritativeHeadings, RESEARCH_DOCUMENT_SECTIONS } from "./research-headings.js";
import type { CanvasNode, CanvasSnapshot, ResearchFlowNodeType } from "./types.js";

export type ResearchWorkflowCandidate = {
    nodeType: ResearchFlowNodeType;
    title: string;
    summary: string;
    document: string;
};

export type ResearchWorkflowIntent =
    | { kind: "explore"; sourceNodeIds: string[]; action: string }
    | {
          kind: "commit";
          sourceNodeIds: string[];
          confirmation: string;
          candidates: ResearchWorkflowCandidate[];
      }
    | {
          kind: "synthesize";
          sourceNodeIds: string[];
          confirmation: string;
          candidates: ResearchWorkflowCandidate[];
      };

export type ResearchWorkflowState = {
    currentStage: ResearchFlowNodeType;
    completedTypes: ResearchFlowNodeType[];
    nextTypes: ResearchFlowNodeType[];
    missingForIdea: ResearchFlowNodeType[];
    complete: boolean;
};

export type ResearchWorkflowResult = {
    prompt: string;
    targetTypes: ResearchFlowNodeType[];
    ops: Array<Record<string, any>>;
    createdNodeIds: string[];
    state: ResearchWorkflowState;
};

type Contract = {
    label: string;
    question: string;
    candidateTask: string;
    targetTypes: ResearchFlowNodeType[];
    gate: string;
};

const ORDER: ResearchFlowNodeType[] = ["seed", "direction", "research_question", "problem", "hypothesis", "approach", "method", "evaluation", "idea"];
const IDEA_REQUIRED: ResearchFlowNodeType[] = ["problem", "hypothesis", "approach", "method", "evaluation"];

const CONTRACTS: Record<ResearchFlowNodeType, Contract> = {
    seed: {
        label: "Seed",
        question: "我对什么感兴趣，当前表达是否足以开始探索？",
        candidateTask: "提出 3–6 个宽泛且可比较的 Direction。每个候选说明研究范围、排除范围、分类轴和为什么值得继续理解；不要把它写成论文题目、具体方法或贡献。",
        targetTypes: ["direction"],
        gate: "用户明确保留至少一个 Direction；保存不等于选择深入。",
    },
    direction: {
        label: "Direction",
        question: "这片研究空间包含什么，用户具体想深入其中的什么问题？",
        candidateTask: "先用几句话概括范围和未知项。研究脉络写 3–5 条，每条必须分点，禁止写成一整段。格式：**脉络 A. 短标题**，下一行起四条列表：主张、做法、证据、边界，每条一句。论文和仓库不要嵌进脉络，用 research-source 围栏逐条列出。再提出 3–5 个 Research Question，每个单独成块，并分点写对象、条件、可观察结果、依据、取舍。不把问题线索冒充已证实的研究空白。",
        targetTypes: ["research_question"],
        gate: "用户明确选择或组合 1–3 个 Research Question。",
    },
    research_question: {
        label: "Research Question",
        question: "这个问题对应的具体困难是什么，为什么值得研究？",
        candidateTask: "提出 2–4 个 Problem 候选。每个候选必须说明源自哪些 Research Question、适用范围、非目标、已有处理和具体不足；使用校准语言，禁止把“未检索到”写成“从未有人做过”。",
        targetTypes: ["problem"],
        gate: "用户确认一个 Problem，并看见它的来源、范围和证据状态。",
    },
    problem: {
        label: "Problem",
        question: "什么机制可能解释这个困难，会产生什么可反驳的预测？",
        candidateTask: "提出 2–4 套 Hypothesis。分开写机制主张、成立条件、可检验预测、证伪条件、替代解释以及当前支持/反对证据；方法名称和预期提升不能当作假设证据。",
        targetTypes: ["hypothesis"],
        gate: "用户确认至少一套包含预测和证伪条件的 Hypothesis。",
    },
    hypothesis: {
        label: "Hypothesis",
        question: "采用什么总体策略可以检验该机制与预测？",
        candidateTask: "提出 2–4 个 Approach 候选。说明各自如何覆盖预测、处理混杂因素、依赖哪些假设、主要取舍和失败方式；比较检验策略，不用模型品牌代替 Approach。",
        targetTypes: ["approach"],
        gate: "用户确认主 Approach；未采纳候选留在 Conversation。",
    },
    approach: {
        label: "Approach",
        question: "如何把总体策略落实为可复现 Method，并用 Evaluation 真正检验主张？",
        candidateTask: "联合提出 Method 与 Evaluation 方案，不要先定方法再补指标。Method 写输入、步骤、输出、基线与消融；Evaluation 把每个主张绑定到指标、数据、对照、失败判据、成本和泛化检查。必须成对给出。",
        targetTypes: ["method", "evaluation"],
        gate: "用户同时确认 Method 组成及其 Evaluation 对齐关系。",
    },
    method: {
        label: "Method",
        question: "当前 Method 是否完整覆盖假设，Evaluation 是否能发现它失败？",
        candidateTask: "审查 Method 与相连 Evaluation 的覆盖关系，提出需要补充或修订的 Evaluation 候选。区分计划和已完成实现，不捏造实验结果。",
        targetTypes: ["evaluation"],
        gate: "Method 和 Evaluation 的主张、对照及失败判据可以逐项对齐。",
    },
    evaluation: {
        label: "Evaluation",
        question: "现有评价设计是否能支持或反驳主张，完整推理链能否进入综合？",
        candidateTask: "审计 Evaluation：逐项检查主张—指标、数据、基线、实验条件、失败判据、成本和泛化；指出缺口并建议回到相应上游修订。不要在探索动作中自动创建 Idea。",
        targetTypes: [],
        gate: "所有主要主张都有可失败的评价逻辑，才可请求 Idea Synthesis。",
    },
    idea: {
        label: "Idea",
        question: "这份 Idea 的逻辑、证据、最近邻定位和风险是否仍然成立？",
        candidateTask: "只做 Review：检查 Problem → Hypothesis → Method → Evaluation 链、证据缺口、最近邻工作、范围和风险。发现缺口时生成 Review Comment 或返回上游，不凭空增加新的核心研究对象。",
        targetTypes: [],
        gate: "用户确认当前 Idea Snapshot；确认不代表新颖性或实验结果已被证明。",
    },
};

export function advanceResearchWorkflow(snapshot: CanvasSnapshot, intent: ResearchWorkflowIntent): ResearchWorkflowResult {
    if (!intent || !Array.isArray(intent.sourceNodeIds)) throw new Error("研究工作流请求缺少 sourceNodeIds");
    const sources = resolveSources(snapshot.nodes || [], intent.sourceNodeIds);
    if (intent.kind === "explore") {
        if (!intent.action?.trim()) throw new Error("探索研究节点需要明确动作");
        return explore(snapshot, sources, intent.action);
    }
    if (!intent.confirmation?.trim()) throw new Error("写入研究画布需要可追溯的用户确认文本");
    if (!Array.isArray(intent.candidates) || !intent.candidates.length) throw new Error("至少需要一个用户确认的候选");
    return intent.kind === "synthesize" ? synthesize(snapshot, sources, intent) : commit(snapshot, sources, intent);
}

function explore(snapshot: CanvasSnapshot, sources: CanvasNode[], action: string): ResearchWorkflowResult {
    if (sources.length !== 1) throw new Error("探索动作必须精确引用一个研究节点");
    const source = sources[0];
    const contract = CONTRACTS[source.type as ResearchFlowNodeType];
    const prompt = [
        "你正在执行 " + contract.label + " 节点动作：“" + action + "”。",
        "核心问题：" + contract.question,
        "当前节点：" + (source.title || source.id) + " (" + source.id + ")",
        "核心表述：" + (textField(source, "summary") || "未填写"),
        "Markdown 文档：\\n" + (textField(source, "document") || "未填写"),
        "当前文档权威章节：" + RESEARCH_DOCUMENT_SECTIONS[source.type as ResearchFlowNodeType].map((section) => "## " + section).join("、"),
        ...(contract.targetTypes.length
            ? ["下一阶段文档必须包含的 ##：" + contract.targetTypes.map((type) => CONTRACTS[type].label + "（" + RESEARCH_DOCUMENT_SECTIONS[type].join(" / ") + "）").join("；")]
            : []),
        "读写规则：先读完整 document 再整篇改写；保留用户已有正文和自定义 ##；权威标题缺失时只追加；summary 是独立 Preview，不得从 Markdown 摘取；核心含义变化时同步 summary。",
        "候选任务：" + contract.candidateTask,
        "输出要求：候选只出现在 Conversation；为每个候选给出标题、核心判断、边界、依据/待核查项和主要取舍。事实、推断、用户决定和验证计划分开表述。",
        "Exit Gate：" + contract.gate,
        "在用户明确保留、采用或写入画布之前，禁止调用任何画布写工具。需要写入时调用 research_workflow_advance 的 commit 或 synthesize，而不是自行拼 canvas_create_node / canvas_apply_ops。",
    ].join("\\n\\n");
    return {
        prompt,
        targetTypes: contract.targetTypes,
        ops: [],
        createdNodeIds: [],
        state: deriveWorkflowState(snapshot),
    };
}

function commit(snapshot: CanvasSnapshot, sources: CanvasNode[], intent: Extract<ResearchWorkflowIntent, { kind: "commit" }>): ResearchWorkflowResult {
    const sourceTypes = uniqueTypes(sources);
    if (sourceTypes.length !== 1) throw new Error("普通阶段提交必须来自同一类型的上游节点");
    const sourceType = sourceTypes[0];
    const expected = CONTRACTS[sourceType].targetTypes;
    if (!expected.length) throw new Error(CONTRACTS[sourceType].label + " 没有可直接提交的下一节点，请先修订上游或使用 Idea Synthesis");
    validateCandidateTypes(sourceType, expected, intent.candidates);
    if (sourceType === "approach") {
        const candidateTypes = new Set(intent.candidates.map((item) => item.nodeType));
        if (!candidateTypes.has("method") || !candidateTypes.has("evaluation")) throw new Error("Approach 的下一步必须把 Method 与 Evaluation 作为一次联合设计提交");
    }
    const created = createCandidateOps(sources, intent.candidates, intent.confirmation);
    const projected = projectSnapshot(snapshot, created.ops);
    return {
        prompt: "",
        targetTypes: expected,
        ops: created.ops,
        createdNodeIds: created.ids,
        state: deriveWorkflowState(projected),
    };
}

function synthesize(snapshot: CanvasSnapshot, sources: CanvasNode[], intent: Extract<ResearchWorkflowIntent, { kind: "synthesize" }>): ResearchWorkflowResult {
    const missing = IDEA_REQUIRED.filter((type) => !sources.some((node) => node.type === type));
    if (missing.length) throw new Error("Idea Synthesis 缺少已选择的上游对象：" + missing.map((type) => CONTRACTS[type].label).join("、"));
    if (intent.candidates.length !== 1 || intent.candidates[0].nodeType !== "idea") throw new Error("Idea Synthesis 每次只能提交一份 Idea 草稿");
    const created = createCandidateOps(sources, intent.candidates, intent.confirmation);
    const projected = projectSnapshot(snapshot, created.ops);
    return {
        prompt: "",
        targetTypes: ["idea"],
        ops: created.ops,
        createdNodeIds: created.ids,
        state: deriveWorkflowState(projected),
    };
}

function validateCandidateTypes(sourceType: ResearchFlowNodeType, expected: ResearchFlowNodeType[], candidates: ResearchWorkflowCandidate[]) {
    const invalid = candidates.filter((candidate) => !expected.includes(candidate.nodeType));
    if (!invalid.length) return;
    throw new Error(CONTRACTS[sourceType].label + " 的下一步只能形成 " + expected.map((type) => CONTRACTS[type].label).join(" / ") + "，不能直接形成 " + invalid.map((item) => CONTRACTS[item.nodeType].label).join("、"));
}

function createCandidateOps(sources: CanvasNode[], candidates: ResearchWorkflowCandidate[], confirmation: string) {
    const anchorX = Math.max(...sources.map((node) => node.position.x + node.width)) + 120;
    const anchorY = Math.min(...sources.map((node) => node.position.y));
    const ids = candidates.map((candidate) => candidate.nodeType + "-" + crypto.randomUUID());
    const addOps = candidates.map((candidate, index) => {
        validateCandidate(candidate);
        return {
            type: "add_node",
            id: ids[index],
            nodeType: candidate.nodeType,
            title: candidate.title.trim(),
            position: {
                x: anchorX + (index % 2) * 360,
                y: anchorY + Math.floor(index / 2) * 380,
            },
            width: 300,
            height: 320,
            metadata: {
                status: "success",
                summary: candidate.summary.trim(),
                document: appendMissingAuthoritativeHeadings(candidate.document.trim(), candidate.nodeType, candidate.title.trim()),
                researchWorkflow: {
                    decision: "saved",
                    sourceNodeIds: sources.map((node) => node.id),
                    confirmation: confirmation.trim(),
                    stage: candidate.nodeType,
                },
            },
        };
    });
    const connectOps = ids.flatMap((toNodeId) =>
        sources.map((source) => ({
            type: "connect_nodes",
            fromNodeId: source.id,
            toNodeId,
        })),
    );
    return { ids, ops: [...addOps, ...connectOps] };
}

function validateCandidate(candidate: ResearchWorkflowCandidate) {
    if (!candidate.title.trim()) throw new Error(CONTRACTS[candidate.nodeType].label + " 候选缺少标题");
    if (!candidate.summary.trim()) throw new Error(CONTRACTS[candidate.nodeType].label + " 候选缺少核心判断");
    if (!candidate.document.trim()) throw new Error(CONTRACTS[candidate.nodeType].label + " 候选缺少 Markdown 文档");
}

function resolveSources(nodes: CanvasNode[], sourceNodeIds: string[]) {
    if (!sourceNodeIds.length) throw new Error("研究工作流必须指定上游节点");
    const sources = sourceNodeIds.map((id) => nodes.find((node) => node.id === id));
    const missing = sourceNodeIds.filter((_, index) => !sources[index]);
    if (missing.length) throw new Error("找不到上游节点：" + missing.join("、"));
    const resolved = sources as CanvasNode[];
    const nonResearch = resolved.filter((node) => !Object.prototype.hasOwnProperty.call(CONTRACTS, node.type));
    if (nonResearch.length) throw new Error("非研究节点不能推进工作流：" + nonResearch.map((node) => node.id).join("、"));
    return resolved;
}

function deriveWorkflowState(snapshot: CanvasSnapshot): ResearchWorkflowState {
    const completedTypes = ORDER.filter((type) => (snapshot.nodes || []).some((node) => node.type === type));
    const currentStage = completedTypes.at(-1) || "seed";
    return {
        currentStage,
        completedTypes,
        nextTypes: CONTRACTS[currentStage].targetTypes,
        missingForIdea: IDEA_REQUIRED.filter((type) => !completedTypes.includes(type)),
        complete: completedTypes.includes("idea"),
    };
}

function projectSnapshot(snapshot: CanvasSnapshot, ops: Array<Record<string, any>>): CanvasSnapshot {
    const nodes = [...(snapshot.nodes || [])];
    const connections = [...(snapshot.connections || [])];
    ops.forEach((op) => {
        if (op.type === "add_node")
            nodes.push({
                id: op.id,
                type: op.nodeType,
                title: op.title,
                position: op.position,
                width: op.width,
                height: op.height,
                metadata: op.metadata,
            });
        if (op.type === "connect_nodes")
            connections.push({
                id: op.id || op.fromNodeId + "--" + op.toNodeId,
                fromNodeId: op.fromNodeId,
                toNodeId: op.toNodeId,
            });
    });
    return { ...snapshot, nodes, connections };
}

function textField(node: CanvasNode, field: string) {
    const value = node.metadata?.[field];
    return typeof value === "string" ? value : "";
}

function uniqueTypes(nodes: CanvasNode[]) {
    return [...new Set(nodes.map((node) => node.type as ResearchFlowNodeType))];
}

export function workflowDocumentSections(type: ResearchFlowNodeType) {
    return RESEARCH_DOCUMENT_SECTIONS[type];
}
