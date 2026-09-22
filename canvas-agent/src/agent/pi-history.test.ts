import assert from "node:assert/strict";
import test from "node:test";

import { summarizePiSession } from "./pi-history.js";

test("summarizePiSession maps session list items to thread summaries", () => {
    const summary = summarizePiSession({
        id: "session-1",
        name: "Seed 探索",
        cwd: "/tmp/workspace",
        messageCount: 1,
        firstMessage: "帮我读画布",
        allMessagesText: "帮我读画布",
        created: new Date(1_700_000_000_000),
        modified: new Date(1_700_000_100_000),
        path: "/tmp/pi-agent/sessions/session-1.jsonl",
    } as Parameters<typeof summarizePiSession>[0], "/ws");
    assert.equal(summary.id, "session-1");
    assert.equal(summary.sessionId, "session-1");
    assert.equal(summary.preview, "帮我读画布");
    assert.equal(summary.name, "Seed 探索");
    assert.equal(summary.source, "pi");
    assert.equal(summary.cwd, "/tmp/workspace");
});
