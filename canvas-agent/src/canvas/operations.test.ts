import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCanvasToolRequest } from "./operations.js";
import { compactNode, parseToolInput } from "./tools.js";

function opsOf(name: Parameters<typeof buildCanvasToolRequest>[0], input: Record<string, unknown>) {
    const request = buildCanvasToolRequest(name, input, null);
    return (request.input as { ops: Array<Record<string, any>> }).ops;
}

test("generation flow reuses referenced nodes when the prompt only mentions them", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "@[node:text-1]", referenceNodeIds: ["text-1"], title: "Flow", autoRun: true });
    const addedTextNodes = ops.filter((op) => op.type === "add_node" && op.nodeType === "text");
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    const runs = ops.filter((op) => op.type === "run_generation");
    assert.equal(addedTextNodes.length, 0);
    assert.equal(ops.filter((op) => op.type === "connect_nodes" && op.fromNodeId === "text-1" && String(op.toNodeId).startsWith("config-")).length, 1);
    assert.match(String(config?.metadata?.prompt), /^@\[node:text-1\]$/);
    assert.equal(runs.length, 1);
});

test("generation flow still creates a prompt node for prose prompts", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "a cat on a roof", referenceNodeIds: ["text-1"], autoRun: true });
    assert.equal(ops.filter((op) => op.type === "add_node" && op.nodeType === "text").length, 1);
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    assert.match(String(config?.metadata?.prompt), /@\[node:text-/);
});

test("canvas_create_node accepts research flow types", () => {
    const ops = opsOf("canvas_create_node", { nodeType: "seed", title: "兴趣", metadata: { summary: "AI 时代的研究训练" } });
    assert.equal(ops.length, 1);
    assert.equal(ops[0].type, "add_node");
    assert.equal(ops[0].nodeType, "seed");
    assert.equal(ops[0].title, "兴趣");
    assert.equal(ops[0].metadata?.summary, "AI 时代的研究训练");
});

test("canvas_update_node_text writes summary for research cards and content for text nodes", () => {
    const seedState = { nodes: [{ id: "seed-1", type: "seed" as const, position: { x: 0, y: 0 }, width: 280, height: 320, metadata: { summary: "" } }] };
    const researchOps = buildCanvasToolRequest("canvas_update_node_text", { id: "seed-1", text: "更可检验的兴趣" }, seedState).input as { ops: Array<Record<string, any>> };
    assert.equal(researchOps.ops[0].metadata.summary, "更可检验的兴趣");
    assert.equal(researchOps.ops[0].metadata.content, "更可检验的兴趣");

    const textState = { nodes: [{ id: "text-1", type: "text" as const, position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { content: "旧文本" } }] };
    const textOps = buildCanvasToolRequest("canvas_update_node_text", { id: "text-1", text: "新文本" }, textState).input as { ops: Array<Record<string, any>> };
    assert.equal(textOps.ops[0].metadata.content, "新文本");
    assert.equal(textOps.ops[0].metadata.summary, undefined);
});

test("tool schema accepts research node types", () => {
    const created = parseToolInput("canvas_create_node", { nodeType: "seed", metadata: { summary: "x" } });
    assert.equal(created.nodeType, "seed");
    const applied = parseToolInput("canvas_apply_ops", { ops: [{ type: "add_node", nodeType: "direction" }] });
    assert.equal((applied.ops[0] as { nodeType?: string }).nodeType, "direction");
});

test("canvas_apply_ops accepts the complete research reasoning spine", () => {
    const types = ["seed", "direction", "research_question", "problem", "hypothesis", "approach", "method", "evaluation", "idea"];
    const nodes = types.map((nodeType, index) => ({
        type: "add_node",
        id: `research-${index}`,
        nodeType,
        title: nodeType,
        metadata: { summary: `${nodeType} summary`, document: `# ${nodeType}` },
    }));
    const connections = types.slice(1).map((_, index) => ({
        type: "connect_nodes",
        fromNodeId: `research-${index}`,
        toNodeId: `research-${index + 1}`,
    }));

    const parsed = parseToolInput("canvas_apply_ops", { ops: [...nodes, ...connections] });
    assert.equal(parsed.ops.length, 17);
    assert.deepEqual(parsed.ops.slice(0, 9).map((op) => (op as { nodeType?: string }).nodeType), types);
    assert.equal((parsed.ops.at(-1) as { toNodeId?: string }).toNodeId, "research-8");
});

test("canvas_create_node accepts literature web nodes", () => {
    const created = parseToolInput("canvas_create_node", { nodeType: "web", title: "Agentic Harness Engineering", metadata: { sourceUrl: "https://arxiv.org/abs/2604.25850", summary: "Harness 演化与验证", groupId: "literature-1" } });
    assert.equal(created.nodeType, "web");
    const ops = opsOf("canvas_create_node", { nodeType: "web", title: "Agentic Harness Engineering", metadata: { sourceUrl: "https://arxiv.org/abs/2604.25850" } });
    assert.equal(ops[0].nodeType, "web");
    assert.equal(ops[0].metadata?.sourceUrl, "https://arxiv.org/abs/2604.25850");
});

test("compactNode truncates long research summaries", () => {
    const summary = "摘要".repeat(130);
    const node = compactNode({ id: "seed-1", type: "seed", position: { x: 0, y: 0 }, width: 280, height: 320, metadata: { summary } });
    assert.ok(String(node.metadata?.summary).length < summary.length);
    assert.ok(String(node.metadata?.summary).endsWith("..."));
});
