import type { SessionEntry, SessionInfo, SessionManager } from "@earendil-works/pi-coding-agent";

type AgentMessage = { role?: string; content?: unknown; toolName?: string; isError?: boolean };

import type { JsonRecord } from "../utils/value.js";

type HistoryMessage = { id: string; itemId: string; threadId: string; turnId: string; role: "user" | "assistant" | "tool" | "error"; title?: string; text: string; detail?: unknown; canvasReferences?: Array<{ nodeId: string; label: string; title: string; kind: "image" | "video" | "audio" | "text" }> };

const CANVAS_REFERENCE_MARKER = "本轮引用的当前画布素材：";
const CANVAS_REFERENCE_LINE = /mention="([^"]*)", nodeId="([^"]*)", title="([^"]*)", type=(image|video|audio|text)/g;

function displayUserText(text: string) {
    const index = text.indexOf(CANVAS_REFERENCE_MARKER);
    if (index < 0) return text;
    return text.slice(0, index).trim().replace(/^请处理引用的画布素材。$/, "");
}

function canvasReferencesFromPrompt(text: string) {
    const index = text.indexOf(CANVAS_REFERENCE_MARKER);
    if (index < 0) return undefined;
    const references = [...text.slice(index).matchAll(CANVAS_REFERENCE_LINE)].map((match) => ({
        nodeId: match[2],
        label: match[1].replace(/^@/, ""),
        title: match[3],
        kind: match[4] as "image" | "video" | "audio" | "text",
    }));
    return references.length ? references : undefined;
}

const CANVAS_TOOL = /^(?:site_|canvas_|research_|generation_|assets_)/;

/** 把 Pi 会话列表项转成前端线程摘要。 */
export function summarizePiSession(info: SessionInfo, cwd: string) {
    return {
        id: info.id,
        sessionId: info.id,
        preview: info.firstMessage || info.name || "",
        name: info.name || null,
        cwd: info.cwd || cwd,
        status: "idle",
        source: "pi",
        createdAt: info.created.getTime(),
        updatedAt: info.modified.getTime(),
        path: info.path,
    };
}

/** 当前叶子路径上已经完成的用户消息 id，作为产品 turnId。 */
export function settledTurnIdsFromSession(manager: SessionManager) {
    return userTurns(manager).map((item) => item.turnId);
}

/** 把 Pi session 树转成网页聊天历史。 */
export function threadMessagesFromSession(manager: SessionManager, threadId: string): HistoryMessage[] {
    const messages: HistoryMessage[] = [];
    for (const turn of userTurns(manager)) {
        const push = (itemId: string, role: HistoryMessage["role"], text: string, extra: Partial<HistoryMessage> = {}) => {
            messages.push({ id: `${threadId}:${turn.turnId}:${itemId}`, itemId, threadId, turnId: turn.turnId, role, text, ...extra });
        };
        if (turn.userText) push("synthetic:user", "user", displayUserText(turn.userText), { canvasReferences: canvasReferencesFromPrompt(turn.userText) });
        for (const entry of turn.entries) {
            if (entry.type !== "message") continue;
            const message = entry.message;
            if (message.role === "assistant") {
                const thinking = thinkingText(message);
                if (thinking) push(`${entry.id}:reasoning`, "tool", thinking, { title: "思考摘要", detail: { kind: "reasoning", status: "completed" } });
                const text = messageText(message);
                if (text) push(entry.id, "assistant", text, { title: "Pi" });
                continue;
            }
            if (message.role === "toolResult") {
                const toolName = String(message.toolName || "工具");
                const error = message.isError;
                push(entry.id, "tool", error ? messageText(message) || "工具失败" : toolHistoryText(toolName, message), {
                    title: toolTitle(toolName),
                    detail: toolDetail(toolName, message),
                });
            }
        }
    }
    return messages;
}

function userTurns(manager: SessionManager) {
    const path = manager.getBranch();
    const turns: Array<{ turnId: string; userText: string; entries: SessionEntry[] }> = [];
    let current: { turnId: string; userText: string; entries: SessionEntry[] } | undefined;
    for (const entry of path) {
        if (entry.type === "message" && entry.message.role === "user") {
            current = { turnId: entry.id, userText: messageText(entry.message), entries: [] };
            turns.push(current);
            continue;
        }
        current?.entries.push(entry);
    }
    return turns;
}

function messageText(message: AgentMessage) {
    const content = "content" in message ? message.content : "";
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content.map((part) => {
        const item = part as JsonRecord;
        if (item.type === "text") return String(item.text || "");
        return "";
    }).join("").trim();
}

function thinkingText(message: AgentMessage) {
    const content = "content" in message ? message.content : [];
    if (!Array.isArray(content)) return "";
    return content.map((part) => {
        const item = part as JsonRecord;
        return item.type === "thinking" ? String(item.thinking || item.text || "") : "";
    }).join("").trim();
}

function toolHistoryText(toolName: string, message: AgentMessage) {
    const text = messageText(message);
    if (toolName === "bash") return text || "命令已完成";
    if (message.isError) return text.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 160) || "执行失败";
    if (CANVAS_TOOL.test(toolName)) return canvasSummary(text);
    if (toolName === "web_search") return searchSummary(text);
    if (toolName === "fetch_content") return /^## Fetched URLs[\s\S]*\bError\b/.test(text) ? "抓取失败" : "已抓取网页";
    if (toolName === "read") return "已读取文件";
    if (toolName === "research_workflow_advance") return "已准备本阶段说明";
    return text || "已完成";
}

function toolTitle(toolName: string) {
    if (toolName === "bash") return "执行命令";
    if (toolName === "edit" || toolName === "write") return "修改文件";
    if (toolName === "web_search") return "搜索网页";
    if (toolName === "fetch_content") return "抓取网页";
    if (toolName === "read") return "读取文件";
    if (toolName === "canvas_get_state") return "读取画布";
    if (toolName === "canvas_get_selection") return "读取选区";
    if (toolName === "research_workflow_advance") return "研究流程";
    return toolName;
}

function toolDetail(toolName: string, message: AgentMessage) {
    const failed = "isError" in message && message.isError;
    const text = messageText(message);
    const status = failed ? "failed" : "completed";
    if (toolName === "bash") return { kind: "command", status, output: text };
    if (toolName === "edit" || toolName === "write") return { kind: "file", status };
    if (CANVAS_TOOL.test(toolName) || toolName === "research_workflow_advance") return { kind: "tool", status, ...(failed ? { output: text } : {}) };
    return { kind: "tool", status, output: text };
}

function canvasSummary(text: string) {
    try {
        const data = JSON.parse(text) as { nodes?: unknown };
        const count = Array.isArray(data.nodes) ? data.nodes.length : 0;
        return count ? `已读取画布，${count} 个节点` : "已读取画布";
    } catch {
        return "已读取画布";
    }
}

function searchSummary(text: string) {
    const queries = [...text.matchAll(/^## Query: "([^"]+)"/gm)].map((match) => match[1]);
    if (queries.length === 1) return queries[0];
    if (queries.length > 1) return `${queries.length} 个查询`;
    const first = text.split("\n").map((line) => line.trim()).find(Boolean) || "";
    return first.length > 80 ? `${first.slice(0, 80)}…` : first || "搜索完成";
}
