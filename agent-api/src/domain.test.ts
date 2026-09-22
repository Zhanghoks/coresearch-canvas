import assert from "node:assert/strict";
import test from "node:test";

import { CanvasBridge } from "./canvas-bridge.js";
import { AppError } from "./errors.js";
import { EventHub } from "./event-hub.js";
import { InMemoryResearchStore } from "./in-memory-store.js";
import { ProjectModule } from "./project-module.js";
import { ResearchModule } from "./research-module.js";
import type { RuntimeAdapter } from "./runtime.js";
import { RuntimeManager } from "./runtime-manager.js";

test("每个用户只能读取自己的 Project，且每个 Project 有不同的唯一 Canvas Workspace", async () => {
    const store = new InMemoryResearchStore();
    const projects = new ProjectModule(store);
    const aliceA = await projects.create("alice", { name: "A" });
    const aliceB = await projects.create("alice", { name: "B" });
    const bob = await projects.create("bob", { name: "B" });

    assert.notEqual(aliceA.canvasWorkspaceId, aliceB.canvasWorkspaceId);
    assert.deepEqual((await projects.listMine("alice")).map((project) => project.id).sort(), [aliceA.id, aliceB.id].sort());
    assert.deepEqual((await projects.listMine("bob")).map((project) => project.id), [bob.id]);
    await assert.rejects(() => projects.readOwned("alice", bob.id), (error) => error instanceof AppError && error.code === "project_not_found");
});

test("伪造另一个 Project 的 Canvas Workspace 或 Conversation 会被拒绝", async () => {
    const store = new InMemoryResearchStore();
    const projectA = await store.createProject("alice", "A");
    const projectB = await store.createProject("alice", "B");
    const ctxA = { userId: "alice", projectId: projectA.id, canvasWorkspaceId: projectA.canvasWorkspaceId };
    const ctxB = { userId: "alice", projectId: projectB.id, canvasWorkspaceId: projectB.canvasWorkspaceId };
    const conversationA = await store.createConversation(ctxA, "A conversation");

    await assert.rejects(() => store.readCanvas({ ...ctxA, canvasWorkspaceId: projectB.canvasWorkspaceId }), (error) => error instanceof AppError && error.code === "canvas_scope_mismatch");
    await assert.rejects(() => store.readConversation(ctxB, conversationA.id), (error) => error instanceof AppError && error.code === "conversation_not_found");
});

test("Conversation session 使用 revision 比较并交换，避免覆盖并发历史", async () => {
    const store = new InMemoryResearchStore();
    const project = await store.createProject("alice", "A");
    const ctx = { userId: "alice", projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId };
    const conversation = await store.createConversation(ctx, "Conversation");
    const original = await store.loadConversationSession(ctx, conversation.id);

    assert.equal(await store.saveConversationSession(ctx, conversation.id, { ...original, entries: [{ type: "message" }] }), 1);
    await assert.rejects(() => store.saveConversationSession(ctx, conversation.id, original), (error) => error instanceof AppError && error.code === "session_revision_conflict");
});

test("Project Skill 和 Canvas 工具调用不能跨 Project", async () => {
    const store = new InMemoryResearchStore();
    const canvas = new CanvasBridge();
    const projectA = await store.createProject("alice", "A");
    const projectB = await store.createProject("alice", "B");
    const ctxA = { userId: "alice", projectId: projectA.id, canvasWorkspaceId: projectA.canvasWorkspaceId };
    const ctxB = { userId: "alice", projectId: projectB.id, canvasWorkspaceId: projectB.canvasWorkspaceId };

    await store.saveSkill(ctxA, { name: "A only", definition: "Only A", enabled: true });
    assert.equal((await store.listSkills(ctxA)).length, 1);
    assert.equal((await store.listSkills(ctxB)).length, 0);

    canvas.publishSnapshot(ctxA, "browser-a", 1, { project: "A" });
    assert.equal(canvas.readSnapshot(ctxA).snapshot.project, "A");
    assert.throws(() => canvas.readSnapshot(ctxB), (error) => error instanceof AppError && error.code === "canvas_not_connected");

    const controller = new AbortController();
    const mutation = canvas.requestMutation(ctxA, controller.signal);
    assert.throws(() => canvas.completeMutation(ctxB, mutation.callId, { approved: true }), (error) => error instanceof AppError && error.code === "canvas_tool_call_not_found");
    controller.abort();
    await assert.rejects(mutation.result, (error) => error instanceof AppError && error.code === "run_aborted");
});

