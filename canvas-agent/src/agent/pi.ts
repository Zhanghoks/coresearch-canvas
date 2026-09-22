import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
    type AgentSession,
    type AgentSessionEvent,
    type CreateAgentSessionRuntimeFactory,
    createAgentSession,
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    createAgentSessionServices,
    SessionManager,
    SettingsManager,
    type Skill,
} from "@earendil-works/pi-coding-agent";

import { PI_AGENT_DIR, PI_SESSION_DIR } from "../config.js";
import type { CanvasSnapshot } from "../canvas/types.js";
import { logger } from "../utils/logger.js";
import { errorMessage, field, type JsonRecord } from "../utils/value.js";
import { getModelRuntime } from "./credentials.js";
import { messageMetadataStore } from "./message-metadata.js";
import { emitPiSessionEvent } from "./pi-events.js";
import { settledTurnIdsFromSession, summarizePiSession, threadMessagesFromSession } from "./pi-history.js";
import { assertDraftHasNoSensitiveValues, canvasPrivateValues, mentionsSkill, skillDraftPrompt } from "./skill-draft.js";
import { createCanvasTools, type CanvasToolHandler } from "./pi-tools.js";
import type { CodexModel, CodexReasoningEffort, CodexSkillMetadata, CodexSkillSelector, CodexSkillsListEntry } from "./codex-protocol.js";
import { DEFAULT_AGENT_PERMISSION_MODE, resolveAgentPermissionMode } from "./permission-mode.js";
import type { AgentAttachment, AgentEmit, AgentPermissionMode } from "./types.js";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type SkillState = { enabled: Map<string, boolean>; all: Skill[] };

type PiRunOptions = { threadId?: string; cwd?: string; permissionMode?: AgentPermissionMode; model?: string; effort?: CodexReasoningEffort; skill?: CodexSkillSelector; messageText?: string; appEmit?: AgentEmit; onStart?: () => void; onThread?: (threadId: string) => void; onTurn?: (turnId: string) => void; onFinish?: () => void };
type PiSkillDraftInput = { model?: string; effort?: CodexReasoningEffort } & ({ source: "conversation"; threadId: string } | { source: "canvas"; snapshot: CanvasSnapshot });

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skillDraftSchema = z.object({
    name: z.string().trim().min(1).max(64).regex(skillNamePattern),
    displayName: z.string().trim().max(64),
    description: z.string().trim().min(1).max(1024).refine((value) => !/[<>]/.test(value)),
    instructions: z.string().trim().min(1).max(20000),
    shortDescription: z.string().trim().max(64).refine((value) => !value || value.length >= 25),
    defaultPrompt: z.string().trim().max(1024),
}).strict().superRefine((draft, context) => {
    if (draft.defaultPrompt && !mentionsSkill(draft.defaultPrompt, draft.name)) context.addIssue({ code: "custom", path: ["defaultPrompt"], message: `默认提示词必须包含 $${draft.name}` });
});

export type AgentSkillDraft = z.infer<typeof skillDraftSchema>;

export class CodexSkillLookupError extends Error {
    override name = "CodexSkillLookupError";
    constructor(message: string, readonly statusCode: 400 | 404 | 409) {
        super(message);
    }
}

const BUILTIN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const FILE_TOOLS = new Set(["bash", "edit", "write"]);
const DISABLED_BUNDLED_SKILLS = new Set([
    "paper-writing",
    "paper-plan",
    "paper-write",
    "paper-compile",
    "paper-figure",
    "paper-illustration",
    "paper-improve",
    "paper-claim-audit",
    "citation-audit",
    "paper-proof",
    "paper-rebuttal",
    "paper-slides",
    "paper-talk",
    "paper-poster",
    "figure-spec",
    "mermaid-diagram",
]);

let turnQueue: Promise<unknown> = Promise.resolve();
let loadedThreadId = "";
let canvasToolHandler: CanvasToolHandler = async () => {
    throw new Error("画布工具尚未绑定");
};
const approvals = new Map<string, { resolve: (decision: string) => void }>();
let host: PiHost | null = null;
let hostStart: Promise<PiHost> | null = null;

export { canvasSkillSource, assertDraftHasNoSensitiveValues } from "./skill-draft.js";

