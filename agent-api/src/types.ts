export type JsonObject = Record<string, unknown>;
export const AGENT_PROTOCOL_VERSION = 1;
export const PI_SESSION_STORAGE_VERSION = 1;

export type Project = {
    id: string;
    ownerUserId: string;
    name: string;
    canvasWorkspaceId: string;
    createdAt: string;
    updatedAt: string;
};

export type CanvasWorkspace = {
    id: string;
    projectId: string;
    revision: number;
    snapshot: JsonObject | null;
    createdAt: string;
    updatedAt: string;
};

export type RequestContext = {
    userId: string;
    projectId: string;
    canvasWorkspaceId: string;
};

export type AgentSessionKey = {
    userId: string;
    projectId: string;
    conversationId: string;
};

export type Conversation = {
    id: string;
    projectId: string;
    ownerUserId: string;
    title: string;
    status: "active" | "archived";
    sessionRevision: number;
    codexThreadId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ConversationSession = {
    storageVersion: number;
    revision: number;
    header: JsonObject | null;
    entries: JsonObject[];
};

export type AgentRunStatus = "running" | "completed" | "failed" | "aborted";

export type AgentRun = {
    id: string;
    conversationId: string;
    actorUserId: string;
    status: AgentRunStatus;
    codexTurnId: string | null;
    startedAt: string;
    completedAt: string | null;
};

export type RuntimeEventType =
    | "run.started"
    | "assistant.delta"
    | "assistant.completed"
    | "tool.started"
    | "tool.updated"
    | "tool.completed"
    | "canvas.tool.requested"
    | "run.completed"
    | "run.failed"
    | "run.aborted";

export type RuntimeEvent = {
    protocolVersion: number;
    sequence: number;
    type: RuntimeEventType;
    projectId: string;
    canvasWorkspaceId: string;
    conversationId: string;
    threadId: string;
    runId: string;
    turnId: string;
    itemId: string;
    payload: JsonObject;
    createdAt: string;
};

export type NewRuntimeEvent = Omit<RuntimeEvent, "sequence" | "createdAt">;

export type RunTurnInput = {
    conversationId: string;
    prompt: string;
};

export const RESEARCH_ENTITY_TYPES = [
    "seed", "direction", "research_question", "problem", "hypothesis",
    "approach", "method", "evaluation", "idea",
] as const;

export type ResearchEntityType = (typeof RESEARCH_ENTITY_TYPES)[number];
export type ResearchRevisionStatus = "draft" | "confirmed" | "superseded" | "archived";

export type ResearchEntity = {
    id: string;
    projectId: string;
    type: ResearchEntityType;
    headRevisionId: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
};

export type ResearchEntityRevision = {
    id: string;
    entityId: string;
    projectId: string;
    revision: number;
    title: string;
    summary: string;
    document: string;
    attributes: JsonObject;
    status: ResearchRevisionStatus;
    createdBy: string;
    createdAt: string;
};

/** Entity 加上当前生效的 revision，给列表和投影读取用。 */
export type ResearchEntityDetail = ResearchEntity & { head: ResearchEntityRevision | null };

export type ResearchRevisionInput = {
    title: string;
    summary: string;
    document: string;
    attributes: JsonObject;
    status: ResearchRevisionStatus;
};

export type ResearchRelation = {
    id: string;
    projectId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationType: string;
    createdAt: string;
};

/** 画布节点的客户端 id 不是 uuid，只在画布内唯一，所以投影按客户端 id 对齐。 */
export type CanvasNodeProjection = {
    clientNodeId: string;
    type: string;
    entityId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    groupClientId: string | null;
    displayState: JsonObject;
};

export type CanvasEdgeProjection = {
    clientEdgeId: string;
    sourceClientNodeId: string;
    targetClientNodeId: string;
    relationType: string | null;
};

export type CanvasViewportProjection = {
    x: number;
    y: number;
    k: number;
    backgroundMode: string | null;
    showImageInfo: boolean;
};

export type CanvasProjectionInput = {
    nodes: CanvasNodeProjection[];
    edges: CanvasEdgeProjection[];
    viewport: CanvasViewportProjection | null;
};

export type CanvasProjection = CanvasProjectionInput & {
    canvasId: string;
    projectId: string;
    revision: number;
    entities: ResearchEntityDetail[];
};

export type ProjectSkill = {
    id: string;
    projectId: string;
    name: string;
    definition: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type MemoryScope = "user_project_private";
