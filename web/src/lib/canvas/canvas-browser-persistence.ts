import localforage from "localforage";

import type { CanvasDeletedProject, CanvasProject } from "@/stores/canvas/use-canvas-store";

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "canvas_workspace_v1" });

type CanvasWorkspaceSnapshot = {
    projects: CanvasProject[];
    deletedProjects: CanvasDeletedProject[];
};

function storageKey(ownerUserId: string) {
    return `owner:${ownerUserId}`;
}

export async function readBrowserCanvasWorkspace(ownerUserId: string): Promise<CanvasWorkspaceSnapshot> {
    const saved = await store.getItem<CanvasWorkspaceSnapshot>(storageKey(ownerUserId));
    return saved || { projects: [], deletedProjects: [] };
}

export async function writeBrowserCanvasWorkspace(ownerUserId: string, snapshot: CanvasWorkspaceSnapshot) {
    await store.setItem(storageKey(ownerUserId), snapshot);
}
