import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "./errors.js";
import { assertNotSelfRelation } from "./research-rules.js";
import type { ResearchStore } from "./store.js";
import { PI_SESSION_STORAGE_VERSION, type AgentRunStatus, type CanvasEdgeProjection, type CanvasNodeProjection, type CanvasProjection, type CanvasProjectionInput, type CanvasViewportProjection, type ConversationSession, type JsonObject, type NewRuntimeEvent, type RequestContext, type ResearchEntityType, type ResearchRevisionInput, type ResearchRevisionStatus } from "./types.js";

const ENTITY_COLUMNS = "id,project_id,type,head_revision_id,created_by,created_at,updated_at,archived_at";
const REVISION_COLUMNS = "id,entity_id,project_id,revision,title,summary,document,attributes,status,created_by,created_at";
const RELATION_COLUMNS = "id,project_id,source_entity_id,target_entity_id,relation_type,created_at";
// research_entity_revisions 对 research_entities 有两条 FK（entity_id 与 head_revision_id），必须点名约束。
const HEAD_COLUMNS = `head:research_entity_revisions!research_entities_head_revision_fkey(${REVISION_COLUMNS})`;

export class SupabaseResearchStore implements ResearchStore {
    constructor(private readonly client: SupabaseClient) {}

    async createProject(_userId: string, name: string) {
        const data = await this.rpc("create_project_with_canvas", { project_name: name });
        return project(row(first(data)));
    }

    async listProjects(_userId: string) {
        const { data, error } = await this.client.from("projects").select("id,owner_user_id,name,created_at,updated_at,canvas_workspaces!inner(id)").order("updated_at", { ascending: false });
        if (error) throw databaseError(error);
        return (data || []).map((value) => project(row(value)));
    }

    async readProject(_userId: string, projectId: string) {
        const { data, error } = await this.client.from("projects").select("id,owner_user_id,name,created_at,updated_at,canvas_workspaces!inner(id)").eq("id", projectId).maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到项目", 404, "project_not_found");
        return project(row(data));
    }

    async deleteProject(_userId: string, projectId: string) {
        const { data, error } = await this.client.from("projects").delete().eq("id", projectId).select("id").maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到项目", 404, "project_not_found");
    }

    async readCanvas(ctx: RequestContext) {
        const { data, error } = await this.client.from("canvas_workspaces").select("id,project_id,revision,snapshot,created_at,updated_at").eq("id", ctx.canvasWorkspaceId).eq("project_id", ctx.projectId).maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到画布工作区", 404, "canvas_not_found");
        return canvas(row(data));
    }

    async saveCanvasState(ctx: RequestContext, revision: number, snapshot: JsonObject) {
        const data = await this.rpc("save_canvas_state", { target_project_id: ctx.projectId, target_revision: revision, next_snapshot: snapshot });
        const value = first(data);
        if (!value) throw new AppError("找不到画布工作区", 404, "canvas_not_found");
        return canvas(row(value));
    }

    async readCanvasProjection(ctx: RequestContext): Promise<CanvasProjection> {
        const workspace = await this.readCanvas(ctx);
        const [nodes, edges, viewport, entities] = await Promise.all([
            this.select("canvas_nodes", "client_node_id,type,entity_id,x,y,width,height,group_client_id,display_state", ctx.canvasWorkspaceId),
            this.select("canvas_edges", "client_edge_id,relation_type,source:canvas_nodes!canvas_edges_source_node_id_fkey(client_node_id),target:canvas_nodes!canvas_edges_target_node_id_fkey(client_node_id)", ctx.canvasWorkspaceId),
            this.select("canvas_viewport", "x,y,k,background_mode,show_image_info", ctx.canvasWorkspaceId),
            this.listEntities(ctx),
        ]);
        return {
            canvasId: workspace.id,
            projectId: workspace.projectId,
            revision: workspace.revision,
            nodes: nodes.map((value) => canvasNode(row(value))),
            edges: edges.map((value) => canvasEdge(row(value))),
            viewport: viewport[0] ? canvasViewport(row(viewport[0])) : null,
            entities,
        };
    }

