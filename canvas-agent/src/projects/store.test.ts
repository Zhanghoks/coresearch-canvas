import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { projectDir } from "../workspace-paths.js";
import { LOCAL_USER_ID, mergeLegacyLocalUsers, ProjectFileStore } from "./store.js";

test("projects are isolated by user and stored under hashed keys", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "canvas-projects-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = new ProjectFileStore(root);

    const alice = await store.put("alice", { id: "project-a", title: "Alice A", nodes: [{ id: "n1" }], connections: [] });
    await store.put("alice", { id: "project-b", title: "Alice B", nodes: [], connections: [] });
    await store.put("bob", { id: "project-c", title: "Bob C", nodes: [], connections: [] });

    const aliceProjects = await store.list("alice");
    assert.equal(aliceProjects.map((item) => item.id).sort().join(","), "project-a,project-b");
    assert.equal(aliceProjects.find((item) => item.id === "project-a")?.nodeCount, 1);
    assert.equal(aliceProjects.find((item) => item.id === "project-a")?.connectionCount, 0);
    assert.equal((await store.list("bob")).map((item) => item.id).join(","), "project-c");
    await assert.rejects(() => store.get("bob", "project-a"), /找不到项目/);
    await assert.rejects(() => store.put("bob", { id: "project-a", ownerUserId: "alice", title: "stolen" }), /不能写入其他用户的项目/);

    const loaded = await store.get("alice", "project-a");
    assert.equal(loaded.nodes.length, 1);
    assert.ok(loaded.canvasWorkspaceId);
    assert.equal(alice.canvasWorkspaceId, loaded.canvasWorkspaceId);

    const dir = projectDir(root, "alice", "project-a");
    assert.match(path.basename(dir), /^[a-f0-9]{24}$/);
    for (const name of ["documents", "artifacts", "assets", "skills", "conversations"]) {
        assert.equal((await fs.stat(path.join(dir, name))).isDirectory(), true);
    }

    await store.delete("alice", "project-a");
    await store.delete("alice", "project-a");
    assert.equal((await store.list("alice")).map((item) => item.id).join(","), "project-b");
});

test("project ids never become filesystem paths", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "canvas-projects-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = new ProjectFileStore(root);
    await store.put("alice", { id: "../../evil", title: "nope", nodes: [], connections: [] });
    const entries = await fs.readdir(path.join(root, "users", "alice", "projects"));
    assert.equal(entries.length, 1);
    assert.match(entries[0], /^[a-f0-9]{24}$/);
});

test("legacy random local users are merged into the fixed local user", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "canvas-projects-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = new ProjectFileStore(root);
    const legacyA = "local-11111111-1111-4111-8111-111111111111";
    const legacyB = "local-22222222-2222-4222-8222-222222222222";
    await store.put(legacyA, { id: "project-a", title: "A", nodes: [{ id: "n1" }], connections: [] });
    await store.put(legacyB, { id: "project-b", title: "B", nodes: [], connections: [] });
    await store.put("alice", { id: "project-c", title: "C", nodes: [], connections: [] });

    const moved = await mergeLegacyLocalUsers(root);

    assert.equal(moved.length, 2);
    const merged = await store.list(LOCAL_USER_ID);
    assert.equal(merged.map((item) => item.id).sort().join(","), "project-a,project-b");
    assert.equal((await store.get(LOCAL_USER_ID, "project-a")).nodes?.length, 1);
    assert.equal((await store.list("alice")).length, 1);
    const users = (await fs.readdir(path.join(root, "users"))).sort();
    assert.deepEqual(users, ["alice", LOCAL_USER_ID]);
    assert.equal((await mergeLegacyLocalUsers(root)).length, 0);
});
