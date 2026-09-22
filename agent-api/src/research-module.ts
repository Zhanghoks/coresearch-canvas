import { AppError } from "./errors.js";
import { requiredText } from "./project-module.js";
import type { ResearchStore } from "./store.js";
import {
    RESEARCH_ENTITY_TYPES,
    type CanvasEdgeProjection,
    type CanvasNodeProjection,
    type CanvasProjectionInput,
    type CanvasViewportProjection,
    type JsonObject,
    type RequestContext,
    type ResearchEntityType,
    type ResearchRevisionInput,
    type ResearchRevisionStatus,
} from "./types.js";

const REVISION_STATUSES: ResearchRevisionStatus[] = ["draft", "confirmed", "superseded", "archived"];

export class ResearchModule {
    constructor(private readonly store: ResearchStore) {}

    listEntities(ctx: RequestContext) {
        return this.store.listEntities(ctx);
    }

    readEntity(ctx: RequestContext, entityId: string) {
        return this.store.readEntity(ctx, entityId);
    }

    async createEntity(ctx: RequestContext, body: JsonObject) {
        return await this.store.createEntity(ctx, entityType(body.type), revisionInput(body));
    }

    async appendRevision(ctx: RequestContext, entityId: string, body: JsonObject) {
        return await this.store.appendEntityRevision(ctx, entityId, revisionInput(body));
    }

    listRevisions(ctx: RequestContext, entityId: string) {
        return this.store.listEntityRevisions(ctx, entityId);
    }

    /** 确认 = 以当前 head 的内容追加一条 confirmed revision，正文可同时更新。 */
    async confirmEntity(ctx: RequestContext, entityId: string, body: JsonObject) {
        const entity = await this.store.readEntity(ctx, entityId);
        if (!entity.head) throw new AppError("研究对象缺少 revision", 409, "entity_without_revision");
        return await this.store.appendEntityRevision(ctx, entityId, {
            title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : entity.head.title,
            summary: typeof body.summary === "string" ? body.summary : entity.head.summary,
            document: typeof body.document === "string" ? body.document : entity.head.document,
            attributes: isJsonObject(body.attributes) ? body.attributes : entity.head.attributes,
            status: "confirmed",
        });
    }

    archiveEntity(ctx: RequestContext, entityId: string) {
        return this.store.archiveEntity(ctx, entityId);
    }

    listRelations(ctx: RequestContext) {
        return this.store.listRelations(ctx);
    }

    async createRelation(ctx: RequestContext, body: JsonObject) {
        return await this.store.createRelation(ctx, {
            sourceEntityId: requiredText(body.sourceEntityId, "缺少关系起点"),
            targetEntityId: requiredText(body.targetEntityId, "缺少关系终点"),
            relationType: requiredText(body.relationType, "缺少关系类型"),
        });
    }

    deleteRelation(ctx: RequestContext, relationId: string) {
        return this.store.deleteRelation(ctx, relationId);
    }

    readProjection(ctx: RequestContext) {
        return this.store.readCanvasProjection(ctx);
    }

    async saveProjection(ctx: RequestContext, revision: number, body: JsonObject) {
        return await this.store.saveCanvasProjection(ctx, revision, projectionInput(body));
    }
}

function entityType(value: unknown): ResearchEntityType {
    const type = requiredText(value, "缺少研究对象类型");
    if (!RESEARCH_ENTITY_TYPES.includes(type as ResearchEntityType)) throw new AppError("不支持的研究对象类型", 400, "invalid_entity_type");
    return type as ResearchEntityType;
}

function revisionInput(body: JsonObject): ResearchRevisionInput {
    const status = typeof body.status === "string" ? body.status : "draft";
    if (!REVISION_STATUSES.includes(status as ResearchRevisionStatus)) throw new AppError("不支持的 revision 状态", 400, "invalid_revision_status");
    return {
        title: requiredText(body.title, "研究对象标题不能为空"),
        summary: typeof body.summary === "string" ? body.summary : "",
        document: typeof body.document === "string" ? body.document : "",
        attributes: isJsonObject(body.attributes) ? body.attributes : {},
        status: status as ResearchRevisionStatus,
    };
}

function projectionInput(body: JsonObject): CanvasProjectionInput {
    if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) throw new AppError("画布投影无效", 400, "invalid_input");
    const nodes = body.nodes.map(projectionNode);
    const known = new Set(nodes.map((node) => node.clientNodeId));
    return {
        nodes,
        // 指向不存在节点的边直接丢弃，避免把断边写进库。
        edges: body.edges.map(projectionEdge).filter((edge) => known.has(edge.sourceClientNodeId) && known.has(edge.targetClientNodeId)),
        viewport: isJsonObject(body.viewport) ? projectionViewport(body.viewport) : null,
    };
}

function projectionNode(value: unknown): CanvasNodeProjection {
    if (!isJsonObject(value)) throw new AppError("画布节点无效", 400, "invalid_input");
    return {
        clientNodeId: requiredText(value.clientNodeId, "画布节点缺少 id"),
        type: requiredText(value.type, "画布节点缺少类型"),
        entityId: typeof value.entityId === "string" && value.entityId ? value.entityId : null,
        x: finite(value.x),
        y: finite(value.y),
        width: finite(value.width),
        height: finite(value.height),
        groupClientId: typeof value.groupClientId === "string" && value.groupClientId ? value.groupClientId : null,
        displayState: isJsonObject(value.displayState) ? value.displayState : {},
    };
}

function projectionEdge(value: unknown): CanvasEdgeProjection {
    if (!isJsonObject(value)) throw new AppError("画布连线无效", 400, "invalid_input");
    return {
        clientEdgeId: requiredText(value.clientEdgeId, "画布连线缺少 id"),
        sourceClientNodeId: requiredText(value.sourceClientNodeId, "画布连线缺少起点"),
        targetClientNodeId: requiredText(value.targetClientNodeId, "画布连线缺少终点"),
        relationType: typeof value.relationType === "string" && value.relationType ? value.relationType : null,
    };
}

function projectionViewport(value: JsonObject): CanvasViewportProjection {
    return {
        x: finite(value.x),
        y: finite(value.y),
        k: finite(value.k) || 1,
        backgroundMode: typeof value.backgroundMode === "string" && value.backgroundMode ? value.backgroundMode : null,
        showImageInfo: Boolean(value.showImageInfo),
    };
}

function finite(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isJsonObject(value: unknown): value is JsonObject {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