    async saveCanvasProjection(ctx: RequestContext, revision: number, projection: CanvasProjectionInput) {
        const data = await this.rpc("save_canvas_projection", {
            target_project_id: ctx.projectId,
            target_revision: revision,
            next_nodes: projection.nodes.map(nodePayload),
            next_edges: projection.edges.map(edgePayload),
            next_viewport: projection.viewport ? viewportPayload(projection.viewport) : null,
        });
        const value = first(data);
        if (!value) throw new AppError("找不到画布工作区", 404, "canvas_not_found");
        return canvas(row(value));
    }

    async listEntities(ctx: RequestContext) {
        const { data, error } = await this.client.from("research_entities").select(`${ENTITY_COLUMNS},${HEAD_COLUMNS}`).eq("project_id", ctx.projectId).is("archived_at", null).order("created_at", { ascending: true });
        if (error) throw databaseError(error);
        return (data || []).map((value) => researchEntityDetail(row(value)));
    }

    async readEntity(ctx: RequestContext, entityId: string) {
        const { data, error } = await this.client.from("research_entities").select(`${ENTITY_COLUMNS},${HEAD_COLUMNS}`).eq("id", entityId).eq("project_id", ctx.projectId).maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到研究对象", 404, "entity_not_found");
        return researchEntityDetail(row(data));
    }

    async createEntity(ctx: RequestContext, type: ResearchEntityType, input: ResearchRevisionInput) {
        const data = await this.rpc("create_research_entity", { target_project_id: ctx.projectId, entity_type: type, ...revisionArgs(input) });
        const value = first(data);
        if (!value) throw new AppError("创建研究对象失败", 500, "entity_create_failed");
        return await this.readEntity(ctx, string(row(value).id));
    }

    async appendEntityRevision(ctx: RequestContext, entityId: string, input: ResearchRevisionInput) {
        await this.readEntity(ctx, entityId);
        const data = await this.rpc("append_research_entity_revision", { target_project_id: ctx.projectId, target_entity_id: entityId, ...revisionArgs(input) });
        const value = first(data);
        if (!value) throw new AppError("创建 revision 失败", 500, "revision_create_failed");
        return researchRevision(row(value));
    }

    async listEntityRevisions(ctx: RequestContext, entityId: string) {
        await this.readEntity(ctx, entityId);
        const { data, error } = await this.client.from("research_entity_revisions").select(REVISION_COLUMNS).eq("entity_id", entityId).eq("project_id", ctx.projectId).order("revision", { ascending: true });
        if (error) throw databaseError(error);
        return (data || []).map((value) => researchRevision(row(value)));
    }

    async archiveEntity(ctx: RequestContext, entityId: string) {
        const { data, error } = await this.client.from("research_entities").update({ archived_at: new Date().toISOString() }).eq("id", entityId).eq("project_id", ctx.projectId).select(ENTITY_COLUMNS).maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到研究对象", 404, "entity_not_found");
        return researchEntity(row(data));
    }

    async listRelations(ctx: RequestContext) {
        const { data, error } = await this.client.from("research_relations").select(RELATION_COLUMNS).eq("project_id", ctx.projectId).order("created_at", { ascending: true });
        if (error) throw databaseError(error);
        return (data || []).map((value) => researchRelation(row(value)));
    }

    async createRelation(ctx: RequestContext, input: { sourceEntityId: string; targetEntityId: string; relationType: string }) {
        assertNotSelfRelation(input);
        const { data, error } = await this.client.from("research_relations").insert({
            project_id: ctx.projectId,
            source_entity_id: input.sourceEntityId,
            target_entity_id: input.targetEntityId,
            relation_type: input.relationType,
            created_by: ctx.userId,
        }).select(RELATION_COLUMNS).single();
        if (!error) return researchRelation(row(data));
        // 同一关系重复创建按幂等处理，返回已有那条（唯一约束 source+target+type）。
        if (error.code === "23505") {
            const { data: existing, error: readError } = await this.client.from("research_relations").select(RELATION_COLUMNS)
                .eq("project_id", ctx.projectId).eq("source_entity_id", input.sourceEntityId).eq("target_entity_id", input.targetEntityId).eq("relation_type", input.relationType).maybeSingle();
            if (readError) throw databaseError(readError);
            if (existing) return researchRelation(row(existing));
        }
        throw databaseError(error);
    }

