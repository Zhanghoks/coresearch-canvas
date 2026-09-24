import i18n from "@/i18n";
import type { CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import type { AgentModel, AgentPermissionMode, AgentReasoningEffort } from "@/stores/use-agent-store";

type AgentConfigResponse = { ok?: boolean; protocolVersion?: number; runtime?: string; url?: string; token?: string; hasToken?: boolean };
const AGENT_MESSAGE_ASSET_PATTERN = /^agent-asset:([a-f0-9]{64})\/([a-f0-9]{64}\.(?:gif|jpe?g|png|webp))$/;

export class AgentApiError<T = unknown> extends Error {
    constructor(readonly status: number, readonly response: T & { code?: string; error?: string; msg?: string }) {
        super(response.error || response.msg || i18n.t("agent.state.requestFailed"));
        this.name = "AgentApiError";
    }
}

export type AgentSkillScope = "user" | "repo" | "system" | "admin";
export type AgentSkillInterface = { displayName?: string | null; shortDescription?: string | null; defaultPrompt?: string | null };
export type AgentSkillSummary = {
    name: string;
    description: string;
    shortDescription?: string | null;
    interface?: AgentSkillInterface | null;
    dependencies?: unknown;
    path: string;
    scope: AgentSkillScope;
    enabled: boolean;
    managed: boolean;
};
export type AgentSkillDetail = {
    name: string;
    description: string;
    instructions: string;
    interface?: AgentSkillInterface | null;
    path: string;
    managed: true;
    revision: string;
};
export type AgentSkillInput = { name?: string; description: string; instructions: string; interface?: AgentSkillInterface | null; expectedRevision?: string };
export type AgentSkillDraft = { name: string; displayName: string; description: string; instructions: string; shortDescription: string; defaultPrompt: string };
export type AgentSkillDraftInput = { source: "conversation" | "canvas"; threadId: string; clientId: string; model?: string; thinkingLevel?: AgentReasoningEffort; effort?: AgentReasoningEffort };
export type AgentSkillsResponse = { ok?: boolean; data?: AgentSkillSummary[]; errors?: unknown[] };
export type AgentSkillResponse = { ok?: boolean; data?: AgentSkillDetail };
export type AgentSkillDraftResponse = { ok?: boolean; data?: AgentSkillDraft };
export type ResearchArtifactSummary = {
    schemaVersion: 1;
    id: string;
    projectId: string;
    kind: "seed-brief" | "direction-map" | "rq-comparison" | "problem-evidence" | "hypothesis-test-plan" | "approach-tradeoff" | "method-protocol" | "evaluation-matrix" | "idea-review" | "paper-plan" | "paper-draft" | "paper-audit" | "export";
    title: string;
    mediaType: "text/markdown";
    sourceNodeIds: string[];
    contentHash: string;
    createdAt: string;
    actor: "agent";
    conversationId: string;
    turnId: string;
};
export type ResearchArtifactDetail = ResearchArtifactSummary & { content: string };

export async function postState(endpoint: string, token: string, clientId: string, snapshot: CanvasAgentSnapshot | null) {
    try {
        const response = await fetch(`${endpoint}/canvas/state?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(snapshot ? { ...snapshot, hasCanvas: true } : { hasCanvas: false }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function activateAgentClient(endpoint: string, token: string, clientId: string) {
    try {
        await fetch(`${endpoint}/canvas/activate?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, { method: "POST" });
    } catch {}
}

export async function postToolResult(endpoint: string, token: string, clientId: string, body: { requestId: string; result?: unknown; error?: string }) {
    await fetchAgentJson(endpoint, token, `/canvas/result?clientId=${encodeURIComponent(clientId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function syncAgentPermissionMode(endpoint: string, token: string, permissionMode: AgentPermissionMode) {
    return fetchAgentJson<{ ok: true; permissionMode: AgentPermissionMode }>(endpoint, token, "/agent/codex/permission-mode", jsonPost({ permissionMode }));
}

export async function postCodexApproval(endpoint: string, token: string, requestId: string, decision: "accept" | "acceptForSession" | "decline") {
    await fetchAgentJson(endpoint, token, "/agent/codex/approval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, decision }) });
}

export async function interruptCodexTurn(endpoint: string, token: string, threadId?: string) {
    await fetchAgentJson(endpoint, token, "/agent/codex/interrupt", jsonPost({ threadId }));
}

export async function acknowledgeCodexHistory(endpoint: string, token: string, threadId: string, turnIds: string[]) {
    await fetchAgentJson(endpoint, token, "/agent/codex/history/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId, turnIds }) });
}

export async function revealAgentLocalFile(endpoint: string, token: string, path: string) {
    await fetchAgentJson(endpoint, token, "/agent/local-file/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
}

export function resolveAgentMessageAssetUrl(endpoint: string, token: string, value: string) {
    const match = AGENT_MESSAGE_ASSET_PATTERN.exec(value);
    if (!match) return value.startsWith("agent-asset:") ? "" : value;
    const baseUrl = endpoint.trim().replace(/\/$/, "");
    return baseUrl && token ? `${baseUrl}/agent/message-assets/${match[1]}/${match[2]}?token=${encodeURIComponent(token)}` : "";
}

export function fetchCodexSkills(endpoint: string, token: string, forceReload = false) {
    return fetchAgentJson<AgentSkillsResponse>(endpoint, token, `/agent/codex/skills${forceReload ? "?forceReload=1" : ""}`);
}

export function fetchCodexSkill(endpoint: string, token: string, name: string) {
    return fetchAgentJson<AgentSkillResponse>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(name)}`);
}

export function createCodexSkill(endpoint: string, token: string, input: AgentSkillInput) {
    return fetchAgentJson<AgentSkillResponse>(endpoint, token, "/agent/codex/skills", jsonPost(input));
}

export function createCodexSkillDraft(endpoint: string, token: string, input: AgentSkillDraftInput) {
    return fetchAgentJson<AgentSkillDraftResponse>(endpoint, token, "/agent/codex/skills/draft", jsonPost(input));
}

export function updateCodexSkill(endpoint: string, token: string, name: string, input: AgentSkillInput) {
    return fetchAgentJson<AgentSkillResponse>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(name)}`, jsonPost(input));
}

export function deleteCodexSkill(endpoint: string, token: string, name: string, expectedRevision: string) {
    return fetchAgentJson<{ ok?: boolean }>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(name)}/delete`, jsonPost({ expectedRevision }));
}

