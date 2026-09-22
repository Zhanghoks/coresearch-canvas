import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

import type { JsonRecord } from "../utils/value.js";
import type { AgentEmit } from "./types.js";

const CANVAS_TOOL = /^(?:site_|canvas_|research_|generation_|assets_)/;

/** 将一次 Pi 会话事件转成前端已有的 agent_event item 形状。 */
export function emitPiSessionEvent(emit: AgentEmit, event: AgentSessionEvent, scope: { threadId: string; turnId: string }) {
    const { threadId, turnId } = scope;
    if (!threadId) return;
    if (event.type === "message_start" && event.message.role === "assistant") {
        emitAgent(emit, "item.started", threadId, turnId, { id: assistantItemId(event.message), type: "agent_message", text: assistantText(event.message) });
        return;
    }
    if (event.type === "message_update" && event.message.role === "assistant") {
        const deltaEvent = event.assistantMessageEvent;
        if (deltaEvent.type === "text_delta") {
            emitAgent(emit, "item.updated", threadId, turnId, { id: assistantItemId(event.message), type: "agent_message", delta: deltaEvent.delta, text: assistantText(event.message) });
        }
        if (deltaEvent.type === "thinking_delta") {
            emitAgent(emit, "item.updated", threadId, turnId, { id: `${assistantItemId(event.message)}:reasoning`, type: "reasoning", delta: deltaEvent.delta, summary: deltaEvent.delta });
        }
        return;
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
        emitAgent(emit, "item.completed", threadId, turnId, { id: assistantItemId(event.message), type: "agent_message", text: assistantText(event.message), status: "completed" });
        return;
    }
    if (event.type === "tool_execution_start") {
        emitAgent(emit, "item.started", threadId, turnId, toolItem(event.toolCallId, event.toolName, event.args, "inProgress"));
        return;
    }
    if (event.type === "tool_execution_update") {
        const delta = toolDelta(event.partialResult);
        if (delta) emitAgent(emit, "item.updated", threadId, turnId, { ...toolItem(event.toolCallId, event.toolName, event.args, "inProgress"), delta });
        return;
    }
    if (event.type === "tool_execution_end") {
        const error = event.isError ? toolError(event.result) : "";
        emitAgent(emit, "item.completed", threadId, turnId, {
            ...toolItem(event.toolCallId, event.toolName, {}, event.isError ? "failed" : "completed", event.result),
            ...(error ? { error: { message: error } } : {}),
            success: !event.isError,
        });
        return;
    }
    if (event.type === "agent_end") {
        emit("agent_event", { type: "turn.completed", threadId, turnId, turn: { id: turnId, status: "completed" } });
    }
}

function emitAgent(emit: AgentEmit, type: string, threadId: string, turnId: string, item: JsonRecord) {
    emit("agent_event", { type, threadId, turnId, item });
}

function toolItem(id: string, toolName: string, args: unknown, status: string, result?: unknown): JsonRecord {
    if (toolName === "bash") return { id, type: "command_execution", command: String(record(args).command || ""), status, aggregatedOutput: resultText(result) };
    if (toolName === "edit" || toolName === "write") return { id, type: "file_change", path: String(record(args).path || ""), status, changes: [{ path: String(record(args).path || ""), kind: toolName === "write" ? "add" : "update" }] };
    if (CANVAS_TOOL.test(toolName)) return { id, type: "mcp_tool_call", server: "infinite-canvas", tool: toolName, arguments: args, status, result };
    return { id, type: "mcp_tool_call", tool: toolName, arguments: args, status, result };
}

function assistantText(message: { content?: unknown }) {
    if (!Array.isArray(message.content)) return "";
    return message.content.map((part) => (record(part).type === "text" ? String(record(part).text || "") : "")).join("");
}

function assistantItemId(message: { timestamp?: number }) {
    return `assistant:${message.timestamp || "current"}`;
}

function toolDelta(value: unknown) {
    if (typeof value === "string") return value;
    const text = resultText(value);
    return text || "";
}

function resultText(value: unknown) {
    if (typeof value === "string") return value;
    const content = record(value).content;
    if (Array.isArray(content)) return content.map((part) => String(record(part).text || "")).join("");
    return String(record(value).text || "");
}

function toolError(value: unknown) {
    return String(record(value).error || resultText(value) || "工具执行失败");
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
