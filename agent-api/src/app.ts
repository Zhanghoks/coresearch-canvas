import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import { SupabaseAuth, type AuthenticatedRequest } from "./auth.js";
import { CanvasBridge } from "./canvas-bridge.js";
import type { AppConfig } from "./config.js";
import { CodexRuntimeAdapter } from "./codex/runtime.js";
import { AppError } from "./errors.js";
import { EventHub } from "./event-hub.js";
import { createInviteAdmin, InviteRateLimiter, registerWithInvite } from "./invite.js";
import { PiRuntimeAdapter } from "./pi-runtime.js";
import { ConversationModule, ProjectModule, requiredText } from "./project-module.js";
import { ResearchModule } from "./research-module.js";
import type { RuntimeAdapter } from "./runtime.js";
import { RuntimeManager } from "./runtime-manager.js";
import { RuntimeTokenService } from "./runtime-token.js";
import { SupabaseResearchStore } from "./supabase-store.js";
import { AGENT_PROTOCOL_VERSION, type CanvasWorkspace, type JsonObject, type RuntimeEvent } from "./types.js";

export function createApp(config: AppConfig, deps: { canvas?: CanvasBridge; adapter?: RuntimeAdapter } = {}) {
    const startedAt = new Date().toISOString();
    const app = express();
    const auth = new SupabaseAuth(config.supabaseUrl, config.supabasePublishableKey);
    const hub = new EventHub();
    const canvas = deps.canvas || new CanvasBridge();
    const adapter = deps.adapter || createRuntimeAdapter(config, canvas);
    const runtime = new RuntimeManager(adapter, hub);
    const codex = adapter instanceof CodexRuntimeAdapter ? adapter : null;
    const invites = new InviteRateLimiter();
    const inviteAdmin = createInviteAdmin(config.supabaseUrl, config.supabaseSecretKey);

    // 跨域时浏览器默认不让前端读自定义响应头，前端连 SSE 要校验 X-Agent-Protocol-Version，必须显式暴露。
    app.use(cors({ origin: (origin, callback) => callback(null, !origin || config.origins.includes(origin)), exposedHeaders: ["X-Agent-Protocol-Version"] }));
    app.use(express.json());
    app.get("/health", (_request, response) => response.json({
        ok: true,
        status: "ok",
        // GIT_SHA 由镜像构建时注入；CI 用它断言服务器上跑的确实是本次部署的代码，只看 200 不足以证明。
        version: process.env.GIT_SHA?.trim() || "unknown",
        appVersion: process.env.APP_VERSION?.trim() || "unknown",
        runtime: config.runtime,
        startedAt,
    }));

    app.post("/internal/runtime/canvas/read", requireLoopback, asyncRoute(async (request, response) => {
        if (!codex) throw new AppError("当前运行时不是 Codex", 409, "runtime_not_codex");
        const snapshot = await codex.readCanvas(runtimeToken(request));
        response.json(snapshot);
    }));
    app.post("/internal/runtime/canvas/apply", requireLoopback, asyncRoute(async (request, response) => {
        if (!codex) throw new AppError("当前运行时不是 Codex", 409, "runtime_not_codex");
        const operations = Array.isArray(request.body?.operations) ? request.body.operations : [];
        const summary = requiredText(request.body?.summary, "缺少画布修改说明");
        const result = await codex.applyCanvas(runtimeToken(request), operations, summary);
        response.json({ result });
    }));

    app.post("/v1/auth/register", asyncRoute(async (request, response) => {
        invites.consume(clientIp(request));
        const result = await registerWithInvite(inviteAdmin, request.body || {});
        response.status(201).json({ nickname: result.nickname });
    }));

    app.use(asyncRoute(async (request, response, next) => {
        response.locals.auth = await auth.authenticate(request.header("authorization"));
        next();
    }));

    app.post("/v1/projects", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        response.status(201).json(await scope.projects.create(scope.auth.userId, request.body || {}));
    }));
    app.get("/v1/projects", asyncRoute(async (_request, response) => {
        const scope = requestScope(response);
        response.json(await scope.projects.listMine(scope.auth.userId));
    }));
    app.get("/v1/projects/:projectId", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        response.json(await scope.projects.readOwned(scope.auth.userId, routeParam(request, "projectId")));
    }));
    app.delete("/v1/projects/:projectId", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        try {
            await scope.projects.deleteOwned(scope.auth.userId, routeParam(request, "projectId"));
        } catch (error) {
            if (!(error instanceof AppError) || error.code !== "project_not_found") throw error;
        }
        response.status(204).end();
    }));

    app.get("/v1/projects/:projectId/canvas", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.store.readCanvas(ctx));
    }));
    app.put("/v1/projects/:projectId/canvas/state", publishCanvas(canvas));
    app.post("/v1/projects/:projectId/canvas/tool-results/:requestId", completeCanvasTool(canvas));

    app.get("/v1/projects/:projectId/canvas/projection", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.research.readProjection(ctx));
    }));
    app.put("/v1/projects/:projectId/canvas/projection", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        const baseRevision = nonNegativeInteger(request.body?.baseRevision, "画布 baseRevision 无效");
        response.json(await scope.research.saveProjection(ctx, baseRevision, jsonObject(request.body, "画布投影无效")));
    }));

    app.get("/v1/projects/:projectId/entities", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.research.listEntities(ctx));
    }));
    app.post("/v1/projects/:projectId/entities", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.status(201).json(await scope.research.createEntity(ctx, jsonObject(request.body, "研究对象无效")));
    }));
    app.get("/v1/projects/:projectId/entities/:entityId", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.research.readEntity(ctx, routeParam(request, "entityId")));
    }));
    app.delete("/v1/projects/:projectId/entities/:entityId", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        await scope.research.archiveEntity(ctx, routeParam(request, "entityId"));
        response.status(204).end();
    }));
    app.get("/v1/projects/:projectId/entities/:entityId/revisions", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.research.listRevisions(ctx, routeParam(request, "entityId")));
    }));
    app.post("/v1/projects/:projectId/entities/:entityId/revisions", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.status(201).json(await scope.research.appendRevision(ctx, routeParam(request, "entityId"), jsonObject(request.body, "revision 无效")));
    }));
    app.post("/v1/projects/:projectId/entities/:entityId/confirm", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.status(201).json(await scope.research.confirmEntity(ctx, routeParam(request, "entityId"), jsonObject(request.body || {}, "确认内容无效")));
    }));

    app.get("/v1/projects/:projectId/relations", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.research.listRelations(ctx));
    }));
    app.post("/v1/projects/:projectId/relations", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.status(201).json(await scope.research.createRelation(ctx, jsonObject(request.body, "研究关系无效")));
    }));
    app.delete("/v1/projects/:projectId/relations/:relationId", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        await scope.research.deleteRelation(ctx, routeParam(request, "relationId"));
        response.status(204).end();
    }));

    app.post("/v1/projects/:projectId/conversations", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.status(201).json(await scope.conversations.create(ctx, request.body || {}));
    }));
    app.get("/v1/projects/:projectId/conversations", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.conversations.list(ctx));
    }));
    app.get("/v1/projects/:projectId/conversations/:conversationId", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        const conversation = await scope.conversations.read(ctx, routeParam(request, "conversationId"));
        response.json({ conversation, events: await scope.store.listEvents(ctx, routeParam(request, "conversationId"), 0) });
    }));
    app.post("/v1/projects/:projectId/conversations/:conversationId/archive", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        await scope.conversations.archive(ctx, routeParam(request, "conversationId"));
        response.status(204).end();
    }));
    app.post("/v1/projects/:projectId/conversations/:conversationId/turns", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        const result = await runtime.runTurn(scope.store, ctx, { conversationId: routeParam(request, "conversationId"), prompt: requiredText(request.body?.prompt, "消息不能为空") });
        response.status(202).json(result);
    }));
    app.post("/v1/projects/:projectId/conversations/:conversationId/runs/:runId/abort", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        await runtime.abort(scope.store, ctx, routeParam(request, "conversationId"), routeParam(request, "runId"));
        response.status(202).json({ runId: routeParam(request, "runId"), abortRequested: true });
    }));
    app.get("/v1/projects/:projectId/conversations/:conversationId/events", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        await scope.conversations.read(ctx, routeParam(request, "conversationId"));
        const after = optionalNonNegativeInteger(request.query.after);
        response.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Agent-Protocol-Version": String(AGENT_PROTOCOL_VERSION) });
        response.flushHeaders();
        let cursor = after;
        let loading = true;
        const buffered: RuntimeEvent[] = [];
        const unsubscribe = hub.subscribe(routeParam(request, "conversationId"), (event) => {
            if (event.projectId !== ctx.projectId || event.sequence <= cursor) return;
            if (loading) buffered.push(event);
            else {
                writeSse(response, event);
                cursor = event.sequence;
            }
        });
        request.on("close", unsubscribe);
        for (const event of await scope.store.listEvents(ctx, routeParam(request, "conversationId"), cursor)) {
            writeSse(response, event);
            cursor = event.sequence;
        }
        loading = false;
        for (const event of buffered.sort((left, right) => left.sequence - right.sequence)) {
            if (event.sequence <= cursor) continue;
            writeSse(response, event);
            cursor = event.sequence;
        }
    }));

    app.get("/v1/projects/:projectId/skills", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.store.listSkills(ctx));
    }));
    app.put("/v1/projects/:projectId/skills/:name", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        response.json(await scope.store.saveSkill(ctx, {
            name: requiredText(routeParam(request, "name"), "Skill 名称不能为空"),
            definition: requiredText(request.body?.definition, "Skill 内容不能为空"),
            enabled: request.body?.enabled !== false,
        }));
    }));
    app.delete("/v1/projects/:projectId/skills/:name", asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        await scope.store.deleteSkill(ctx, routeParam(request, "name"));
        response.status(204).end();
    }));

    app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
        const status = error instanceof AppError ? error.statusCode : 500;
        response.status(status).json({ error: { code: error instanceof AppError ? error.code : "internal_error", message: error instanceof AppError ? error.message : "Agent API 内部错误", ...(error instanceof AppError && error.details ? { details: error.details } : {}) } });
    });
    return app;
}