export function summarizeCodexThread(thread: unknown) {
    if (thread && typeof thread === "object" && "created" in thread && (thread as { created?: unknown }).created instanceof Date) {
        return summarizePiSession(thread as Parameters<typeof summarizePiSession>[0], String((thread as { cwd?: string }).cwd || ""));
    }
    const value = thread && typeof thread === "object" ? thread as JsonRecord : {};
    return {
        id: String(value.id || ""),
        sessionId: String(value.sessionId || value.id || ""),
        preview: String(value.preview || ""),
        name: value.name ?? null,
        cwd: String(value.cwd || ""),
        status: String(value.status || "idle"),
        source: value.source,
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || 0),
    };
}

/** 由 HTTP 层注入画布工具执行函数。 */
export function bindCanvasTools(handler: CanvasToolHandler) {
    canvasToolHandler = handler;
}

export async function runCodexTurn(prompt: string, lifecycleEmit: AgentEmit, attachments: AgentAttachment[] = [], options: PiRunOptions = {}) {
    if (!prompt.trim()) return;
    turnQueue = turnQueue.catch(() => undefined).then(() => runTurnNow(prompt, lifecycleEmit, attachments, options));
    await turnQueue;
}

export async function generateCodexSkillDraft(emit: AgentEmit, cwd: string, input: PiSkillDraftInput): Promise<AgentSkillDraft> {
    const queued = turnQueue.catch(() => undefined).then(() => generateSkillDraftNow(emit, cwd, input));
    turnQueue = queued;
    return await queued;
}

export async function interruptCodexTurn(threadId?: string) {
    const current = host;
    if (!current) return false;
    if (threadId && current.threadId !== threadId) return false;
    await current.session.abort();
    return true;
}

export function syncAgentPermissionMode(mode: AgentPermissionMode) {
    const next = resolveAgentPermissionMode(mode);
    if (host) host.permissionMode = next;
    return next;
}

export function resolveCodexApproval(requestId: string, decision: string) {
    const pending = approvals.get(requestId);
    if (!pending) return false;
    pending.resolve(decision);
    approvals.delete(requestId);
    return true;
}

export async function startCodexThread(emit: AgentEmit, cwd?: string, permissionMode: AgentPermissionMode = DEFAULT_AGENT_PERMISSION_MODE, _preheat = false) {
    const runtime = await getHost(emit, cwd || "", permissionMode);
    await runtime.newThread();
    loadedThreadId = runtime.threadId;
    return runtime.threadSummary();
}

export async function forkCodexThread(emit: AgentEmit, threadId: string, cwd?: string, permissionMode: AgentPermissionMode = DEFAULT_AGENT_PERMISSION_MODE, lastTurnId?: string, _preheat = false) {
    const runtime = await getHost(emit, cwd || "", permissionMode);
    await runtime.openThread(threadId);
    if (lastTurnId) {
        const result = await runtime.fork(lastTurnId);
        if (result.cancelled) throw new Error("分叉会话已取消");
    }
    loadedThreadId = runtime.threadId;
    return historyPayload(runtime);
}

export async function resumeCodexThread(emit: AgentEmit, threadId: string, cwd?: string, permissionMode: AgentPermissionMode = DEFAULT_AGENT_PERMISSION_MODE, _preheat = false) {
    const runtime = await getHost(emit, cwd || "", permissionMode);
    await runtime.openThread(threadId);
    loadedThreadId = runtime.threadId;
    return historyPayload(runtime);
}

export async function listCodexThreads(emit: AgentEmit, options: { cwd: string; searchTerm?: string; limit?: number }) {
    await getHost(emit, options.cwd, DEFAULT_AGENT_PERMISSION_MODE);
    const sessions = await SessionManager.list(options.cwd, sessionDir());
    const data = sessions
        .filter((item) => !options.searchTerm || `${item.firstMessage} ${item.name || ""}`.includes(options.searchTerm))
        .slice(0, options.limit || 40)
        .map((item) => summarizePiSession(item, options.cwd));
    return { data, nextCursor: null, backwardsCursor: null };
}

const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export async function listCodexModels(_emit: AgentEmit) {
    const runtime = await getModelRuntime();
    const models = await runtime.getAvailable();
    const data = models.map((model, index) => {
        const thinkingLevels = thinkingLevelsOf(model);
        const defaultThinkingLevel = thinkingLevels.includes("medium") ? "medium" : thinkingLevels[0] || "";
        const efforts = thinkingLevels.map((reasoningEffort) => ({ reasoningEffort }));
        return {
            id: `${model.provider}/${model.id}`,
            provider: model.provider,
            model: `${model.provider}/${model.id}`,
            displayName: model.name,
            reasoning: Boolean(model.reasoning),
            thinkingLevels,
            defaultThinkingLevel,
            defaultReasoningEffort: defaultThinkingLevel as CodexReasoningEffort,
            supportedReasoningEfforts: efforts,
            isDefault: index === 0,
        };
    });
    return { runtime: "pi" as const, data };
}

