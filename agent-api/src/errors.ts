export class AppError extends Error {
    constructor(
        message: string,
        readonly statusCode: number,
        readonly code: string,
        readonly details?: Record<string, unknown>,
        /** 原始错误（例如 PostgREST/Postgres 错误），只写服务端日志，不返回给客户端。 */
        readonly internal?: unknown,
    ) {
        super(message);
        this.name = "AppError";
    }
}

// 客户端据 currentRevision 决定如何重试（见 web/src/lib/canvas/hosted-canvas-sync.ts）。
export function canvasRevisionConflict(currentRevision: number) {
    return new AppError("画布已在别处更新", 409, "canvas_revision_conflict", { currentRevision });
}
