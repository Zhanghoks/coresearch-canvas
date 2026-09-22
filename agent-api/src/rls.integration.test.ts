import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const enabled = process.env.RUN_SUPABASE_RLS_TESTS === "1";

test("Supabase RLS isolates users and projects", { skip: !enabled }, async () => {
    const url = required("SUPABASE_URL");
    const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
    const secretKey = required("SUPABASE_SECRET_KEY");
    const admin = client(url, secretKey);
    const suffix = crypto.randomUUID();
    const password = `Rls-${suffix}`;
    const users: User[] = [];

    try {
        const alice = await createUser(admin, `rls-alice-${suffix}@research-canvas.test`, password);
        const bob = await createUser(admin, `rls-bob-${suffix}@research-canvas.test`, password);
        users.push(alice, bob);
        const aliceDb = await signedInClient(url, publishableKey, alice.email!, password);
        const bobDb = await signedInClient(url, publishableKey, bob.email!, password);

        const projectA = await createProject(aliceDb, "Project A");
        const projectB = await createProject(aliceDb, "Project B");
        assert.notEqual(projectA.canvas_workspace_id, projectB.canvas_workspace_id);

        const { data: workspaces, error: workspaceError } = await aliceDb.from("canvas_workspaces").select("id, project_id").eq("project_id", projectA.id);
        assert.ifError(workspaceError);
        assert.deepEqual(workspaces, [{ id: projectA.canvas_workspace_id, project_id: projectA.id }]);

        const { data: bobProjects, error: bobProjectError } = await bobDb.from("projects").select("id").eq("id", projectA.id);
        assert.ifError(bobProjectError);
        assert.deepEqual(bobProjects, []);
        const { data: deletedProjects, error: deleteError } = await bobDb.from("projects").delete().eq("id", projectA.id).select("id");
        assert.ifError(deleteError);
        assert.deepEqual(deletedProjects, []);

        const { error: forgedProjectError } = await aliceDb.from("projects").insert({ owner_user_id: alice.id, name: "forged" });
        assert.ok(forgedProjectError, "客户端不能绕过 Project + Canvas 事务入口直接创建 Project");
        const { error: forgedCanvasError } = await aliceDb.from("canvas_workspaces").insert({ project_id: projectA.id });
        assert.ok(forgedCanvasError, "客户端不能为一个 Project 直接创建第二个 Canvas Workspace");

        const conversationId = crypto.randomUUID();
        const { error: conversationError } = await aliceDb.from("conversations").insert({ id: conversationId, project_id: projectA.id, owner_user_id: alice.id, title: "Alice conversation" });
        assert.ifError(conversationError);
        const { data: bobConversations, error: bobConversationError } = await bobDb.from("conversations").select("id").eq("id", conversationId);
        assert.ifError(bobConversationError);
        assert.deepEqual(bobConversations, []);
        const { error: forgedConversationError } = await bobDb.from("conversations").insert({ project_id: projectA.id, owner_user_id: bob.id, title: "forged" });
        assert.ok(forgedConversationError);

        const { error: skillError } = await aliceDb.from("project_skills").insert({ project_id: projectA.id, name: "alice-only", definition: "private" });
        assert.ifError(skillError);
        const { data: bobSkills, error: bobSkillError } = await bobDb.from("project_skills").select("id").eq("project_id", projectA.id);
        assert.ifError(bobSkillError);
        assert.deepEqual(bobSkills, []);

        // Research Entity / revision：Bob 拿着真实 id 也读不到、改不动。
        const seed = await createEntity(aliceDb, projectA.id, "seed", "Alice Seed");
        const { data: bobEntities, error: bobEntityError } = await bobDb.from("research_entities").select("id").eq("id", seed.id);
        assert.ifError(bobEntityError);
        assert.deepEqual(bobEntities, []);
        const { data: bobRevisions, error: bobRevisionError } = await bobDb.from("research_entity_revisions").select("id").eq("entity_id", seed.id);
        assert.ifError(bobRevisionError);
        assert.deepEqual(bobRevisions, []);
        const { data: bobArchived, error: bobArchiveError } = await bobDb.from("research_entities").update({ archived_at: new Date().toISOString() }).eq("id", seed.id).select("id");
        assert.ifError(bobArchiveError);
        assert.deepEqual(bobArchived, [], "Bob 不能归档 Alice 的研究对象");
        const { error: forgedEntityError } = await bobDb.from("research_entities").insert({ project_id: projectA.id, type: "seed", created_by: bob.id });
        assert.ok(forgedEntityError, "Bob 不能往 Alice 的 Project 插入研究对象");

        // Revision 正文不可改写：只有 status 列被 grant。
        const { error: revisionRewriteError } = await aliceDb.from("research_entity_revisions").update({ document: "rewritten" }).eq("entity_id", seed.id);
        assert.ok(revisionRewriteError, "revision 正文不能原地改写，修订必须追加新 revision");

        // Canvas projection：跨 Project 与跨用户都拿不到行。
        const { error: projectionError } = await aliceDb.rpc("save_canvas_projection", {
            target_project_id: projectA.id,
            target_revision: 1,
            next_nodes: [{ clientNodeId: "seed-1-a", type: "seed", entityId: seed.id, x: 1, y: 2, width: 280, height: 420, displayState: {} }],
            next_edges: [],
            next_viewport: { x: 0, y: 0, k: 1, showImageInfo: false },
        });
        assert.ifError(projectionError);
        const { data: aliceNodes, error: aliceNodeError } = await aliceDb.from("canvas_nodes").select("client_node_id").eq("project_id", projectA.id);
        assert.ifError(aliceNodeError);
        assert.deepEqual(aliceNodes, [{ client_node_id: "seed-1-a" }]);
        const { data: bobNodes, error: bobNodeError } = await bobDb.from("canvas_nodes").select("id").eq("project_id", projectA.id);
        assert.ifError(bobNodeError);
        assert.deepEqual(bobNodes, []);
        const { data: bobProjection, error: bobProjectionError } = await bobDb.rpc("save_canvas_projection", {
            target_project_id: projectA.id,
            target_revision: 99,
            next_nodes: [],
            next_edges: [],
            next_viewport: null,
        });
        assert.ifError(bobProjectionError);
        assert.deepEqual(bobProjection, [], "Bob 调同一个 RPC 也命中不到 Alice 的画布");
        const { data: stillThere } = await aliceDb.from("canvas_nodes").select("client_node_id").eq("project_id", projectA.id);
        assert.deepEqual(stillThere, [{ client_node_id: "seed-1-a" }], "Bob 的调用没有删掉 Alice 的节点");
    } finally {
        for (const user of users) await admin.auth.admin.deleteUser(user.id);
    }
});

function client(url: string, key: string) {
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createUser(admin: SupabaseClient, email: string, password: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    assert.ok(data.user);
    return data.user;
}

async function signedInClient(url: string, key: string, email: string, password: string) {
    const auth = client(url, key);
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    assert.ok(data.session?.access_token);
    return createClient(url, key, {
        accessToken: async () => data.session!.access_token,
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

async function createProject(database: SupabaseClient, name: string) {
    const { data, error } = await database.rpc("create_project_with_canvas", { project_name: name });
    assert.ifError(error);
    assert.ok(Array.isArray(data) && data.length === 1);
    return data[0] as { id: string; canvas_workspace_id: string };
}

async function createEntity(database: SupabaseClient, projectId: string, type: string, title: string) {
    const { data, error } = await database.rpc("create_research_entity", {
        target_project_id: projectId,
        entity_type: type,
        next_title: title,
        next_summary: "",
        next_document: "",
        next_attributes: {},
        next_status: "draft",
    });
    assert.ifError(error);
    assert.ok(Array.isArray(data) && data.length === 1);
    return data[0] as { id: string };
}

function required(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`缺少环境变量 ${name}`);
    return value;
}