test("同一 Conversation 拒绝并发 run，不同 Conversation 可以并行，abort 只有一个终态", async () => {
    const store = new InMemoryResearchStore();
    const adapter = new BlockingRuntime();
    const runtime = new RuntimeManager(adapter, new EventHub());
    const project = await store.createProject("alice", "A");
    const ctx = { userId: "alice", projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId };
    const firstConversation = await store.createConversation(ctx, "First");
    const secondConversation = await store.createConversation(ctx, "Second");

    await store.archiveConversation(ctx, secondConversation.id);
    await assert.rejects(() => runtime.runTurn(store, ctx, { conversationId: secondConversation.id, prompt: "archived" }), (error) => error instanceof AppError && error.code === "conversation_archived");
    const activeSecondConversation = await store.createConversation(ctx, "Active second");

    const first = await runtime.runTurn(store, ctx, { conversationId: firstConversation.id, prompt: "first" });
    await assert.rejects(() => runtime.runTurn(store, ctx, { conversationId: firstConversation.id, prompt: "conflict" }), (error) => error instanceof AppError && error.code === "conversation_busy");
    await assert.rejects(() => store.archiveConversation(ctx, firstConversation.id), (error) => error instanceof AppError && error.code === "conversation_busy");
    const second = await runtime.runTurn(store, ctx, { conversationId: activeSecondConversation.id, prompt: "parallel" });

    await runtime.abort(store, ctx, firstConversation.id, first.runId);
    adapter.complete(second.runId);
    await adapter.settled(first.runId);
    await adapter.settled(second.runId);
    await new Promise((resolve) => setImmediate(resolve));

    const firstEvents = await store.listEvents(ctx, firstConversation.id, 0);
    assert.equal(firstEvents.filter((event) => ["run.completed", "run.failed", "run.aborted"].includes(event.type)).length, 1);
    assert.equal(firstEvents.at(-1)?.type, "run.aborted");
    assert.equal((await store.readRun(ctx, firstConversation.id, first.runId)).status, "aborted");
    assert.equal((await store.readRun(ctx, activeSecondConversation.id, second.runId)).status, "completed");
});

class BlockingRuntime implements RuntimeAdapter {
    private readonly completions = new Map<string, () => void>();
    private readonly settlements = new Map<string, Promise<void>>();

