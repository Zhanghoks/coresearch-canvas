import type { NavigateFunction } from "react-router-dom";

import i18n from "@/i18n";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export const SITE_TOOL_NAMES = ["canvas_list_projects"] as const;

export type SiteToolName = (typeof SITE_TOOL_NAMES)[number];

export function isSiteTool(name: string): name is SiteToolName {
    return (SITE_TOOL_NAMES as readonly string[]).includes(name);
}

function siteText(key: string, options?: Record<string, unknown>) {
    return i18n.t(`agent.siteTools.${key}`, options);
}

export const SITE_TOOL_LABELS: Record<SiteToolName, string> = {
    get canvas_list_projects() {
        return siteText("canvasList");
    },
};

type SiteToolInput = Record<string, unknown>;

export async function runSiteTool(name: SiteToolName, input: SiteToolInput, _navigate: NavigateFunction): Promise<unknown> {
    switch (name) {
        case "canvas_list_projects":
            return listCanvasProjects(input);
        default:
            throw new Error(siteText("unknownTool", { name }));
    }
}

function listCanvasProjects(input: SiteToolInput) {
    const { projects, hydrated } = useCanvasStore.getState();
    if (!hydrated) throw new Error(siteText("canvasLoading"));
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = keyword ? projects.filter((project) => project.title.toLowerCase().includes(keyword)) : projects;
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    const items = filtered.slice(start, end).map((project) => ({
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        nodeCount: project.nodes.length,
        connectionCount: project.connections.length,
    }));
    return { total: filtered.length, page, pageSize, items, hint: siteText("canvasHint") };
}

function paginate(input: SiteToolInput, total: number, defaultSize: number) {
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize)) || defaultSize));
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(maxPage, Math.max(1, Math.floor(Number(input.page)) || 1));
    const start = (page - 1) * pageSize;
    return { page, pageSize, start, end: start + pageSize };
}
