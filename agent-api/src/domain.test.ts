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

test("Agent 运行失败时服务端记录原始错误，推给前端的 payload 保持通用；abort 不记错误", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    const store = new InMemoryResearchStore();
    const project = await store.createProject("alice", "A");
    const ctx = { userId: "alice", projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId };
    const cause = new Error("找不到 Pi 模型：openai/deepseek-flash");
    const failing = new RuntimeManager({ execute: async () => { throw cause; } }, new EventHub());
    const conversation = await store.createConversation(ctx, "Failing");

    const { runId } = await failing.runTurn(store, ctx, { conversationId: conversation.id, prompt: "hi" });
    await waitForTerminal(store, ctx, conversation.id);

    const terminalEvent = (await store.listEvents(ctx, conversation.id, 0)).at(-1)!;
    assert.equal(terminalEvent.type, "run.failed");
    assert.deepEqual(terminalEvent.payload, { message: "Agent 运行失败" });
    assert.equal(logged.mock.callCount(), 1);
    const [message, error] = logged.mock.calls[0]!.arguments;
    assert.match(String(message), new RegExp(runId));
    assert.equal(error, cause);

    logged.mock.resetCalls();
    const aborting = new RuntimeManager({
        execute: (input) => new Promise((_, reject) => input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
    }, new EventHub());
    const second = await store.createConversation(ctx, "Aborted");
    const run = await aborting.runTurn(store, ctx, { conversationId: second.id, prompt: "hi" });
    await aborting.abort(store, ctx, second.id, run.runId);
    await waitForTerminal(store, ctx, second.id);
    assert.equal((await store.listEvents(ctx, second.id, 0)).at(-1)?.type, "run.aborted");
    assert.equal(logged.mock.callCount(), 0);
});

test("用户 JWT 在运行中途过期时，运行期间的写入仍经 runWrites 完成", async () => {
    const store = new InMemoryResearchStore();
    const project = await store.createProject("alice", "A");
    const ctx = { userId: "alice", projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId };
    const conversation = await store.createConversation(ctx, "Long run");
    // 模拟 JWT 过期：运行开始后，用户 store 的写全部 401。
    let expired = false;
    const expiringUserStore = Object.create(store) as InMemoryResearchStore;
    for (const method of ["appendEvent", "finishRun", "saveConversationSession"] as const) {
        const original = store[method].bind(store) as (...args: unknown[]) => Promise<unknown>;
        (expiringUserStore as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => expired ? Promise.reject(new AppError("JWT expired", 401, "auth_expired")) : original(...args);
    }
    const adapter: RuntimeAdapter = {
        execute: async (input) => {
            expired = true;
            await input.emit({ type: "assistant.delta", itemId: "m1", payload: { delta: "still here" } });
        },
    };
    const runtime = new RuntimeManager(adapter, new EventHub(), () => store);
    await runtime.runTurn(expiringUserStore, ctx, { conversationId: conversation.id, prompt: "hi" });
    await waitForTerminal(store, ctx, conversation.id);

    const events = await store.listEvents(ctx, conversation.id, 0);
    assert.deepEqual(events.map((event) => event.type), ["run.started", "assistant.delta", "run.completed"]);
});

async function waitForTerminal(store: InMemoryResearchStore, ctx: { userId: string; projectId: string; canvasWorkspaceId: string }, conversationId: string) {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
        const events = await store.listEvents(ctx, conversationId, 0);
        if (events.some((event) => ["run.completed", "run.failed", "run.aborted"].includes(event.type))) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("run 没有结束");
}

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

test("画布投影按 baseRevision 乐观锁保存，断边被丢弃，插件节点类型原样保留", async () => {
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
    assert.equal((await research.saveProjection(ctx, 0, body)).revision, 1);

    const projection = await research.readProjection(ctx);
    assert.equal(projection.nodes.length, 2);
    assert.equal(projection.nodes.find((node) => node.clientNodeId === "plugin-1-b")?.type, "acme:chart");
    assert.deepEqual(projection.edges.map((edge) => edge.clientEdgeId), ["e1"]);
    assert.equal(projection.viewport?.k, 2);
    assert.equal(projection.entities.length, 1);

    // 基于过期 revision 的保存被拒绝，并带回当前 revision；不写入任何东西。
    await assert.rejects(() => research.saveProjection(ctx, 0, { ...body, nodes: [] }), (error) =>
        error instanceof AppError && error.code === "canvas_revision_conflict" && error.details?.currentRevision === 1);
    assert.equal((await research.readProjection(ctx)).nodes.length, 2);
});

test("数据库错误映射：客户端拿到可区分的错误码，原始信息只留在 internal", async () => {
    const { databaseError } = await import("./supabase-store.js");
    const cases: Array<[Record<string, unknown>, number, string]> = [
        [{ code: "23505", message: 'duplicate key value violates unique constraint "one_active_run_per_conversation"' }, 409, "conversation_busy"],
        [{ code: "23505", message: 'duplicate key value violates unique constraint "research_relations_source_entity_id_target_entity_id_relation_type_key"' }, 409, "duplicate"],
        [{ code: "P0409", message: "canvas_revision_conflict", details: "7" }, 409, "canvas_revision_conflict"],
        [{ code: "P0409", message: "conversation_not_active" }, 409, "conversation_archived"],
        [{ code: "42501", message: "permission denied for table project_skills" }, 403, "forbidden"],
        [{ code: "PGRST303", message: "JWT issued at future" }, 401, "auth_expired"],
        [{ code: "22P02", message: 'invalid input syntax for type uuid: "x"' }, 400, "invalid_request"],
        [{ code: "XX000", message: "internal pg detail that must not leak" }, 500, "database_error"],
    ];
    for (const [raw, status, code] of cases) {
        const error = databaseError(raw as { code: string; message: string });
        assert.equal(error.statusCode, status, String(raw.code));
        assert.equal(error.code, code, String(raw.code));
        assert.equal(error.internal, raw);
        assert.ok(!error.message.includes("pg detail"), "原始数据库信息不能出现在返回给客户端的 message 里");
    }
    assert.deepEqual(databaseError({ code: "P0409", message: "canvas_revision_conflict", details: "7" }).details, { currentRevision: 7 });
});
