import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { AppError } from "./errors.js";
import { ServiceRoleRunWriter } from "./supabase-store.js";
import { adminClient, inMemoryHarness, supabaseHarness, supabaseTestEnv, type StoreHarness, type TestUser } from "./testing/store-harness.js";
import { AGENT_PROTOCOL_VERSION, PI_SESSION_STORAGE_VERSION, type NewRuntimeEvent, type RequestContext, type ResearchRevisionInput } from "./types.js";

// 同一套场景同时跑内存实现和真实 Supabase（设置 SUPABASE_TEST_URL 时）。
// 内存实现曾在列级 grant、CHECK、触发器上与 Postgres 行为不一致，单测通过而生产报错；这里把两者钉在同一份契约上。
const env = supabaseTestEnv();
const harnesses: StoreHarness[] = [inMemoryHarness(), ...(env ? [supabaseHarness(env)] : [])];

for (const harness of harnesses) {
    describe(`ResearchStore contract (${harness.name})`, () => {
        after(() => harness.cleanup());

        test("Project 只对所有者可见，删除后读不到", async () => {
            const alice = await harness.createUser();
            const bob = await harness.createUser();
            const project = await alice.store.createProject(alice.id, "Alice");
            assert.equal(project.ownerUserId, alice.id);
            assert.deepEqual((await alice.store.listProjects(alice.id)).map((item) => item.id), [project.id]);
            assert.deepEqual(await bob.store.listProjects(bob.id), []);
            await rejectsWith(() => bob.store.readProject(bob.id, project.id), 404, "project_not_found");
            await rejectsWith(() => bob.store.deleteProject(bob.id, project.id), 404, "project_not_found");
            await alice.store.deleteProject(alice.id, project.id);
            await rejectsWith(() => alice.store.readProject(alice.id, project.id), 404, "project_not_found");
        });

        test("新画布 revision 为 0、快照为空", async () => {
            const { user, ctx } = await projectContext(harness);
            const canvas = await user.store.readCanvas(ctx);
            assert.equal(canvas.revision, 0);
            assert.equal(canvas.snapshot, null);
        });

        test("画布快照按 baseRevision 乐观锁保存，revision 由服务端分配", async () => {
            const { user, ctx } = await projectContext(harness);
            const first = await user.store.saveCanvasState(ctx, 0, { nodes: ["a"] });
            assert.equal(first.revision, 1);
            const second = await user.store.saveCanvasState(ctx, 1, { nodes: ["a", "b"] });
            assert.equal(second.revision, 2);
            // 基于旧版本的写入（乱序到达或另一个标签页）被拒绝，并带回当前 revision；不写入。
            await rejectsWith(() => user.store.saveCanvasState(ctx, 1, { nodes: ["stale"] }), 409, "canvas_revision_conflict", { currentRevision: 2 });
            const canvas = await user.store.readCanvas(ctx);
            assert.equal(canvas.revision, 2);
            assert.deepEqual(canvas.snapshot, { nodes: ["a", "b"] });
        });

        test("画布投影与快照共用 revision，拒绝重复节点 ID 和跨项目实体", async () => {
            const alice = await projectContext(harness);
            const other = await projectContext(harness);
            const seed = await alice.user.store.createEntity(alice.ctx, "seed", revision("S"));
            const foreign = await other.user.store.createEntity(other.ctx, "seed", revision("F"));
            const node = (clientNodeId: string, entityId?: string) => ({ clientNodeId, type: "seed", entityId: entityId ?? null, x: 0, y: 0, width: 1, height: 1, groupClientId: null, displayState: {} });
            const saved = await alice.user.store.saveCanvasProjection(alice.ctx, 0, { nodes: [node("n1", seed.id)], edges: [], viewport: null });
            assert.equal(saved.revision, 1);
            await rejectsWith(() => alice.user.store.saveCanvasState(alice.ctx, 0, {}), 409, "canvas_revision_conflict", { currentRevision: 1 });
            await rejectsWith(() => alice.user.store.saveCanvasProjection(alice.ctx, 1, { nodes: [node("dup"), node("dup")], edges: [], viewport: null }), 400, "invalid_projection");
            await rejectsWith(() => alice.user.store.saveCanvasProjection(alice.ctx, 1, { nodes: [node("x", foreign.id)], edges: [], viewport: null }), 400, "invalid_projection");
            assert.equal((await alice.user.store.readCanvas(alice.ctx)).revision, 1);
        });

        test("Skill 首次保存插入、再次保存更新同一条", async () => {
            const { user, ctx } = await projectContext(harness);
            const created = await user.store.saveSkill(ctx, { name: "lab", definition: "v1", enabled: true });
            const updated = await user.store.saveSkill(ctx, { name: "lab", definition: "v2", enabled: false });
            assert.equal(updated.id, created.id);
            assert.deepEqual((await user.store.listSkills(ctx)).map((skill) => [skill.name, skill.definition, skill.enabled]), [["lab", "v2", false]]);
            await user.store.deleteSkill(ctx, "lab");
            await rejectsWith(() => user.store.deleteSkill(ctx, "lab"), 404, "skill_not_found");
        });

        test("同一对话同时只能有一个运行中的 run，结束后可再开", async () => {
            const { user, ctx } = await projectContext(harness);
            const conversation = await user.store.createConversation(ctx, "C");
            const run = await user.store.beginRun(ctx, conversation.id);
            assert.equal(run.status, "running");
            await rejectsWith(() => user.store.beginRun(ctx, conversation.id), 409, "conversation_busy");
            await rejectsWith(() => user.store.archiveConversation(ctx, conversation.id), 409, "conversation_busy");
            await user.store.finishRun(ctx, run.id, "completed");
            assert.equal((await user.store.readRun(ctx, conversation.id, run.id)).status, "completed");
            const next = await user.store.beginRun(ctx, conversation.id);
            await user.store.finishRun(ctx, next.id, "aborted");
        });

        test("已归档对话不能开始新 run", async () => {
            const { user, ctx } = await projectContext(harness);
            const conversation = await user.store.createConversation(ctx, "C");
            await user.store.archiveConversation(ctx, conversation.id);
            await rejectsWith(() => user.store.beginRun(ctx, conversation.id), 409, "conversation_archived");
        });

        test("事件 sequence 单调递增，after 游标只返回之后的事件", async () => {
            const { user, ctx } = await projectContext(harness);
            const conversation = await user.store.createConversation(ctx, "C");
            const run = await user.store.beginRun(ctx, conversation.id);
            const first = await user.store.appendEvent(ctx, event(ctx, conversation.id, run.id, "run.started"));
            const second = await user.store.appendEvent(ctx, event(ctx, conversation.id, run.id, "assistant.delta"));
            assert.ok(second.sequence > first.sequence);
            assert.deepEqual((await user.store.listEvents(ctx, conversation.id, first.sequence)).map((item) => item.type), ["assistant.delta"]);
            await user.store.finishRun(ctx, run.id, "completed");
        });

        test("对话 session 按 revision 乐观锁保存", async () => {
            const { user, ctx } = await projectContext(harness);
            const conversation = await user.store.createConversation(ctx, "C");
            const initial = await user.store.loadConversationSession(ctx, conversation.id);
            assert.equal(initial.revision, 0);
            const session = { storageVersion: PI_SESSION_STORAGE_VERSION, revision: 0, header: { v: 1 }, entries: [{ n: 1 }] };
            assert.equal(await user.store.saveConversationSession(ctx, conversation.id, session), 1);
            await rejectsWith(() => user.store.saveConversationSession(ctx, conversation.id, session), 409, "session_revision_conflict");
            const loaded = await user.store.loadConversationSession(ctx, conversation.id);
            assert.equal(loaded.revision, 1);
            assert.deepEqual(loaded.entries, [{ n: 1 }]);
        });

        test("研究关系：重复创建返回同一条，不能自指", async () => {
            const { user, ctx } = await projectContext(harness);
            const a = await user.store.createEntity(ctx, "seed", revision("A"));
            const b = await user.store.createEntity(ctx, "direction", revision("B"));
            const relation = await user.store.createRelation(ctx, { sourceEntityId: a.id, targetEntityId: b.id, relationType: "derives" });
            const again = await user.store.createRelation(ctx, { sourceEntityId: a.id, targetEntityId: b.id, relationType: "derives" });
            assert.equal(again.id, relation.id);
            assert.equal((await user.store.listRelations(ctx)).length, 1);
            await rejectsWith(() => user.store.createRelation(ctx, { sourceEntityId: a.id, targetEntityId: a.id, relationType: "derives" }), 400, "relation_self_reference");
            await user.store.deleteRelation(ctx, relation.id);
            await rejectsWith(() => user.store.deleteRelation(ctx, relation.id), 404, "relation_not_found");
        });

        test("确认新 revision 时旧的 confirmed 变为 superseded", async () => {
            const { user, ctx } = await projectContext(harness);
            const entity = await user.store.createEntity(ctx, "seed", { ...revision("v1"), status: "confirmed" });
            await user.store.appendEntityRevision(ctx, entity.id, { ...revision("v2"), status: "confirmed" });
            const revisions = await user.store.listEntityRevisions(ctx, entity.id);
            assert.deepEqual(revisions.map((item) => [item.revision, item.status]), [[1, "superseded"], [2, "confirmed"]]);
            assert.equal((await user.store.readEntity(ctx, entity.id)).head?.revision, 2);
        });
    });
}

