import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { AGENT_PROTOCOL_VERSION } from "./types.js";

// 运行中的 run 只存在于单个 Agent API 进程内（RuntimeManager 的 AbortController、CanvasBridge 的待确认工具调用）。
// 进程退出后这些 run 会永远停在 status='running'，而 one_active_run_per_conversation 唯一索引会让对应
// Conversation 再也无法发起新 turn。启动时把它们收尾，是单实例部署下的正确做法。
// 先补发终止事件再改状态：前端用 GET /conversations/:id/events?after=N 重连时一定能看到收尾事件。

const INTERRUPTED_MESSAGE = "服务已重启，本次运行已中断";

type OrphanRun = { id: string; conversations: { id: string; project_id: string } | null };

export async function reconcileOrphanRuns(supabaseUrl: string, secretKey: string) {
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const orphans = await listOrphanRuns(admin);
    if (!orphans.length) return 0;

    const canvasByProject = await readCanvasWorkspaces(admin, orphans.map((run) => run.conversations?.project_id).filter((id): id is string => Boolean(id)));
    for (const run of orphans) {
        const conversation = run.conversations;
        const canvasWorkspaceId = conversation ? canvasByProject.get(conversation.project_id) : undefined;
        if (!conversation || !canvasWorkspaceId) {
            // 关联行已被级联删除，事件无处可挂；状态仍然要收尾，否则唯一索引继续占位。
            console.warn(`Reconcile: run ${run.id} 缺少 conversation 或 canvas workspace 关联，仅更新状态`);
            continue;
        }
        const { error } = await admin.from("agent_events").insert({
            run_id: run.id,
            project_id: conversation.project_id,
            canvas_workspace_id: canvasWorkspaceId,
            conversation_id: conversation.id,
            thread_id: conversation.id,
            turn_id: run.id,
            item_id: run.id,
            type: "run.failed",
            protocol_version: AGENT_PROTOCOL_VERSION,
            payload: { message: INTERRUPTED_MESSAGE },
        });
        if (error) throw new Error(`Reconcile: 补发 run.failed 事件失败（run ${run.id}）：${error.message}`);
    }

    const ids = orphans.map((run) => run.id);
    const { error } = await admin.from("agent_runs").update({ status: "failed", completed_at: new Date().toISOString() }).in("id", ids);
    if (error) throw new Error(`Reconcile: 更新 agent_runs 状态失败：${error.message}`);
    console.log(`Reconcile: 已收尾 ${ids.length} 个中断的 Agent run`);
    return ids.length;
}

async function listOrphanRuns(admin: SupabaseClient) {
    const { data, error } = await admin.from("agent_runs").select("id, conversations(id, project_id)").eq("status", "running");
    if (error) throw new Error(`Reconcile: 查询中断的 Agent run 失败：${error.message}`);
    return (data || []) as unknown as OrphanRun[];
}

async function readCanvasWorkspaces(admin: SupabaseClient, projectIds: string[]) {
    const map = new Map<string, string>();
    if (!projectIds.length) return map;
    const { data, error } = await admin.from("canvas_workspaces").select("id, project_id").in("project_id", [...new Set(projectIds)]);
    if (error) throw new Error(`Reconcile: 查询 Canvas Workspace 失败：${error.message}`);
    for (const row of (data || []) as Array<{ id: string; project_id: string }>) map.set(row.project_id, row.id);
    return map;
}