    async deleteRelation(ctx: RequestContext, relationId: string) {
        const { data, error } = await this.client.from("research_relations").delete().eq("id", relationId).eq("project_id", ctx.projectId).select("id").maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到研究关系", 404, "relation_not_found");
    }

    private async select(table: string, columns: string, canvasWorkspaceId: string) {
        const { data, error } = await this.client.from(table).select(columns).eq("canvas_id", canvasWorkspaceId);
        if (error) throw databaseError(error);
        return (data || []) as unknown[];
    }

    async createConversation(ctx: RequestContext, title: string) {
        const { data, error } = await this.client.from("conversations").insert({ project_id: ctx.projectId, owner_user_id: ctx.userId, title }).select().single();
        if (error) throw databaseError(error);
        return conversation(row(data));
    }

    async listConversations(ctx: RequestContext) {
        const { data, error } = await this.client.from("conversations").select("id,project_id,owner_user_id,title,status,session_revision,codex_thread_id,created_at,updated_at").eq("project_id", ctx.projectId).order("updated_at", { ascending: false });
        if (error) throw databaseError(error);
        return (data || []).map((value) => conversation(row(value)));
    }

    async readConversation(ctx: RequestContext, conversationId: string) {
        const { data, error } = await this.client.from("conversations").select("id,project_id,owner_user_id,title,status,session_revision,codex_thread_id,created_at,updated_at").eq("id", conversationId).eq("project_id", ctx.projectId).maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到对话", 404, "conversation_not_found");
        return conversation(row(data));
    }

    async archiveConversation(ctx: RequestContext, conversationId: string) {
        await this.readConversation(ctx, conversationId);
        const { data: activeRuns, error: activeRunError } = await this.client.from("agent_runs").select("id").eq("conversation_id", conversationId).eq("status", "running").limit(1);
        if (activeRunError) throw databaseError(activeRunError);
        if (activeRuns?.length) throw new AppError("当前对话仍在运行", 409, "conversation_busy");
        const { data, error } = await this.client.from("conversations").update({ status: "archived" }).eq("id", conversationId).eq("project_id", ctx.projectId).select("id").maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到对话", 404, "conversation_not_found");
    }

    async loadConversationSession(ctx: RequestContext, conversationId: string): Promise<ConversationSession> {
        const { data, error } = await this.client.from("conversations").select("session_storage_version,session_revision,session_header,session_entries").eq("id", conversationId).eq("project_id", ctx.projectId).maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到对话", 404, "conversation_not_found");
        const value = row(data);
        const storageVersion = number(value.session_storage_version);
        if (storageVersion !== PI_SESSION_STORAGE_VERSION) throw new AppError("不支持当前对话存储版本，已拒绝覆盖", 409, "unsupported_session_storage_version");
        return {
            storageVersion,
            revision: number(value.session_revision),
            header: value.session_header && typeof value.session_header === "object" && !Array.isArray(value.session_header) ? row(value.session_header) : null,
            entries: Array.isArray(value.session_entries) ? value.session_entries.filter(isRow).map(row) : [],
        };
    }

    async saveConversationSession(ctx: RequestContext, conversationId: string, session: ConversationSession) {
        if (session.storageVersion !== PI_SESSION_STORAGE_VERSION) throw new AppError("不支持当前对话存储版本，已拒绝覆盖", 409, "unsupported_session_storage_version");
        const data = await this.rpc("save_conversation_session", {
            target_project_id: ctx.projectId,
            target_conversation_id: conversationId,
            expected_revision: session.revision,
            next_header: session.header,
            next_entries: session.entries,
        });
        const value = first(data);
        if (!value) throw new AppError("对话已在其他运行中更新", 409, "session_revision_conflict");
        return number(row(value).session_revision);
    }

