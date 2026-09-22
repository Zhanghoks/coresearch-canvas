import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ResearchArtifactStore } from "./store.js";

test("artifacts are immutable, readable, and listed inside their inferred project", async (t) => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "research-artifacts-"));
    t.after(() => fs.rm(workspace, { recursive: true, force: true }));
    const store = new ResearchArtifactStore(workspace);

    const created = await store.write(
        { userId: "alice", projectId: "project-a", conversationId: "conversation-1", turnId: "turn-1" },
        {
            kind: "hypothesis-test-plan",
            title: "可证伪性检查",
            content: "# 检查\n\n失败判据",
            sourceNodeIds: ["hypothesis-1"],
        },
    );

    assert.equal(created.projectId, "project-a");
    assert.equal(created.mediaType, "text/markdown");
    assert.match(created.contentHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(await store.list("alice", "project-a"), [created]);
    assert.deepEqual(await store.read("alice", "project-a", created.id), { ...created, content: "# 检查\n\n失败判据" });
});

test("project scope cannot read another project's artifact", async (t) => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "research-artifacts-"));
    t.after(() => fs.rm(workspace, { recursive: true, force: true }));
    const store = new ResearchArtifactStore(workspace);
    const artifact = await store.write(
        { userId: "alice", projectId: "project-a", conversationId: "conversation-1", turnId: "turn-1" },
        { kind: "idea-review", title: "Idea Review", content: "review", sourceNodeIds: ["idea-1"] },
    );

    await assert.rejects(() => store.read("alice", "project-b", artifact.id), /找不到 Artifact/);
    assert.deepEqual(await store.list("alice", "project-b"), []);
    await assert.rejects(() => store.read("bob", "project-a", artifact.id), /找不到 Artifact/);
});

test("project ids never become filesystem paths", async (t) => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "research-artifacts-"));
    t.after(() => fs.rm(workspace, { recursive: true, force: true }));
    const store = new ResearchArtifactStore(workspace);

    const artifact = await store.write(
        { userId: "alice", projectId: "../../another-project", conversationId: "conversation-1", turnId: "turn-1" },
        { kind: "seed-brief", title: "Seed", content: "content", sourceNodeIds: ["seed-1"] },
    );

    assert.equal((await store.read("alice", "../../another-project", artifact.id)).content, "content");
    const projectEntries = await fs.readdir(path.join(workspace, "users", "alice", "projects"));
    assert.equal(projectEntries.length, 1);
    assert.match(projectEntries[0], /^[a-f0-9]{24}$/);
});