export async function listCodexSkills(emit: AgentEmit, cwd: string, forceReload = false): Promise<CodexSkillsListEntry> {
    const runtime = await getHost(emit, cwd, DEFAULT_AGENT_PERMISSION_MODE);
    if (forceReload) await runtime.reloadSkills();
    return { cwd, skills: runtime.listSkills(), errors: [] };
}

export async function resolveCodexSkill(emit: AgentEmit, cwd: string, selector: CodexSkillSelector, requireEnabled = false): Promise<CodexSkillMetadata> {
    const name = String(selector?.name || "");
    const requestedPath = String(selector?.path || "");
    if (!name || !requestedPath || !path.isAbsolute(requestedPath)) throw new CodexSkillLookupError("Skill 选择无效", 400);
    const { skills } = await listCodexSkills(emit, cwd, true);
    const skill = skills.find((item) => item.name === name && samePath(item.path, requestedPath));
    if (!skill) throw new CodexSkillLookupError("找不到指定 Skill，请刷新列表后重试", 404);
    if (requireEnabled && !skill.enabled) throw new CodexSkillLookupError("该 Skill 已停用，请先启用后再使用", 409);
    return skill;
}

export async function configureCodexSkill(emit: AgentEmit, cwd: string, selector: CodexSkillSelector, enabled: boolean) {
    const skill = await resolveCodexSkill(emit, cwd, selector);
    const runtime = await getHost(emit, cwd, DEFAULT_AGENT_PERMISSION_MODE);
    runtime.setSkillEnabled(skill.path, enabled);
    await runtime.reloadSkills();
    return { effectiveEnabled: enabled, skill: { ...skill, enabled } };
}

export async function readCodexThread(emit: AgentEmit, threadId: string, cwd?: string) {
    const runtime = await getHost(emit, cwd || "", DEFAULT_AGENT_PERMISSION_MODE);
    await runtime.openThread(threadId);
    return historyPayload(runtime);
}

export async function archiveCodexThread(emit: AgentEmit, threadId: string, cwd?: string) {
    const runtime = await getHost(emit, cwd || "", DEFAULT_AGENT_PERMISSION_MODE);
    await runtime.archiveThread(threadId);
    await messageMetadataStore.removeThread(threadId).catch((error) => logger.warn("Failed to remove archived thread message metadata", { threadId, error }));
    if (loadedThreadId === threadId) loadedThreadId = "";
}

export function isRecoverableThreadError(error: unknown) {
    return /session not found|no such file|ENOENT|unable to open/i.test(errorMessage(error));
}

async function runTurnNow(prompt: string, lifecycleEmit: AgentEmit, attachments: AgentAttachment[], options: PiRunOptions) {
    try {
        options.onStart?.();
        const runtime = await getHost(options.appEmit || lifecycleEmit, options.cwd || "", resolveAgentPermissionMode(options.permissionMode));
        if (options.threadId) {
            try {
                await runtime.openThread(options.threadId);
            } catch (error) {
                if (!isRecoverableThreadError(error)) throw error;
                lifecycleEmit("agent_log", { text: `Pi session unavailable, starting a new thread: ${errorMessage(error)}` });
                await runtime.newThread();
            }
        } else if (!runtime.threadId) {
            await runtime.newThread();
        }
        loadedThreadId = runtime.threadId;
        options.onThread?.(runtime.threadId);
        await runtime.setModelAndEffort(options.model, options.effort);
        runtime.permissionMode = resolveAgentPermissionMode(options.permissionMode);
        const text = options.skill ? `${prompt}\n\n$${options.skill.name}` : prompt;
        await runtime.prompt(text, attachments, options.onTurn);
    } catch (error) {
        logger.error("Pi turn failed", error);
        lifecycleEmit("agent_error", { message: errorMessage(error) });
    } finally {
        options.onFinish?.();
    }
}