    execute(input: Parameters<RuntimeAdapter["execute"]>[0]) {
        const promise = new Promise<void>((resolve) => {
            this.completions.set(input.runId, resolve);
            input.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        this.settlements.set(input.runId, promise);
        return promise;
    }

    complete(runId: string) {
        this.completions.get(runId)?.();
    }

    settled(runId: string) {
        return this.settlements.get(runId) || Promise.resolve();
    }
}

test("Research Entity 追加 revision 推进 head，确认时旧的 confirmed 落为 superseded", async () => {
    const store = new InMemoryResearchStore();
    const research = new ResearchModule(store);
    const project = await store.createProject("alice", "A");
    const ctx = { userId: "alice", projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId };

    const seed = await research.createEntity(ctx, { type: "seed", title: "Agent Harness 自进化" });
    assert.equal(seed.head?.revision, 1);
    assert.equal(seed.head?.status, "draft");

    await research.confirmEntity(ctx, seed.id, {});
    await research.appendRevision(ctx, seed.id, { title: "收窄后的 Seed", status: "confirmed" });

    const revisions = await research.listRevisions(ctx, seed.id);
    assert.deepEqual(revisions.map((item) => item.status), ["draft", "superseded", "confirmed"]);
    // head 永远指向最新一条，正文只增不改。
    assert.equal((await research.readEntity(ctx, seed.id)).head?.revision, 3);
    assert.equal(revisions[0]?.title, "Agent Harness 自进化");
});

test("不支持的研究对象类型和 revision 状态会被拒绝", async () => {
    const store = new InMemoryResearchStore();
    const research = new ResearchModule(store);
    const project = await store.createProject("alice", "A");
    const ctx = { userId: "alice", projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId };

    await assert.rejects(() => research.createEntity(ctx, { type: "note", title: "x" }), (error) => error instanceof AppError && error.code === "invalid_entity_type");
    await assert.rejects(() => research.createEntity(ctx, { type: "seed", title: "x", status: "done" }), (error) => error instanceof AppError && error.code === "invalid_revision_status");
    await assert.rejects(() => research.createEntity(ctx, { type: "seed", title: "  " }), (error) => error instanceof AppError && error.code === "invalid_input");
});

test("Research Entity 和研究关系不能跨 Project 读取", async () => {
    const store = new InMemoryResearchStore();
    const research = new ResearchModule(store);
    const projectA = await store.createProject("alice", "A");
    const projectB = await store.createProject("alice", "B");
    const ctxA = { userId: "alice", projectId: projectA.id, canvasWorkspaceId: projectA.canvasWorkspaceId };
    const ctxB = { userId: "alice", projectId: projectB.id, canvasWorkspaceId: projectB.canvasWorkspaceId };

    const seed = await research.createEntity(ctxA, { type: "seed", title: "A 的 Seed" });
    const direction = await research.createEntity(ctxA, { type: "direction", title: "A 的 Direction" });
    await research.createRelation(ctxA, { sourceEntityId: seed.id, targetEntityId: direction.id, relationType: "derived_from" });

    assert.equal((await research.listEntities(ctxA)).length, 2);
    assert.equal((await research.listEntities(ctxB)).length, 0);
    assert.equal((await research.listRelations(ctxB)).length, 0);
    await assert.rejects(() => research.readEntity(ctxB, seed.id), (error) => error instanceof AppError && error.code === "entity_not_found");
});

test("画布投影按 revision 单调推进，断边被丢弃，插件节点类型原样保留", async () => {
    const store = new InMemoryResearchStore();
    const research = new ResearchModule(store);
    const project = await store.createProject("alice", "A");
    const ctx = { userId: "alice", projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId };
    const seed = await research.createEntity(ctx, { type: "seed", title: "Seed" });

    const body = {
        revision: 1,
        nodes: [
            { clientNodeId: "seed-1-a", type: "seed", entityId: seed.id, x: 10, y: 20, width: 280, height: 420 },
            { clientNodeId: "plugin-1-b", type: "acme:chart", x: 0, y: 0, width: 100, height: 100, displayState: { foo: 1 } },
        ],
        edges: [
            { clientEdgeId: "e1", sourceClientNodeId: "seed-1-a", targetClientNodeId: "plugin-1-b" },
            { clientEdgeId: "e2", sourceClientNodeId: "seed-1-a", targetClientNodeId: "missing" },
        ],
        viewport: { x: 5, y: 6, k: 2, showImageInfo: true },
    };
    assert.equal((await research.saveProjection(ctx, 1, body)).revision, 1);

    const projection = await research.readProjection(ctx);
    assert.equal(projection.nodes.length, 2);
    assert.equal(projection.nodes.find((node) => node.clientNodeId === "plugin-1-b")?.type, "acme:chart");
    assert.deepEqual(projection.edges.map((edge) => edge.clientEdgeId), ["e1"]);
    assert.equal(projection.viewport?.k, 2);
    assert.equal(projection.entities.length, 1);

    // 过期 revision 不写入，调用方据返回值判断冲突。
    assert.equal((await research.saveProjection(ctx, 1, { ...body, nodes: [] })).revision, 1);
    assert.equal((await research.readProjection(ctx)).nodes.length, 2);
});