function createRuntimeAdapter(config: AppConfig, canvas: CanvasBridge): RuntimeAdapter {
    if (config.runtime === "codex") {
        if (!config.codex) throw new AppError("缺少 Codex 运行时配置", 500, "configuration_error");
        return new CodexRuntimeAdapter({
            bin: config.codex.bin,
            apiKey: config.codex.apiKey,
            runtimeRoot: config.codex.runtimeRoot,
            tokens: new RuntimeTokenService(config.codex.tokenSecret),
            canvas,
            mcp: config.codex.mcp,
        });
    }
    if (!config.pi) throw new AppError("缺少 Pi 运行时配置", 500, "configuration_error");
    return new PiRuntimeAdapter(canvas, config.pi);
}

function publishCanvas(canvas: CanvasBridge) {
    return asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        const clientId = requiredText(request.body?.clientId, "缺少画布客户端 ID");
        const baseRevision = nonNegativeInteger(request.body?.baseRevision, "画布 baseRevision 无效");
        const snapshot = jsonObject(request.body?.snapshot, "画布快照无效");
        const workspace = await scope.store.saveCanvasState(ctx, baseRevision, snapshot);
        canvas.publishSnapshot(ctx, clientId, workspace.revision, snapshot);
        response.json(workspace);
    });
}