if (env) {
    describe("ServiceRoleRunWriter（service role，仅真实 Supabase）", () => {
        const harness = supabaseHarness(env);
        const admin = adminClient(env);
        after(() => harness.cleanup());

        test("只能写本次运行范围内的事件、终态与 session，写入对用户可见", async () => {
            const { user, ctx } = await projectContext(harness);
            const conversation = await user.store.createConversation(ctx, "C");
            const run = await user.store.beginRun(ctx, conversation.id);
            const writer = new ServiceRoleRunWriter(admin, { ctx, conversationId: conversation.id, runId: run.id });

            await writer.appendEvent(ctx, event(ctx, conversation.id, run.id, "run.started"));
            const session = await user.store.loadConversationSession(ctx, conversation.id);
            assert.equal(await writer.saveConversationSession(ctx, conversation.id, { ...session, entries: [{ n: 1 }] }), 1);
            await rejectsWith(() => writer.saveConversationSession(ctx, conversation.id, { ...session, entries: [{ n: 2 }] }), 409, "session_revision_conflict");
            await writer.finishRun(ctx, run.id, "completed");

            assert.deepEqual((await user.store.listEvents(ctx, conversation.id, 0)).map((item) => item.type), ["run.started"]);
            assert.equal((await user.store.readRun(ctx, conversation.id, run.id)).status, "completed");
            assert.deepEqual((await user.store.loadConversationSession(ctx, conversation.id)).entries, [{ n: 1 }]);
        });

        test("拒绝范围之外的 run、对话、项目；伪造范围也写不到别人的运行", async () => {
            const alice = await projectContext(harness);
            const bob = await projectContext(harness);
            const aliceConversation = await alice.user.store.createConversation(alice.ctx, "A");
            const aliceRun = await alice.user.store.beginRun(alice.ctx, aliceConversation.id);
            const otherRun = await alice.user.store.createConversation(alice.ctx, "A2").then((item) => alice.user.store.beginRun(alice.ctx, item.id));
            const writer = new ServiceRoleRunWriter(admin, { ctx: alice.ctx, conversationId: aliceConversation.id, runId: aliceRun.id });

            await rejectsWith(() => writer.finishRun(alice.ctx, otherRun.id, "completed"), 403, "run_scope_violation");
            await rejectsWith(() => writer.appendEvent(alice.ctx, event(alice.ctx, aliceConversation.id, otherRun.id, "run.started")), 403, "run_scope_violation");
            await rejectsWith(() => writer.appendEvent(bob.ctx, event(bob.ctx, aliceConversation.id, aliceRun.id, "run.started")), 403, "run_scope_violation");

            // 即使构造出一个声称属于 Bob 的范围，显式的 actor/owner 过滤也命中不到 Alice 的运行。
            const forged = new ServiceRoleRunWriter(admin, { ctx: { ...alice.ctx, userId: bob.user.id }, conversationId: aliceConversation.id, runId: aliceRun.id });
            await rejectsWith(() => forged.finishRun({ ...alice.ctx, userId: bob.user.id }, aliceRun.id, "completed"), 404, "run_not_found");
            assert.equal((await alice.user.store.readRun(alice.ctx, aliceConversation.id, aliceRun.id)).status, "running");
            await writer.finishRun(alice.ctx, aliceRun.id, "aborted");
        });
    });
}

