import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useMatch } from "react-router-dom";

import { HostedCanvasSync, type CommitResult } from "@/lib/canvas/hosted-canvas-sync";
import { canvasConflictRevision, hostedAgentApi, isHostedApiError } from "@/services/api/hosted-agent";
import { hostedAgentConfigured } from "@/services/api/supabase";
import { useAgentStore } from "@/stores/use-agent-store";
import { findWorkspaceCanvasProject, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

const bindingRequests = new Set<string>();

export function useHostedAgentProject() {
    const { message } = App.useApp();
    // AgentPanel 挂在 UserLayout（无路径父路由）里，useParams 取不到子路由的 :id，必须直接匹配 location
    const id = useMatch("/canvas/:id")?.params.id || "";
    const [bindingAttempt, setBindingAttempt] = useState(0);
    const [binding, setBinding] = useState(false);
    const [sync, setSync] = useState<HostedCanvasSync | null>(null);
    const user = useUserStore((state) => state.user);
    const accessToken = useUserStore((state) => state.accessToken);
    const project = useCanvasStore((state) => findWorkspaceCanvasProject(state.projects, id));
    const bindAgentProject = useCanvasStore((state) => state.bindAgentProject);
    const unbindAgentProject = useCanvasStore((state) => state.unbindAgentProject);
    const setAgentRevision = useCanvasStore((state) => state.setAgentRevision);
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const bound = Boolean(user && project?.agentOwnerUserId === user.id && project.agentProjectId && project.agentCanvasWorkspaceId);
    const canvasProjectId = project?.id || "";
    const hostedProjectId = bound ? project!.agentProjectId! : "";
    const accessTokenRef = useRef(accessToken);
    accessTokenRef.current = accessToken;

    // 托管端找不到这个项目（被删除或迁移）：解除绑定，下面的绑定 effect 会新建托管项目并把本地画布发布上去。
    const recoverMissingProject = useCallback((error: unknown) => {
        if (!isHostedApiError(error, "project_not_found") || !canvasProjectId) return false;
        unbindAgentProject(canvasProjectId);
        message.warning("托管端的项目已不存在，正在按本地画布重新创建");
        return true;
    }, [canvasProjectId, message, unbindAgentProject]);

    useEffect(() => {
        if (!hostedAgentConfigured || !user || !accessToken || !project || bound) return;
        const key = `${user.id}:${project.id}`;
        if (bindingRequests.has(key)) return;
        bindingRequests.add(key);
        setBinding(true);
        void hostedAgentApi.createProject(accessToken, project.title).then((created) => {
            bindAgentProject(project.id, { projectId: created.id, canvasWorkspaceId: created.canvasWorkspaceId, ownerUserId: user.id });
        }).catch((error) => {
            message.error(error instanceof Error ? error.message : "创建托管项目失败");
        }).finally(() => {
            bindingRequests.delete(key);
            setBinding(false);
        });
    }, [accessToken, bindAgentProject, bindingAttempt, bound, message, project, user]);

    const snapshot = useMemo(() => {
        if (!canvasContext || canvasContext.snapshot.projectId !== project?.id) return null;
        return sanitizeHostedSnapshot(canvasContext.snapshot);
    }, [canvasContext, project?.id]);

    // 绑定后先从服务端拉一次：服务端比本地新（另一台设备）就用服务端的；然后建立发布队列。
    useEffect(() => {
        if (!hostedProjectId || !accessTokenRef.current) {
            setSync(null);
            return;
        }
        let cancelled = false;
        let created: HostedCanvasSync | null = null;
        void hostedAgentApi.readCanvas(accessTokenRef.current, hostedProjectId).then((canvas) => {
            if (cancelled) return;
            const current = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
            const serverNodes = Array.isArray(canvas.snapshot?.nodes) ? canvas.snapshot.nodes as CanvasNodeData[] : null;
            const localRevision = current?.agentRevision || 0;
            const adoptServer = Boolean(current && serverNodes && (canvas.revision > localRevision || (canvas.revision === localRevision && current.nodes.length === 0)));
            if (adoptServer) {
                useCanvasStore.setState((state) => ({
                    projects: state.projects.map((item) => item.id === canvasProjectId ? {
                        ...item,
                        nodes: serverNodes!,
                        connections: Array.isArray(canvas.snapshot?.connections) ? canvas.snapshot.connections as CanvasConnection[] : [],
                        updatedAt: new Date().toISOString(),
                    } : item),
                }));
            }
            setAgentRevision(canvasProjectId, canvas.revision);
            created = new HostedCanvasSync({
                baseRevision: canvas.revision,
                publish: (baseRevision, value) => hostedAgentApi.publishCanvas(accessTokenRef.current!, hostedProjectId, hostedBrowserClientId(), baseRevision, value),
                conflictRevision: canvasConflictRevision,
                onCommitted: (revision) => setAgentRevision(canvasProjectId, revision),
                onError: (error) => {
                    if (!recoverMissingProject(error)) message.error(error instanceof Error ? error.message : "同步画布失败");
                },
            });
            // 服务端已有的内容不必再发一遍；本地内容若不同，下面的发布 effect 会照常发布。
            if (canvas.snapshot) created.markInSync(canvasContentKey(canvas.snapshot));
            setSync(created);
        }).catch((error) => {
            if (cancelled || recoverMissingProject(error)) return;
            message.error(error instanceof Error ? error.message : "读取托管画布失败");
        });
        return () => {
            cancelled = true;
            created?.dispose();
        };
    }, [canvasProjectId, hostedProjectId, message, recoverMissingProject, setAgentRevision]);

    // 只有节点和连线变化才发布；选区、视口变化不产生新 revision。
    useEffect(() => {
        if (!sync || !snapshot) return;
        const current = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
        // 本地已有内容而快照还是空的：画布组件尚未挂载完成，不能用空快照覆盖服务端。
        if (current && current.nodes.length > 0 && snapshot.nodes.length === 0) return;
        sync.schedule(snapshot, canvasContentKey(snapshot));
    }, [canvasProjectId, snapshot, sync]);

    /** Agent 工具结果带快照提交时走同一条队列，保证 baseRevision 连续、不会与普通发布撞车。 */
    const commitCanvas = useCallback(<T extends CommitResult>(value: Record<string, unknown>, submit: (baseRevision: number) => Promise<T>) => {
        if (!sync) return Promise.reject(new Error("画布尚未与托管端同步"));
        return sync.commitWith(canvasContentKey(value), submit);
    }, [sync]);

    return {
        enabled: hostedAgentConfigured && bound,
        token: accessToken,
        project,
        canvasContext,
        binding,
        commitCanvas,
        recoverMissingProject,
        retryBinding: () => {
            if (user && project) bindingRequests.delete(`${user.id}:${project.id}`);
            setBindingAttempt((value) => value + 1);
        },
    };
}

// 服务端 jsonb 会重排对象键顺序，内容指纹必须与键顺序无关，否则刚拉下来的同一份内容也会被当成变更再发一次。
function canvasContentKey(value: Record<string, unknown> | null | undefined) {
    return stableStringify({ nodes: value?.nodes ?? [], connections: value?.connections ?? [] });
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

export function hostedBrowserClientId() {
    const key = "research-canvas:agent-client-id";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
    return value;
}

export function sanitizeHostedSnapshot<T extends { nodes: Array<{ metadata?: { content?: string } }> }>(snapshot: T) {
    return {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => ({
            ...node,
            metadata: node.metadata?.content?.startsWith("data:") ? { ...node.metadata, content: undefined, hasLocalContent: true } : node.metadata,
        })),
    };
}
