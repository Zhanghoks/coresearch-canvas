import { create } from "zustand";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { usesLocalCanvasAgent, usesPlatformHostedAgent } from "@/stores/use-user-store";
import { hostedAgentConfigured } from "@/services/api/supabase";
import { readBrowserCanvasWorkspace, writeBrowserCanvasWorkspace } from "@/lib/canvas/canvas-browser-persistence";
import { canvasWorkspaceUserId } from "@/lib/canvas/workspace-user";
import { deleteWorkspaceProject, discoverLocalAgent, listWorkspaceProjects, readWorkspaceProject, readWorkspaceProjectLocation, revealWorkspaceProject, writeWorkspaceProject, type WorkspaceProjectRecord } from "@/services/api/canvas-agent";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    localOwnerUserId?: string;
    agentProjectId?: string;
    agentCanvasWorkspaceId?: string;
    agentOwnerUserId?: string;
    agentRevision?: number;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    canvasLoaded: boolean;
    nodeCount: number;
    connectionCount: number;
};

export type CanvasDeletedProject = {
    id: string;
    deletedAt: string;
    agentProjectId?: string;
    agentOwnerUserId?: string;
    localOwnerUserId?: string;
};

type CanvasStore = {
    hydrated: boolean;
    /** 已从浏览器存储读入的工作区属于哪个用户；未读入前禁止写回，防止用空列表覆盖已有数据。 */
    hydratedOwnerId: string | null;
    workspaceError: string;
    projects: CanvasProject[];
    deletedProjects: CanvasDeletedProject[];
    loadWorkspace: () => Promise<void>;
    loadProject: (id: string) => Promise<CanvasProject | null>;
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    locateProject: (id: string) => Promise<string>;
    revealProject: (id: string) => Promise<void>;
    bindAgentProject: (id: string, binding: { projectId: string; canvasWorkspaceId: string; ownerUserId: string }) => void;
    markAgentProjectDeleted: (id: string) => void;
    /** 托管端已不存在该项目时解除绑定，随后 useHostedAgentProject 会自动重新绑定。 */
    unbindAgentProject: (id: string) => void;
    /** 记录服务端确认的画布 revision（由服务端分配）。 */
    setAgentRevision: (id: string, revision: number) => void;
    replaceProjects: (projects: CanvasProject[], deletedProjects?: CanvasDeletedProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const saveInflight = new Map<string, Promise<void>>();
const removedProjectIds = new Set<string>();
let browserPersistTimer: ReturnType<typeof setTimeout> | null = null;

function canvasPatchChanged(project: CanvasProject, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) {
    return (Object.keys(patch) as Array<keyof typeof patch>).some((key) => !sameCanvasValue(project[key], patch[key]));
}

function sameCanvasValue(left: unknown, right: unknown) {
    if (Object.is(left, right)) return true;
    if (left == null || right == null || typeof left !== "object" || typeof right !== "object") return false;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function emptyProject(id: string, title: string, now: string): CanvasProject {
    return {
        id,
        localOwnerUserId: canvasWorkspaceUserId(),
        title,
        createdAt: now,
        updatedAt: now,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "dots",
        showImageInfo: false,
        viewport: initialViewport,
        canvasLoaded: true,
        nodeCount: 0,
        connectionCount: 0,
    };
}

export function workspaceCanvasProjects(projects: CanvasProject[]) {
    const ownerUserId = canvasWorkspaceUserId();
    return projects.filter((project) => project.localOwnerUserId === ownerUserId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function findWorkspaceCanvasProject(projects: CanvasProject[], id: string) {
    return workspaceCanvasProjects(projects).find((project) => project.id === id) || null;
}

function fromRecord(record: WorkspaceProjectRecord, existing?: CanvasProject): CanvasProject {
    const canvasLoaded = Array.isArray(record.nodes);
    const nodes = (canvasLoaded ? record.nodes : []) as CanvasNodeData[];
    const connections = (canvasLoaded ? record.connections || [] : []) as CanvasConnection[];
    const listed: CanvasProject = {
        id: record.id,
        localOwnerUserId: record.ownerUserId,
        agentCanvasWorkspaceId: record.canvasWorkspaceId,
        agentRevision: record.revision,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        nodes,
        connections,
        chatSessions: [],
        activeChatId: null,
        backgroundMode: (record.backgroundMode as CanvasBackgroundMode) || "dots",
        showImageInfo: Boolean(record.showImageInfo),
        viewport: record.viewport || initialViewport,
        canvasLoaded,
        nodeCount: canvasLoaded ? nodes.length : record.nodeCount ?? 0,
        connectionCount: canvasLoaded ? connections.length : record.connectionCount ?? 0,
    };
    if (!existing?.canvasLoaded || canvasLoaded) return listed;
    return {
        ...listed,
        nodes: existing.nodes,
        connections: existing.connections,
        chatSessions: existing.chatSessions,
        activeChatId: existing.activeChatId,
        backgroundMode: existing.backgroundMode,
        showImageInfo: existing.showImageInfo,
        viewport: existing.viewport,
        canvasLoaded: true,
        nodeCount: existing.nodes.length,
        connectionCount: existing.connections.length,
        agentProjectId: existing.agentProjectId,
        agentOwnerUserId: existing.agentOwnerUserId,
    };
}

function toRecord(project: CanvasProject): WorkspaceProjectRecord {
    return {
        schemaVersion: 2,
        id: project.id,
        ownerUserId: project.localOwnerUserId || canvasWorkspaceUserId(),
        title: project.title,
        canvasWorkspaceId: project.agentCanvasWorkspaceId || "",
        revision: project.agentRevision || 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        backgroundMode: project.backgroundMode,
        showImageInfo: project.showImageInfo,
        viewport: project.viewport,
        nodes: project.nodes,
        connections: project.connections,
    };
}

async function agentSession() {
    if (!usesLocalCanvasAgent()) throw new Error(i18n.t("canvas.project.browserOnlyWorkspace"));
    const discovered = await discoverLocalAgent();
    if (!discovered?.token) throw new Error(i18n.t("agent.runtime.agentNotFound"));
    return { endpoint: discovered.url || "/__agent", token: discovered.token, userId: canvasWorkspaceUserId() };
}

function scheduleBrowserWorkspacePersist() {
    if (!usesPlatformHostedAgent()) return;
    if (browserPersistTimer) clearTimeout(browserPersistTimer);
    browserPersistTimer = setTimeout(() => {
        browserPersistTimer = null;
        const ownerUserId = canvasWorkspaceUserId();
        const { projects, deletedProjects, hydratedOwnerId } = useCanvasStore.getState();
        // 这个用户的工作区还没读入时，内存里的列表不代表存储里的真实内容，写回会把已有项目覆盖掉。
        if (hydratedOwnerId !== ownerUserId) return;
        void writeBrowserCanvasWorkspace(ownerUserId, {
            projects: projects.filter((project) => project.localOwnerUserId === ownerUserId),
            deletedProjects: deletedProjects.filter((project) => project.localOwnerUserId === ownerUserId),
        }).catch((error) => {
            useCanvasStore.setState({ workspaceError: error instanceof Error ? error.message : String(error) });
        });
    }, 400);
}

function persistProject(project: CanvasProject) {
    if (removedProjectIds.has(project.id)) return;
    if (usesPlatformHostedAgent()) {
        scheduleBrowserWorkspacePersist();
        return;
    }
    const existing = saveTimers.get(project.id);
    if (existing) clearTimeout(existing);
    saveTimers.set(project.id, setTimeout(() => {
        saveTimers.delete(project.id);
        const task = agentSession().then(async ({ endpoint, token, userId }) => {
            if (removedProjectIds.has(project.id)) return;
            const latest = useCanvasStore.getState().projects.find((item) => item.id === project.id) || project;
            await writeWorkspaceProject(endpoint, token, userId, toRecord(latest));
            if (removedProjectIds.has(project.id)) await deleteWorkspaceProject(endpoint, token, userId, project.id);
        }).catch((error) => {
            useCanvasStore.setState({ workspaceError: error instanceof Error ? error.message : String(error) });
        }).finally(() => {
            if (saveInflight.get(project.id) === task) saveInflight.delete(project.id);
        });
        saveInflight.set(project.id, task);
    }, 400));
}

async function flushProject(id: string) {
    if (usesPlatformHostedAgent()) {
        if (browserPersistTimer) {
            clearTimeout(browserPersistTimer);
            browserPersistTimer = null;
        }
        scheduleBrowserWorkspacePersist();
        return;
    }
    const pending = saveTimers.get(id);
    if (pending) {
        clearTimeout(pending);
        saveTimers.delete(id);
    }
    const inflight = saveInflight.get(id);
    if (inflight) await inflight;
    if (!pending || removedProjectIds.has(id)) return;
    const project = useCanvasStore.getState().projects.find((item) => item.id === id);
    if (!project) return;
    const { endpoint, token, userId } = await agentSession();
    await writeWorkspaceProject(endpoint, token, userId, toRecord(project));
}

// loadWorkspace 可能在登录态变化时被连续调用；只采纳最后一次调用的结果，旧调用晚到的结果（成功或失败）直接丢弃。
let workspaceGeneration = 0;

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
    hydrated: false,
    hydratedOwnerId: null,
    workspaceError: "",
    projects: [],
    deletedProjects: [],
    loadWorkspace: async () => {
        const generation = ++workspaceGeneration;
        const current = () => generation === workspaceGeneration;
        if (hostedAgentConfigured && !usesPlatformHostedAgent()) {
            // 托管部署下还没有登录用户（或刚退出）：界面显示登录门禁，不去连本机 Canvas Agent。
            set({ hydrated: false, hydratedOwnerId: null, projects: [], deletedProjects: [], workspaceError: "" });
            return;
        }
        if (usesPlatformHostedAgent()) {
            const ownerUserId = canvasWorkspaceUserId();
            try {
                const snapshot = await readBrowserCanvasWorkspace(ownerUserId);
                if (!current()) return;
                set((state) => ({
                    hydrated: true,
                    hydratedOwnerId: ownerUserId,
                    workspaceError: "",
                    projects: snapshot.projects.map((project) => {
                        const existing = state.projects.find((item) => item.id === project.id);
                        return existing?.canvasLoaded && !project.canvasLoaded ? { ...project, nodes: existing.nodes, connections: existing.connections, canvasLoaded: true, nodeCount: existing.nodeCount, connectionCount: existing.connectionCount } : project;
                    }),
                    deletedProjects: snapshot.deletedProjects,
                }));
            } catch (error) {
                // 读失败时不清空列表、也不标记已读入，避免之后的写回用空列表覆盖存储。
                if (current()) set({ hydrated: true, workspaceError: error instanceof Error ? error.message : String(error) });
            }
            return;
        }
        try {
            const { endpoint, token, userId } = await agentSession();
            const result = await listWorkspaceProjects(endpoint, token, userId);
            if (!current()) return;
            set((state) => ({
                hydrated: true,
                workspaceError: "",
                projects: (result.data || []).map((item) => fromRecord(item, state.projects.find((project) => project.id === item.id))),
            }));
        } catch (error) {
            if (current()) set({ hydrated: true, workspaceError: error instanceof Error ? error.message : String(error) });
        }
    },
    loadProject: async (id) => {
        if (usesPlatformHostedAgent()) return get().projects.find((item) => item.id === id) || null;
        try {
            const { endpoint, token, userId } = await agentSession();
            const result = await readWorkspaceProject(endpoint, token, userId, id);
            const project = fromRecord(result.data);
            set((state) => ({
                workspaceError: "",
                projects: state.projects.some((item) => item.id === id) ? state.projects.map((item) => (item.id === id ? project : item)) : [project, ...state.projects],
            }));
            return project;
        } catch {
            return get().projects.find((item) => item.id === id) || null;
        }
    },
    createProject: (title = i18n.t("canvas.project.untitled")) => {
        const now = new Date().toISOString();
        const id = nanoid();
        const project = emptyProject(id, title, now);
        set((state) => ({ projects: [project, ...state.projects] }));
        persistProject(project);
        return id;
    },
    importProject: (source) => {
        const now = new Date().toISOString();
        const project: CanvasProject = {
            ...emptyProject(nanoid(), source.title || i18n.t("canvas.project.imported"), now),
            createdAt: source.createdAt || now,
            nodes: source.nodes || [],
            connections: source.connections || [],
            nodeCount: source.nodes?.length ?? 0,
            connectionCount: source.connections?.length ?? 0,
            backgroundMode: source.backgroundMode || "dots",
            showImageInfo: source.showImageInfo || false,
            viewport: source.viewport || initialViewport,
        };
        set((state) => ({ projects: [project, ...state.projects] }));
        persistProject(project);
        return project.id;
    },
    openProject: (id) => findWorkspaceCanvasProject(get().projects, id),
    renameProject: (id, title) =>
        set((state) => {
            const projects = state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project));
            const next = projects.find((project) => project.id === id);
            if (next) persistProject(next);
            return { projects };
        }),
    deleteProjects: (ids) =>
        set((state) => {
            const now = new Date().toISOString();
            const removing = new Set(ids);
            const removedProjects = state.projects.filter((project) => removing.has(project.id));
            ids.forEach((id) => {
                removedProjectIds.add(id);
                const timer = saveTimers.get(id);
                if (timer) {
                    clearTimeout(timer);
                    saveTimers.delete(id);
                }
            });
            const projects = state.projects.filter((project) => !removing.has(project.id));
            const deletedProjects = [...state.deletedProjects.filter((item) => !removing.has(item.id)), ...ids.map((id) => {
                const project = removedProjects.find((item) => item.id === id);
                return { id, deletedAt: now, agentProjectId: project?.agentProjectId, agentOwnerUserId: project?.agentOwnerUserId, localOwnerUserId: project?.localOwnerUserId };
            })];
            const pendingWrites = ids.flatMap((id) => {
                const write = saveInflight.get(id);
                return write ? [write] : [];
            });
            if (usesPlatformHostedAgent()) {
                scheduleBrowserWorkspacePersist();
                return { projects, deletedProjects };
            }
            void Promise.all(pendingWrites).then(() => agentSession()).then(({ endpoint, token, userId }) => Promise.all(ids.map((id) => deleteWorkspaceProject(endpoint, token, userId, id)))).catch((error) => {
                ids.forEach((id) => removedProjectIds.delete(id));
                useCanvasStore.setState((current) => ({
                    workspaceError: error instanceof Error ? error.message : String(error),
                    projects: [...removedProjects.filter((project) => !current.projects.some((item) => item.id === project.id)), ...current.projects],
                    deletedProjects: current.deletedProjects.filter((item) => !removing.has(item.id)),
                }));
            });
            return { projects, deletedProjects };
        }),
    locateProject: async (id) => {
        if (usesPlatformHostedAgent()) throw new Error(i18n.t("canvas.project.browserOnlyWorkspace"));
        await flushProject(id);
        const { endpoint, token, userId } = await agentSession();
        return (await readWorkspaceProjectLocation(endpoint, token, userId, id)).path;
    },
    revealProject: async (id) => {
        if (usesPlatformHostedAgent()) throw new Error(i18n.t("canvas.project.browserOnlyWorkspace"));
        await flushProject(id);
        const { endpoint, token, userId } = await agentSession();
        await revealWorkspaceProject(endpoint, token, userId, id);
    },
    bindAgentProject: (id, binding) => {
        // 新绑定的托管项目 revision 从 0 开始；立即持久化，否则刷新后绑定丢失会再建一个托管项目。
        set((state) => ({
            projects: state.projects.map((project) => project.id === id ? { ...project, agentProjectId: binding.projectId, agentCanvasWorkspaceId: binding.canvasWorkspaceId, agentOwnerUserId: binding.ownerUserId, agentRevision: 0 } : project),
        }));
        const project = get().projects.find((item) => item.id === id);
        if (project) persistProject(project);
    },
    markAgentProjectDeleted: (id) => set((state) => ({ deletedProjects: state.deletedProjects.map((item) => item.id === id ? { ...item, agentProjectId: undefined } : item) })),
    unbindAgentProject: (id) => {
        set((state) => ({
            projects: state.projects.map((project) => project.id === id ? { ...project, agentProjectId: undefined, agentCanvasWorkspaceId: undefined, agentOwnerUserId: undefined, agentRevision: 0 } : project),
        }));
        const project = get().projects.find((item) => item.id === id);
        if (project) persistProject(project);
    },
    setAgentRevision: (id, revision) => {
        set((state) => ({ projects: state.projects.map((project) => project.id === id ? { ...project, agentRevision: revision } : project) }));
        const project = get().projects.find((item) => item.id === id);
        if (project) persistProject(project);
    },
    replaceProjects: (projects, deletedProjects = []) => set({ projects, deletedProjects }),
    updateProject: (id, patch) =>
        set((state) => {
            let changed = false;
            const projects = state.projects.map((project) => {
                if (project.id !== id || !canvasPatchChanged(project, patch)) return project;
                changed = true;
                // agentRevision 只记录服务端确认的版本，本地编辑不再自增（由 HostedCanvasSync 发布后回写）。
                const next = { ...project, ...patch, canvasLoaded: true, updatedAt: new Date().toISOString() };
                next.nodeCount = next.nodes.length;
                next.connectionCount = next.connections.length;
                return next;
            });
            if (!changed) return state;
            const next = projects.find((project) => project.id === id);
            if (next) persistProject(next);
            return { projects };
        }),
}));