async function generateSkillDraftNow(emit: AgentEmit, cwd: string, input: PiSkillDraftInput) {
    const runtime = await getModelRuntime();
    const models = await runtime.getAvailable();
    const model = models[0];
    if (!model) throw new Error("请先在 Agent 设置中配置模型 API Key");
    const history = input.source === "conversation" ? await readCodexThread(emit, input.threadId, cwd) : undefined;
    const prompt = skillDraftPrompt(input, history?.messages || []);
    const { session } = await createAgentSession({
        cwd,
        agentDir: PI_AGENT_DIR,
        modelRuntime: runtime,
        model,
        thinkingLevel: toThinkingLevel(input.effort),
        noTools: "all",
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager: SettingsManager.inMemory({ defaultProjectTrust: "always" }),
    });
    try {
        await session.prompt(prompt);
        const raw = lastAssistantText(session);
        let value: unknown;
        try {
            value = JSON.parse(raw.replace(/^```(?:json)?\n?|\n?```$/g, "").trim());
        } catch {
            throw new Error("Pi 返回的 Skill 草稿不是有效 JSON");
        }
        const parsed = skillDraftSchema.safeParse(value);
        if (!parsed.success) throw new Error("Pi 返回的 Skill 草稿格式不正确");
        assertDraftHasNoSensitiveValues(parsed.data, input.source === "canvas" ? canvasPrivateValues(input.snapshot) : []);
        return parsed.data;
    } finally {
        session.dispose();
    }
}

function historyPayload(runtime: PiHost) {
    const sessionManager = runtime.sessionManager;
    const thread = runtime.threadSummary();
    const messages = threadMessagesFromSession(sessionManager, runtime.threadId);
    return { thread, messages, settledTurnIds: settledTurnIdsFromSession(sessionManager), historyReady: true };
}

async function getHost(emit: AgentEmit, cwd: string, permissionMode: AgentPermissionMode) {
    if (host && (!cwd || host.cwd === cwd)) {
        host.emit = emit;
        host.permissionMode = permissionMode;
        return host;
    }
    hostStart ||= PiHost.start(emit, cwd, permissionMode);
    try {
        host = await hostStart;
        return host;
    } finally {
        hostStart = null;
    }
}

class PiHost {
    permissionMode: AgentPermissionMode;
    emit: AgentEmit;
    private unsubscribe?: () => void;
    private currentTurnId = "";
    private onTurn?: (turnId: string) => void;
    private skillState: SkillState;

    private constructor(
        readonly cwd: string,
        readonly runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>,
        emit: AgentEmit,
        permissionMode: AgentPermissionMode,
        skillState: SkillState,
    ) {
        this.emit = emit;
        this.permissionMode = permissionMode;
        this.skillState = skillState;
        this.bindSession();
    }

