import crypto from "node:crypto";

import { AppError } from "./errors.js";
import type { JsonObject, RequestContext } from "./types.js";

type Snapshot = {
    ctx: RequestContext;
    clientId: string;
    revision: number;
    value: JsonObject;
};

type PendingMutation = {
    ctx: RequestContext;
    resolve: (value: JsonObject) => void;
    reject: (error: Error) => void;
};

// 用户不点确认/拒绝时，run 会一直占住对话（one_active_run_per_conversation），之后的输入全部被拒。
// 超时后按「用户未确认」返回给模型，让本轮正常结束。
export const CANVAS_CONFIRMATION_TIMEOUT_MS = 10 * 60_000;

export class CanvasBridge {
    constructor(private readonly confirmationTimeoutMs = CANVAS_CONFIRMATION_TIMEOUT_MS) {}

    private readonly snapshots = new Map<string, Snapshot>();
    private readonly pending = new Map<string, PendingMutation>();

    publishSnapshot(ctx: RequestContext, clientId: string, revision: number, value: JsonObject) {
        const current = this.snapshots.get(ctx.canvasWorkspaceId);
        if (!current || revision >= current.revision) this.snapshots.set(ctx.canvasWorkspaceId, { ctx, clientId, revision, value: structuredClone(value) });
    }

    readSnapshot(ctx: RequestContext) {
        const snapshot = this.snapshots.get(ctx.canvasWorkspaceId);
        if (!snapshot || !sameScope(snapshot.ctx, ctx)) throw new AppError("当前项目没有在线画布快照", 409, "canvas_not_connected");
        return { revision: snapshot.revision, snapshot: structuredClone(snapshot.value) };
    }

    requestMutation(ctx: RequestContext, signal: AbortSignal) {
        this.readSnapshot(ctx);
        const callId = crypto.randomUUID();
        const result = new Promise<JsonObject>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pending.delete(callId)) resolve({ approved: false, error: "confirmation_timeout" });
            }, this.confirmationTimeoutMs);
            timer.unref?.();
            this.pending.set(callId, { ctx, resolve: (value) => { clearTimeout(timer); resolve(value); }, reject });
            signal.addEventListener("abort", () => {
                clearTimeout(timer);
                if (!this.pending.delete(callId)) return;
                reject(new AppError("运行已停止", 409, "run_aborted"));
            }, { once: true });
        });
        return { callId, result };
    }

    completeMutation(ctx: RequestContext, callId: string, result: JsonObject) {
        const mutation = this.pending.get(callId);
        if (!mutation || !sameScope(mutation.ctx, ctx)) throw new AppError("找不到画布工具调用", 404, "canvas_tool_call_not_found");
        this.pending.delete(callId);
        mutation.resolve(structuredClone(result));
    }
}

function sameScope(left: RequestContext, right: RequestContext) {
    return left.userId === right.userId && left.projectId === right.projectId && left.canvasWorkspaceId === right.canvasWorkspaceId;
}