export function setCodexSkillEnabled(endpoint: string, token: string, skill: Pick<AgentSkillSummary, "name" | "path">, enabled: boolean) {
    return fetchAgentJson<{ ok?: boolean }>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(skill.name)}/enabled`, jsonPost({ ...skill, enabled }));
}

export function fetchResearchArtifacts(endpoint: string, token: string, clientId: string) {
    return fetchAgentJson<{ ok: true; data: ResearchArtifactSummary[] }>(endpoint, token, `/data/artifacts?clientId=${encodeURIComponent(clientId)}`);
}

export function fetchResearchArtifact(endpoint: string, token: string, clientId: string, artifactId: string) {
    return fetchAgentJson<{ ok: true; data: ResearchArtifactDetail }>(endpoint, token, `/data/artifacts/${encodeURIComponent(artifactId)}?clientId=${encodeURIComponent(clientId)}`);
}

export type WorkspaceProjectRecord = {
    schemaVersion: 2;
    id: string;
    ownerUserId: string;
    title: string;
    canvasWorkspaceId: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    nodeCount?: number;
    connectionCount?: number;
    backgroundMode?: string;
    showImageInfo?: boolean;
    viewport?: { x: number; y: number; k: number };
    nodes?: unknown[];
    connections?: unknown[];
};

function userHeaders(userId: string): HeadersInit {
    return { "x-canvas-user-id": userId };
}

export function listWorkspaceProjects(endpoint: string, token: string, userId: string) {
    return fetchAgentJson<{ ok: true; data: WorkspaceProjectRecord[] }>(endpoint, token, "/projects", { headers: userHeaders(userId) });
}

export function readWorkspaceProject(endpoint: string, token: string, userId: string, projectId: string) {
    return fetchAgentJson<{ ok: true; data: WorkspaceProjectRecord }>(endpoint, token, `/projects/${encodeURIComponent(projectId)}`, { headers: userHeaders(userId) });
}

export function writeWorkspaceProject(endpoint: string, token: string, userId: string, project: WorkspaceProjectRecord) {
    return fetchAgentJson<{ ok: true; data: WorkspaceProjectRecord }>(endpoint, token, `/projects/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...userHeaders(userId) },
        body: JSON.stringify(project),
    });
}

export function deleteWorkspaceProject(endpoint: string, token: string, userId: string, projectId: string) {
    return fetchAgentJson<{ ok: true }>(endpoint, token, `/projects/${encodeURIComponent(projectId)}`, { method: "DELETE", headers: userHeaders(userId) });
}

export function readWorkspaceProjectLocation(endpoint: string, token: string, userId: string, projectId: string) {
    return fetchAgentJson<{ ok: true; path: string }>(endpoint, token, `/projects/${encodeURIComponent(projectId)}/location`, { headers: userHeaders(userId) });
}

export function revealWorkspaceProject(endpoint: string, token: string, userId: string, projectId: string) {
    return fetchAgentJson<{ ok: true; path: string }>(endpoint, token, `/projects/${encodeURIComponent(projectId)}/reveal`, { method: "POST", headers: userHeaders(userId) });
}