    async bindCodexThread(ctx: RequestContext, conversationId: string, threadId: string) {
        const { data, error } = await this.client.from("conversations").update({ codex_thread_id: threadId }).eq("id", conversationId).eq("project_id", ctx.projectId).select("id,project_id,owner_user_id,title,status,session_revision,codex_thread_id,created_at,updated_at").maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到对话", 404, "conversation_not_found");
        return conversation(row(data));
    }

    async bindCodexTurn(ctx: RequestContext, conversationId: string, runId: string, turnId: string) {
        await this.readConversation(ctx, conversationId);
        const { data, error } = await this.client.from("agent_runs").update({ codex_turn_id: turnId }).eq("id", runId).eq("conversation_id", conversationId).select().maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到运行记录", 404, "run_not_found");
        return run(row(data));
    }

    async beginRun(ctx: RequestContext, conversationId: string) {
        await this.readConversation(ctx, conversationId);
        const { data, error } = await this.client.from("agent_runs").insert({ conversation_id: conversationId, actor_user_id: ctx.userId }).select().single();
        if (error) throw databaseError(error);
        return run(row(data));
    }

    async finishRun(ctx: RequestContext, runId: string, status: Exclude<AgentRunStatus, "running">) {
        const { data, error } = await this.client.from("agent_runs").update({ status, completed_at: new Date().toISOString() }).eq("id", runId).eq("actor_user_id", ctx.userId).select("id").maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到运行记录", 404, "run_not_found");
    }

    async readRun(ctx: RequestContext, conversationId: string, runId: string) {
        const { data, error } = await this.client.from("agent_runs").select().eq("id", runId).eq("conversation_id", conversationId).maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到运行记录", 404, "run_not_found");
        return run(row(data));
    }

    async appendEvent(ctx: RequestContext, event: NewRuntimeEvent) {
        const { data, error } = await this.client.from("agent_events").insert({
            run_id: event.runId,
            project_id: ctx.projectId,
            canvas_workspace_id: ctx.canvasWorkspaceId,
            conversation_id: event.conversationId,
            thread_id: event.threadId,
            turn_id: event.turnId,
            item_id: event.itemId,
            type: event.type,
            protocol_version: event.protocolVersion,
            payload: event.payload,
        }).select().single();
        if (error) throw databaseError(error);
        return runtimeEvent(row(data));
    }

    async listEvents(ctx: RequestContext, conversationId: string, after: number) {
        const { data, error } = await this.client.from("agent_events").select().eq("conversation_id", conversationId).gt("sequence", after).order("sequence", { ascending: true });
        if (error) throw databaseError(error);
        return (data || []).map((value) => runtimeEvent(row(value)));
    }

    async listSkills(ctx: RequestContext) {
        const { data, error } = await this.client.from("project_skills").select().eq("project_id", ctx.projectId).order("name", { ascending: true });
        if (error) throw databaseError(error);
        return (data || []).map((value) => skill(row(value)));
    }

    // 不能用 upsert：ON CONFLICT DO UPDATE 会把 project_id 也写进 SET，而 authenticated 只被授予
    // update (name, definition, enabled)，Postgres 按 SET 列校验权限，连首次创建都会 42501。
    async saveSkill(ctx: RequestContext, input: { name: string; definition: string; enabled: boolean }) {
        const updated = await this.updateSkill(ctx, input);
        if (updated) return updated;
        const { data, error } = await this.client.from("project_skills").insert({ project_id: ctx.projectId, ...input }).select().single();
        if (!error) return skill(row(data));
        // 并发创建同名 Skill：对方先插入成功，这里改为更新。
        if (error.code === "23505") {
            const raced = await this.updateSkill(ctx, input);
            if (raced) return raced;
        }
        throw databaseError(error);
    }