    static async start(emit: AgentEmit, cwd: string, permissionMode: AgentPermissionMode) {
        const workspace = cwd || process.cwd();
        fs.mkdirSync(sessionDir(), { recursive: true, mode: 0o700 });
        const modelRuntime = await getModelRuntime();
        const canvasTools = createCanvasTools((name, input) => canvasToolHandler(name, input));
        const skillState: SkillState = { enabled: loadSkillEnabled(workspace), all: [] };
        const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd: nextCwd, sessionManager, sessionStartEvent }) => {
            const settingsManager = SettingsManager.create(nextCwd, PI_AGENT_DIR, { projectTrusted: true });
            settingsManager.applyOverrides({ defaultProjectTrust: "always", defaultTools: BUILTIN_TOOLS });
            const services = await createAgentSessionServices({
                cwd: nextCwd,
                agentDir: PI_AGENT_DIR,
                settingsManager,
                modelRuntime,
                resourceLoaderOptions: {
                    noSkills: true,
                    additionalSkillPaths: [path.join(nextCwd, "skills")],
                    additionalExtensionPaths: fs.existsSync(path.join(nextCwd, "extensions")) ? [path.join(nextCwd, "extensions")] : [],
                    extensionFactories: [{
                        name: "canvas-permissions",
                        factory: (pi) => {
                            pi.on("tool_call", async (event) => {
                                if (!FILE_TOOLS.has(event.toolName)) return;
                                const mode = resolveAgentPermissionMode(host?.permissionMode);
                                if (mode === "full") return;
                                const requestId = crypto.randomUUID();
                                const params = record(event.input);
                                const approval = {
                                    requestId,
                                    method: event.toolName === "bash" ? "item/commandExecution/requestApproval" : "item/fileChange/requestApproval",
                                    threadId: host?.threadId,
                                    turnId: host?.activeTurnId,
                                    command: params.command,
                                    cwd: nextCwd,
                                    path: params.path,
                                };
                                if (mode === "automatic") {
                                    emit("codex_approval", approval);
                                    emit("codex_approval_resolved", { requestId, decision: "accept", threadId: host?.threadId, turnId: host?.activeTurnId });
                                    return;
                                }
                                emit("codex_approval", approval);
                                const decision = await waitForApproval(requestId);
                                emit("codex_approval_resolved", { requestId, decision, threadId: host?.threadId, turnId: host?.activeTurnId });
                                if (decision !== "accept" && decision !== "acceptForSession") return { block: true, reason: "用户拒绝了该操作" };
                            });
                        },
                    }],
                    skillsOverride: (current) => {
                        const skills = workspaceSkills(nextCwd, current.skills);
                        skillState.all = skills;
                        return {
                            skills: skills.filter((skill) => skillState.enabled.get(skill.filePath) !== false),
                            diagnostics: current.diagnostics,
                        };
                    },
                },
            });
            const available = await modelRuntime.getAvailable();
            return {
                ...(await createAgentSessionFromServices({
                    services,
                    sessionManager,
                    sessionStartEvent,
                    model: available[0],
                    customTools: canvasTools,
                })),
                services,
                diagnostics: services.diagnostics,
            };
        };
        const runtime = await createAgentSessionRuntime(createRuntime, {
            cwd: workspace,
            agentDir: PI_AGENT_DIR,
            sessionManager: SessionManager.create(workspace, sessionDir()),
        });
        const loaded = runtime.services.resourceLoader.getExtensions();
        logger.info("Pi extensions loaded", {
            extensions: loaded.extensions.map((item) => ({ path: item.path, tools: [...item.tools.keys()] })),
            errors: loaded.errors,
        });
        return new PiHost(workspace, runtime, emit, permissionMode, skillState);
    }

    get session(): AgentSession {
        return this.runtime.session;
    }

    get sessionManager(): SessionManager {
        return this.session.sessionManager;
    }

    get threadId() {
        return this.session.sessionId;
    }

    get activeTurnId() {
        return this.currentTurnId;
    }

    threadSummary() {
        return {
            id: this.threadId,
            sessionId: this.threadId,
            preview: "",
            name: null,
            cwd: this.cwd,
            status: "idle",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    listSkills(): CodexSkillMetadata[] {
        const skills = this.skillState.all.length ? this.skillState.all : workspaceSkills(this.cwd, this.runtime.services.resourceLoader.getSkills().skills);
        return skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            path: skill.filePath,
            scope: "repo",
            enabled: this.isSkillEnabled(skill),
        }));
    }

    isSkillEnabled(skill: Skill) {
        return this.skillState.enabled.get(skill.filePath) !== false;
    }

    setSkillEnabled(skillPath: string, enabled: boolean) {
        this.skillState.enabled.set(skillPath, enabled);
        saveSkillEnabled(this.cwd, this.skillState.enabled);
    }

    async reloadSkills() {
        await this.runtime.services.resourceLoader.reload();
    }

    async newThread() {
        await this.runtime.newSession();
        this.bindSession();
        loadedThreadId = this.threadId;
    }

    async openThread(threadId: string) {
        if (threadId === this.threadId) return;
        const sessions = await SessionManager.list(this.cwd, sessionDir());
        const match = sessions.find((item) => item.id === threadId);
        if (!match) throw new Error("session not found");
        const result = await this.runtime.switchSession(match.path);
        if (result.cancelled) throw new Error("恢复会话已取消");
        this.bindSession();
        loadedThreadId = this.threadId;
    }

    async fork(entryId: string) {
        const result = await this.runtime.fork(entryId, { position: "at" });
        this.bindSession();
        loadedThreadId = this.threadId;
        return result;
    }

    async archiveThread(threadId: string) {
        const sessions = await SessionManager.list(this.cwd, sessionDir());
        const match = sessions.find((item) => item.id === threadId);
        if (match) await fsPromises.unlink(match.path).catch(() => undefined);
        if (threadId === this.threadId) await this.newThread();
    }

    async setModelAndEffort(modelId?: string, effort?: CodexReasoningEffort) {
        this.session.setThinkingLevel(toThinkingLevel(effort));
        if (!modelId) return;
        const runtime = await getModelRuntime();
        const [provider, ...rest] = modelId.split("/");
        const id = rest.join("/");
        const model = runtime.getModel(provider, id) || (await runtime.getAvailable()).find((item) => `${item.provider}/${item.id}` === modelId);
        if (model) await this.session.setModel(model);
    }

    async prompt(text: string, attachments: AgentAttachment[], onTurn?: (turnId: string) => void) {
        this.currentTurnId = "";
        this.onTurn = onTurn;
        const images = attachments.flatMap((item) => {
            const match = item.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
            return match ? [{ type: "image" as const, mimeType: match[1], data: match[2] }] : [];
        });
        await this.session.prompt(text, { images, source: "rpc" });
        await this.session.waitForIdle();
        if (!this.currentTurnId) {
            this.currentTurnId = latestUserEntryId(this.sessionManager) || this.sessionManager.getLeafId() || crypto.randomUUID();
            onTurn?.(this.currentTurnId);
        }
        this.onTurn = undefined;
    }

    private bindSession() {
        this.unsubscribe?.();
        this.unsubscribe = this.session.subscribe((event: AgentSessionEvent) => {
            if (event.type === "entry_appended" && event.entry.type === "message" && event.entry.message.role === "user" && !this.currentTurnId) {
                this.currentTurnId = event.entry.id;
                this.onTurn?.(this.currentTurnId);
                this.emit("agent_event", { type: "turn.started", threadId: this.threadId, turnId: this.currentTurnId, turn: { id: this.currentTurnId } });
            }
            emitPiSessionEvent(this.emit, event, { threadId: this.threadId, turnId: this.currentTurnId });
        });
    }
}

