import assert from "node:assert/strict";
import test from "node:test";

import { advanceResearchWorkflow, type ResearchWorkflowCandidate } from "./research-workflow.js";
import type { CanvasNode, CanvasSnapshot } from "./types.js";

function node(id: string, type: CanvasNode["type"], summary = id): CanvasNode {
    return {
        id,
        type,
        title: id,
        position: { x: 0, y: 0 },
        width: 280,
        height: 320,
        metadata: { summary, document: `# ${id}` },
    };
}

function apply(snapshot: CanvasSnapshot, ops: Array<Record<string, any>>): CanvasSnapshot {
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
                id: op.id || `${op.fromNodeId}--${op.toNodeId}`,
                fromNodeId: op.fromNodeId,
                toNodeId: op.toNodeId,
            });
    });
    return { ...snapshot, nodes, connections };
}

function candidate(nodeType: ResearchWorkflowCandidate["nodeType"], title = nodeType): ResearchWorkflowCandidate {
    return {
        nodeType,
        title,
        summary: `${title} 的核心判断`,
        document: `# ${title}\n\n## 边界\n\n测试文档`,
    };
}

test("exploring a Seed returns a grounded prompt without mutating the canvas", () => {
    const snapshot: CanvasSnapshot = {
        nodes: [node("seed-1", "seed", "研究人和 Agent 如何共同形成可验证问题")],
        connections: [],
    };
    const result = advanceResearchWorkflow(snapshot, {
        kind: "explore",
        sourceNodeIds: ["seed-1"],
        action: "探索研究方向",
    });

    assert.deepEqual(result.targetTypes, ["direction"]);
    assert.deepEqual(result.ops, []);
    assert.match(result.prompt, /Conversation/);
    assert.match(result.prompt, /用户明确保留/);
    assert.match(result.prompt, /研究人和 Agent/);
});

test("commit creates saved next-stage nodes connected to their exact source", () => {
    const snapshot: CanvasSnapshot = {
        nodes: [node("seed-1", "seed")],
        connections: [],
    };
    const result = advanceResearchWorkflow(snapshot, {
        kind: "commit",
        sourceNodeIds: ["seed-1"],
        confirmation: "保留 1 和 2",
        candidates: [candidate("direction", "方向一"), candidate("direction", "方向二")],
    });

    assert.equal(result.ops.filter((op) => op.type === "add_node").length, 2);
    assert.equal(result.ops.filter((op) => op.type === "connect_nodes").length, 2);
    assert.ok(result.ops.filter((op) => op.type === "add_node").every((op) => op.metadata?.researchWorkflow?.decision === "saved"));
    assert.equal(result.state.currentStage, "direction");
    const documents = result.ops.filter((op) => op.type === "add_node").map((op) => op.metadata.document as string);
    assert.ok(documents.every((document) => document.includes("## 边界") && document.includes("## 检索覆盖与待核查项")));
});

test("commit rejects skipping a research stage", () => {
    const snapshot: CanvasSnapshot = {
        nodes: [node("seed-1", "seed")],
        connections: [],
    };
    assert.throws(
        () =>
            advanceResearchWorkflow(snapshot, {
                kind: "commit",
                sourceNodeIds: ["seed-1"],
                confirmation: "直接形成问题",
                candidates: [candidate("problem")],
            }),
        /Seed.*Direction/,
    );
});

test("Approach commits Method and Evaluation as one co-design decision", () => {
    const snapshot: CanvasSnapshot = {
        nodes: [node("approach-1", "approach")],
        connections: [],
    };
    assert.throws(
        () =>
            advanceResearchWorkflow(snapshot, {
                kind: "commit",
                sourceNodeIds: ["approach-1"],
                confirmation: "采用",
                candidates: [candidate("method")],
            }),
        /Method.*Evaluation/,
    );

    const result = advanceResearchWorkflow(snapshot, {
        kind: "commit",
        sourceNodeIds: ["approach-1"],
        confirmation: "采用这组联合设计",
        candidates: [candidate("method"), candidate("evaluation")],
    });
    assert.deepEqual(
        result.ops
            .filter((op) => op.type === "add_node")
            .map((op) => op.nodeType)
            .sort(),
        ["evaluation", "method"],
    );
});

test("Idea synthesis requires the complete reasoning set and connects every source", () => {
    const incomplete: CanvasSnapshot = {
        nodes: [node("problem-1", "problem"), node("method-1", "method")],
        connections: [],
    };
    assert.throws(
        () =>
            advanceResearchWorkflow(incomplete, {
                kind: "synthesize",
                sourceNodeIds: ["problem-1", "method-1"],
                confirmation: "形成 Idea",
                candidates: [candidate("idea")],
            }),
        /Hypothesis.*Approach.*Evaluation/,
    );

    const sourceNodes = [
        node("seed-1", "seed"),
        node("direction-1", "direction"),
        node("rq-1", "research_question"),
        node("problem-1", "problem"),
        node("hypothesis-1", "hypothesis"),
        node("approach-1", "approach"),
        node("method-1", "method"),
        node("evaluation-1", "evaluation"),
    ];
    const result = advanceResearchWorkflow(
        { nodes: sourceNodes, connections: [] },
        {
            kind: "synthesize",
            sourceNodeIds: sourceNodes.map((item) => item.id),
            confirmation: "确认形成 Idea 草稿",
            candidates: [candidate("idea")],
        },
    );

    assert.equal(result.ops.filter((op) => op.type === "add_node" && op.nodeType === "idea").length, 1);
    assert.equal(result.ops.filter((op) => op.type === "connect_nodes").length, sourceNodes.length);
    assert.equal(result.state.currentStage, "idea");
    assert.equal(result.state.complete, true);
});

test("the public workflow interface can run the entire Seed-to-Idea spine", () => {
    let snapshot: CanvasSnapshot = {
        nodes: [node("seed-1", "seed")],
        connections: [],
    };
    let sourceIds = ["seed-1"];

    for (const nodeType of ["direction", "research_question", "problem", "hypothesis", "approach"] as const) {
        const result = advanceResearchWorkflow(snapshot, {
            kind: "commit",
            sourceNodeIds: sourceIds,
            confirmation: `保留 ${nodeType}`,
            candidates: [candidate(nodeType)],
        });
        snapshot = apply(snapshot, result.ops);
        sourceIds = result.createdNodeIds;
    }

    const design = advanceResearchWorkflow(snapshot, {
        kind: "commit",
        sourceNodeIds: sourceIds,
        confirmation: "确认 Method 与 Evaluation 联合设计",
        candidates: [candidate("method"), candidate("evaluation")],
    });
    snapshot = apply(snapshot, design.ops);

    const allResearchNodeIds = (snapshot.nodes || []).filter((item) => item.type !== "idea").map((item) => item.id);
    const idea = advanceResearchWorkflow(snapshot, {
        kind: "synthesize",
        sourceNodeIds: allResearchNodeIds,
        confirmation: "形成 Idea 草稿",
        candidates: [candidate("idea")],
    });
    snapshot = apply(snapshot, idea.ops);

    assert.deepEqual(
        (snapshot.nodes || []).map((item) => item.type),
        ["seed", "direction", "research_question", "problem", "hypothesis", "approach", "method", "evaluation", "idea"],
    );
    assert.equal(snapshot.connections?.length, 15);
    assert.equal(idea.state.complete, true);
});