function completeCanvasTool(canvas: CanvasBridge) {
    return asyncRoute(async (request, response) => {
        const scope = requestScope(response);
        const ctx = await scope.projects.context(scope.auth.userId, routeParam(request, "projectId"));
        const result = jsonObject(request.body?.result, "工具结果无效");
        let workspace: CanvasWorkspace | null = null;
        if (request.body?.snapshot !== undefined || request.body?.baseRevision !== undefined) {
            const clientId = requiredText(request.body?.clientId, "缺少画布客户端 ID");
            const baseRevision = nonNegativeInteger(request.body?.baseRevision, "画布 baseRevision 无效");
            const snapshot = jsonObject(request.body?.snapshot, "画布快照无效");
            workspace = await scope.store.saveCanvasState(ctx, baseRevision, snapshot);
            canvas.publishSnapshot(ctx, clientId, workspace.revision, snapshot);
        }
        canvas.completeMutation(ctx, requiredText(routeParam(request, "requestId"), "缺少工具调用 ID"), result);
        // 带了快照就把服务端分配的新 revision 回给浏览器，它据此继续后续发布。
        if (workspace) response.json(workspace);
        else response.status(204).end();
    });
}

function requireLoopback(request: Request, _response: Response, next: NextFunction) {
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
        next(new AppError("仅允许本机调用", 403, "loopback_only"));
        return;
    }
    next();
}

function isLoopbackAddress(address: string | undefined) {
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function clientIp(request: Request) {
    const forwarded = request.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
    return request.socket.remoteAddress || "unknown";
}

function runtimeToken(request: Request) {
    const match = /^Bearer\s+(.+)$/i.exec(request.header("authorization") || "");
    if (!match?.[1]) throw new AppError("缺少运行时 token", 401, "invalid_runtime_token");
    return match[1];
}

/**
 * Express 5 的 ParamsDictionary 索引签名是 string | string[]，配合 noUncheckedIndexedAccess
 * 读出来是 string | string[] | undefined。直接传进 UUID 查询会把数组静默带下去，这里统一收窄。
 */
function routeParam(request: Request, name: string) {
    const value = request.params[name];
    if (typeof value !== "string" || !value) throw new AppError(`缺少路径参数 ${name}`, 400, "invalid_input");
    return value;
}

function requestScope(response: Response) {
    const auth = response.locals.auth as AuthenticatedRequest | undefined;
    if (!auth) throw new AppError("登录状态无效", 401, "unauthorized");
    const store = new SupabaseResearchStore(auth.database);
    return { auth, store, projects: new ProjectModule(store), conversations: new ConversationModule(store), research: new ResearchModule(store) };
}

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
    return (request: Request, response: Response, next: NextFunction) => void handler(request, response, next).catch(next);
}

function jsonObject(value: unknown, message: string): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError(message, 400, "invalid_input");
    return value as JsonObject;
}

function nonNegativeInteger(value: unknown, message: string) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new AppError(message, 400, "invalid_input");
    return value;
}

function optionalNonNegativeInteger(value: unknown) {
    if (value === undefined) return 0;
    const parsed = typeof value === "string" ? Number(value) : NaN;
    return nonNegativeInteger(parsed, "事件序号无效");
}

function writeSse(response: Response, event: RuntimeEvent) {
    response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