function latestUserEntryId(manager: SessionManager) {
    const branch = manager.getBranch();
    for (let index = branch.length - 1; index >= 0; index -= 1) {
        const entry = branch[index];
        if (entry.type === "message" && entry.message.role === "user") return entry.id;
    }
    return "";
}

function sessionDir() {
    return PI_SESSION_DIR;
}

function skillEnabledFile(cwd: string) {
    return path.join(cwd, ".pi", "skills-enabled.json");
}

function loadSkillEnabled(cwd: string) {
    try {
        const raw = JSON.parse(fs.readFileSync(skillEnabledFile(cwd), "utf8")) as Record<string, boolean>;
        return new Map(Object.entries(raw));
    } catch {
        return new Map<string, boolean>();
    }
}

function saveSkillEnabled(cwd: string, enabled: Map<string, boolean>) {
    const file = skillEnabledFile(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(enabled), null, 2));
}

function thinkingLevelsOf(model: { reasoning?: boolean; thinkingLevelMap?: Record<string, string | null> }) {
    if (!model.reasoning) return [] as Array<typeof PI_THINKING_LEVELS[number]>;
    const map = model.thinkingLevelMap;
    if (!map) return [...PI_THINKING_LEVELS];
    return PI_THINKING_LEVELS.filter((level) => !(level in map) || map[level] !== null);
}

function toThinkingLevel(effort?: string): ThinkingLevel {
    if (effort === "off" || effort === "minimal" || effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh" || effort === "max") return effort;
    if (effort === "ultra") return "max";
    return "medium";
}

function waitForApproval(requestId: string) {
    return new Promise<string>((resolve) => {
        approvals.set(requestId, { resolve });
    });
}

function lastAssistantText(session: AgentSession) {
    const messages = session.messages as Array<{ role?: string; content?: unknown }>;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role !== "assistant") continue;
        const content = message.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) return content.map((part) => String(field(part, "text") || "")).join("");
    }
    return "";
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function samePath(left: string, right: string) {
    const normalize = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
    return normalize(left) === normalize(right);
}

function workspaceSkillsDir(cwd: string) {
    return path.resolve(cwd, "skills");
}

function isUnderDir(filePath: string, dir: string) {
    const root = process.platform === "win32" ? path.resolve(dir).toLowerCase() : path.resolve(dir);
    const value = process.platform === "win32" ? path.resolve(filePath).toLowerCase() : path.resolve(filePath);
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    return value === root || value.startsWith(prefix);
}

function workspaceSkills(cwd: string, skills: Skill[]) {
    return skills.filter((skill) => isUnderDir(skill.filePath, workspaceSkillsDir(cwd)) && !DISABLED_BUNDLED_SKILLS.has(skill.name));
}
