import { Type } from "typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";

import { toolDescriptions, toolNames, type ToolName } from "../canvas/schemas.js";
import { parseToolInput } from "../canvas/tools.js";

export type CanvasToolHandler = (name: ToolName, input: unknown) => Promise<unknown>;

const openParameters = Type.Object({}, { additionalProperties: true });

/** 把画布 MCP 工具注册成 Pi customTools，执行时仍走 CanvasSession.callTool。 */
export function createCanvasTools(handler: CanvasToolHandler): ToolDefinition[] {
    return toolNames.map((name) => defineTool({
        name,
        label: name,
        description: toolDescriptions[name],
        parameters: openParameters,
        executionMode: writeTool(name) ? "sequential" : "parallel",
        execute: async (_toolCallId, params) => {
            const result = await handler(name, parseToolInput(name, params));
            return { content: [{ type: "text", text: JSON.stringify(result ?? null, null, 2) }], details: {} };
        },
    }));
}

function writeTool(name: ToolName) {
    return !["canvas_get_state", "canvas_get_selection", "canvas_export_snapshot", "research_artifact_list", "research_artifact_read", "canvas_list_projects", "generation_get_status", "assets_list"].includes(name);
}