    private async updateSkill(ctx: RequestContext, input: { name: string; definition: string; enabled: boolean }) {
        const { data, error } = await this.client.from("project_skills")
            .update({ definition: input.definition, enabled: input.enabled })
            .eq("project_id", ctx.projectId)
            .eq("name", input.name)
            .select()
            .maybeSingle();
        if (error) throw databaseError(error);
        return data ? skill(row(data)) : null;
    }

    async deleteSkill(ctx: RequestContext, name: string) {
        const { data, error } = await this.client.from("project_skills").delete().eq("project_id", ctx.projectId).eq("name", name).select("id").maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw new AppError("找不到 Skill", 404, "skill_not_found");
    }

    private async rpc(name: string, args: Record<string, unknown>) {
        const { data, error } = await this.client.rpc(name, args);
        if (error) throw databaseError(error);
        return data;
    }
}

function databaseError(error: { code?: string; message: string }) {
    if (error.code === "23505") return new AppError("当前对话已有任务正在运行", 409, "conversation_busy");
    if (error.code === "P0409") return new AppError(error.message === "conversation_not_active" ? "对话已归档" : "当前对话仍在运行", 409, error.message === "conversation_not_active" ? "conversation_archived" : "conversation_busy");
    if (error.code === "42501") return new AppError("无权访问该资源", 403, "forbidden");
    return new AppError(error.message, 500, "database_error");
}

function project(value: Record<string, unknown>) {
    // canvas_workspaces.project_id 唯一，PostgREST 把这个一对一嵌入返回成对象；创建项目的 RPC 则直接给出 canvas_workspace_id。
    const nested = value.canvas_workspace_id ? { id: value.canvas_workspace_id } : first(value.canvas_workspaces);
    const canvasWorkspaceId = string(row(nested).id);
    if (!canvasWorkspaceId) throw new AppError("项目缺少画布工作区", 500, "invalid_project");
    return { id: string(value.id), ownerUserId: string(value.owner_user_id), name: string(value.name), canvasWorkspaceId, createdAt: string(value.created_at), updatedAt: string(value.updated_at) };
}

function canvas(value: Record<string, unknown>) {
    const snapshot = value.snapshot && typeof value.snapshot === "object" && !Array.isArray(value.snapshot) ? row(value.snapshot) : null;
    return { id: string(value.id), projectId: string(value.project_id), revision: number(value.revision), snapshot, createdAt: string(value.created_at), updatedAt: string(value.updated_at) };
}

function conversation(value: Record<string, unknown>) {
    return { id: string(value.id), projectId: string(value.project_id), ownerUserId: string(value.owner_user_id), title: string(value.title), status: value.status === "archived" ? "archived" as const : "active" as const, sessionRevision: number(value.session_revision), codexThreadId: value.codex_thread_id ? string(value.codex_thread_id) : null, createdAt: string(value.created_at), updatedAt: string(value.updated_at) };
}

function run(value: Record<string, unknown>) {
    const status = ["completed", "failed", "aborted"].includes(string(value.status)) ? string(value.status) as "completed" | "failed" | "aborted" : "running" as const;
    return { id: string(value.id), conversationId: string(value.conversation_id), actorUserId: string(value.actor_user_id), status, codexTurnId: value.codex_turn_id ? string(value.codex_turn_id) : null, startedAt: string(value.started_at), completedAt: value.completed_at ? string(value.completed_at) : null };
}

function runtimeEvent(value: Record<string, unknown>) {
    return {
        protocolVersion: number(value.protocol_version),
        sequence: number(value.sequence),
        type: string(value.type) as import("./types.js").RuntimeEventType,
        projectId: string(value.project_id),
        canvasWorkspaceId: string(value.canvas_workspace_id),
        conversationId: string(value.conversation_id),
        threadId: string(value.thread_id),
        runId: string(value.run_id),
        turnId: string(value.turn_id),
        itemId: string(value.item_id),
        payload: row(value.payload),
        createdAt: string(value.created_at),
    };
}

