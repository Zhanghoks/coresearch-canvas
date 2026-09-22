import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_AGENT_PERMISSION_MODE, resolveAgentPermissionMode } from "./permission-mode.js";

test("resolveAgentPermissionMode keeps explicit modes and defaults to full", () => {
    assert.equal(resolveAgentPermissionMode("request"), "request");
    assert.equal(resolveAgentPermissionMode("automatic"), "automatic");
    assert.equal(resolveAgentPermissionMode("full"), "full");
    assert.equal(resolveAgentPermissionMode(undefined), DEFAULT_AGENT_PERMISSION_MODE);
    assert.equal(resolveAgentPermissionMode("bogus"), DEFAULT_AGENT_PERMISSION_MODE);
});
