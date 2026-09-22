import type { AgentPermissionMode } from "./types.js";

/** 本地 Pi Agent 默认权限：完全访问；可用 CANVAS_AGENT_PERMISSION_MODE 覆盖。 */
export const DEFAULT_AGENT_PERMISSION_MODE: AgentPermissionMode =
    process.env.CANVAS_AGENT_PERMISSION_MODE === "request" ? "request"
    : process.env.CANVAS_AGENT_PERMISSION_MODE === "automatic" ? "automatic"
    : "full";

export function resolveAgentPermissionMode(value: unknown, fallback = DEFAULT_AGENT_PERMISSION_MODE): AgentPermissionMode {
    return value === "request" || value === "automatic" || value === "full" ? value : fallback;
}