function researchEntity(value: Record<string, unknown>) {
    return {
        id: string(value.id),
        projectId: string(value.project_id),
        type: string(value.type) as ResearchEntityType,
        headRevisionId: value.head_revision_id ? string(value.head_revision_id) : null,
        createdBy: string(value.created_by),
        createdAt: string(value.created_at),
        updatedAt: string(value.updated_at),
        archivedAt: value.archived_at ? string(value.archived_at) : null,
    };
}

function researchEntityDetail(value: Record<string, unknown>) {
    const head = first(value.head);
    return { ...researchEntity(value), head: isRow(head) ? researchRevision(head) : null };
}

function researchRevision(value: Record<string, unknown>) {
    return {
        id: string(value.id),
        entityId: string(value.entity_id),
        projectId: string(value.project_id),
        revision: number(value.revision),
        title: string(value.title),
        summary: string(value.summary),
        document: string(value.document),
        attributes: row(value.attributes),
        status: string(value.status) as ResearchRevisionStatus,
        createdBy: string(value.created_by),
        createdAt: string(value.created_at),
    };
}

function researchRelation(value: Record<string, unknown>) {
    return {
        id: string(value.id),
        projectId: string(value.project_id),
        sourceEntityId: string(value.source_entity_id),
        targetEntityId: string(value.target_entity_id),
        relationType: string(value.relation_type),
        createdAt: string(value.created_at),
    };
}

function canvasNode(value: Record<string, unknown>): CanvasNodeProjection {
    return {
        clientNodeId: string(value.client_node_id),
        type: string(value.type),
        entityId: value.entity_id ? string(value.entity_id) : null,
        x: number(value.x),
        y: number(value.y),
        width: number(value.width),
        height: number(value.height),
        groupClientId: value.group_client_id ? string(value.group_client_id) : null,
        displayState: row(value.display_state),
    };
}

function canvasEdge(value: Record<string, unknown>): CanvasEdgeProjection {
    return {
        clientEdgeId: string(value.client_edge_id),
        sourceClientNodeId: string(row(first(value.source)).client_node_id),
        targetClientNodeId: string(row(first(value.target)).client_node_id),
        relationType: value.relation_type ? string(value.relation_type) : null,
    };
}

function canvasViewport(value: Record<string, unknown>): CanvasViewportProjection {
    return {
        x: number(value.x),
        y: number(value.y),
        k: number(value.k),
        backgroundMode: value.background_mode ? string(value.background_mode) : null,
        showImageInfo: Boolean(value.show_image_info),
    };
}

function nodePayload(node: CanvasNodeProjection) {
    return {
        clientNodeId: node.clientNodeId,
        type: node.type,
        entityId: node.entityId,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        groupClientId: node.groupClientId,
        displayState: node.displayState,
    };
}

function edgePayload(edge: CanvasEdgeProjection) {
    return {
        clientEdgeId: edge.clientEdgeId,
        sourceClientNodeId: edge.sourceClientNodeId,
        targetClientNodeId: edge.targetClientNodeId,
        relationType: edge.relationType,
    };
}

function viewportPayload(viewport: CanvasViewportProjection) {
    return { x: viewport.x, y: viewport.y, k: viewport.k, backgroundMode: viewport.backgroundMode, showImageInfo: viewport.showImageInfo };
}

function revisionArgs(input: ResearchRevisionInput) {
    return {
        next_title: input.title,
        next_summary: input.summary,
        next_document: input.document,
        next_attributes: input.attributes,
        next_status: input.status,
    };
}

function skill(value: Record<string, unknown>) {
    return { id: string(value.id), projectId: string(value.project_id), name: string(value.name), definition: string(value.definition), enabled: Boolean(value.enabled), createdAt: string(value.created_at), updatedAt: string(value.updated_at) };
}

function first(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value;
}

function isRow(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function row(value: unknown): Record<string, unknown> {
    return isRow(value) ? value : {};
}

function string(value: unknown) {
    return typeof value === "string" ? value : "";
}

function number(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