async function projectContext(harness: StoreHarness): Promise<{ user: TestUser; ctx: RequestContext }> {
    const user = await harness.createUser();
    const project = await user.store.createProject(user.id, "P");
    return { user, ctx: { userId: user.id, projectId: project.id, canvasWorkspaceId: project.canvasWorkspaceId } };
}

function event(ctx: RequestContext, conversationId: string, runId: string, type: NewRuntimeEvent["type"]): NewRuntimeEvent {
    return { protocolVersion: AGENT_PROTOCOL_VERSION, type, projectId: ctx.projectId, canvasWorkspaceId: ctx.canvasWorkspaceId, conversationId, threadId: conversationId, runId, turnId: runId, itemId: runId, payload: {} };
}

function revision(title: string): ResearchRevisionInput {
    return { title, summary: "", document: "", attributes: {}, status: "draft" };
}

async function rejectsWith(fn: () => Promise<unknown>, status: number, code: string, details?: Record<string, unknown>) {
    await assert.rejects(fn, (error) => {
        assert.ok(error instanceof AppError, `期望 AppError，实际 ${error instanceof Error ? error.message : String(error)}`);
        assert.equal(error.code, code);
        assert.equal(error.statusCode, status);
        if (details) assert.deepEqual(error.details, details);
        return true;
    });
}