export type AgentProviderStatus = { id: string; name: string; configured: boolean; auth?: string };
export type AgentSearchApiKind = "none" | "secret" | "email";
export type AgentSearchApiStatus = {
    id: string;
    name: string;
    description: string;
    skill: string;
    kind: AgentSearchApiKind;
    required: boolean;
    configured: boolean;
    valueHint?: string;
};

export function fetchAgentCredentials(endpoint: string, token: string) {
    return fetchAgentJson<{ ok?: boolean; runtime?: string; data?: AgentProviderStatus[] }>(endpoint, token, "/agent/credentials");
}

export function fetchAgentSearchCredentials(endpoint: string, token: string) {
    return fetchAgentJson<{ ok?: boolean; runtime?: string; data?: AgentSearchApiStatus[] }>(endpoint, token, "/agent/search-credentials");
}

export function fetchAgentModels(endpoint: string, token: string) {
    return fetchAgentJson<{ ok?: boolean; runtime?: string; data?: AgentModel[] }>(endpoint, token, "/agent/models");
}

export function saveAgentSearchCredential(endpoint: string, token: string, apiId: string, value: string) {
    return fetchAgentJson<{ ok?: boolean; data?: AgentSearchApiStatus[] }>(endpoint, token, "/agent/search-credentials", jsonPost({ apiId, value }, "PUT"));
}

export function deleteAgentSearchCredential(endpoint: string, token: string, apiId: string) {
    return fetchAgentJson<{ ok?: boolean; data?: AgentSearchApiStatus[] }>(endpoint, token, `/agent/search-credentials/${encodeURIComponent(apiId)}`, { method: "DELETE" });
}

export function saveAgentCredential(endpoint: string, token: string, providerId: string, apiKey: string) {
    return fetchAgentJson<{ ok?: boolean; data?: AgentProviderStatus[] }>(endpoint, token, "/agent/credentials", jsonPost({ providerId, apiKey }, "PUT"));
}

export function deleteAgentCredential(endpoint: string, token: string, providerId: string) {
    return fetchAgentJson<{ ok?: boolean; data?: AgentProviderStatus[] }>(endpoint, token, `/agent/credentials/${encodeURIComponent(providerId)}`, { method: "DELETE" });
}

/** 本机 Agent 会话按项目隔离：侧栏当前服务的项目，随 /agent/codex/* 请求一起发送。 */
let agentProjectScope: { userId: string; projectId: string } | null = null;

export function setAgentProjectScope(scope: { userId: string; projectId: string } | null) {
    agentProjectScope = scope?.projectId ? scope : null;
}

export function currentAgentProjectId() {
    return agentProjectScope?.projectId || "";
}

/** EventSource 不能带请求头，用查询参数传项目作用域。 */
export function agentProjectScopeQuery() {
    if (!agentProjectScope) return "";
    return `&projectId=${encodeURIComponent(agentProjectScope.projectId)}&userId=${encodeURIComponent(agentProjectScope.userId)}`;
}

function scopedInit(path: string, init?: RequestInit): RequestInit | undefined {
    if (!agentProjectScope || !path.startsWith("/agent/codex")) return init;
    const headers = new Headers(init?.headers);
    headers.set("x-canvas-project-id", agentProjectScope.projectId);
    headers.set("x-canvas-user-id", agentProjectScope.userId);
    return { ...init, headers };
}

export async function fetchAgentJson<T>(endpoint: string, token: string, path: string, init?: RequestInit) {
    const url = `${endpoint}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    const res = await fetch(url, scopedInit(path, init));
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; msg?: string };
    if (!res.ok) throw new AgentApiError(res.status, data);
    return data;
}

export async function discoverAgentConfig(endpoint: string) {
    try {
        const res = await fetch(`${endpoint.replace(/\/$/, "")}/config`);
        if (!res.ok) return null;
        const data = (await res.json()) as AgentConfigResponse;
        if (!data.ok || !data.token) return null;
        return { ...data, url: endpoint.replace(/\/$/, "") || data.url };
    } catch {
        return null;
    }
}

/** 按候选地址探测本机 Canvas Agent，优先返回能读到 token 的第一个。 */
export async function discoverLocalAgent(preferred = "") {
    const candidates = [...new Set([preferred.trim().replace(/\/$/, ""), "/__agent", "http://127.0.0.1:17371"].filter(Boolean))];
    for (const endpoint of candidates) {
        const data = await discoverAgentConfig(endpoint);
        if (data?.token) return data;
    }
    return null;
}

function jsonPost(body: unknown, method: "POST" | "PUT" = "POST"): RequestInit {
    return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
