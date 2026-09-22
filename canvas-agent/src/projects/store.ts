import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { defaultDataRoot, projectDir, projectKey, sanitizeUserId, userDir } from "../workspace-paths.js";

export type StoredCanvasProject = {
    schemaVersion: 2;
    id: string;
    ownerUserId: string;
    title: string;
    canvasWorkspaceId: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    backgroundMode: string;
    showImageInfo: boolean;
    viewport: { x: number; y: number; k: number };
    nodes: unknown[];
    connections: unknown[];
};

export type StoredProjectSummary = Pick<StoredCanvasProject, "id" | "ownerUserId" | "title" | "canvasWorkspaceId" | "revision" | "createdAt" | "updatedAt"> & {
    nodeCount: number;
    connectionCount: number;
};

const PROJECT_DIRS = ["documents", "artifacts", "assets", "skills", "conversations"];

export class ProjectFileStore {
    constructor(private readonly dataRoot = defaultDataRoot()) {}

    async list(userId: string): Promise<StoredProjectSummary[]> {
        const root = path.join(userDir(this.dataRoot, userId), "projects");
        let names: string[];
        try {
            names = await fs.readdir(root);
        } catch (error) {
            if (isMissing(error)) return [];
            throw error;
        }
        const projects = await Promise.all(names.map(async (name) => {
            try {
                return await this.readIdentity(path.join(root, name));
            } catch {
                return null;
            }
        }));
        return projects.filter((project): project is StoredCanvasProject => Boolean(project) && project.ownerUserId === sanitizeUserId(userId)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(summaryOf);
    }

    async get(userId: string, projectId: string): Promise<StoredCanvasProject> {
        const owner = sanitizeUserId(userId);
        try {
            const record = await this.readRecord(this.dir(owner, projectId));
            if (record.ownerUserId !== owner || record.id !== projectId) throw new Error("找不到项目");
            return record;
        } catch (error) {
            if (isMissing(error)) throw new Error("找不到项目");
            throw error;
        }
    }

    async put(userId: string, project: Partial<StoredCanvasProject> & { id: string; title: string }): Promise<StoredCanvasProject> {
        const owner = sanitizeUserId(userId);
        if (project.ownerUserId && project.ownerUserId !== owner) throw new Error("不能写入其他用户的项目");
        const dir = this.dir(owner, project.id);
        await fs.mkdir(dir, { recursive: true });
        await Promise.all(PROJECT_DIRS.map((name) => fs.mkdir(path.join(dir, name), { recursive: true })));
        let previous: StoredCanvasProject | null = null;
        try {
            previous = await this.readRecord(dir);
        } catch (error) {
            if (!isMissing(error)) throw error;
        }
        if (previous && previous.ownerUserId !== owner) throw new Error("Project 工作空间身份冲突");
        const now = new Date().toISOString();
        const record: StoredCanvasProject = {
            schemaVersion: 2,
            id: project.id,
            ownerUserId: owner,
            title: project.title.trim() || previous?.title || "未命名研究",
            canvasWorkspaceId: previous?.canvasWorkspaceId || project.canvasWorkspaceId || crypto.randomUUID(),
            revision: Math.max(previous?.revision || 0, Number(project.revision) || 0) + (previous ? 1 : 0),
            createdAt: previous?.createdAt || project.createdAt || now,
            updatedAt: now,
            backgroundMode: project.backgroundMode || previous?.backgroundMode || "dots",
            showImageInfo: Boolean(project.showImageInfo ?? previous?.showImageInfo),
            viewport: project.viewport || previous?.viewport || { x: 0, y: 0, k: 1 },
            nodes: Array.isArray(project.nodes) ? project.nodes : previous?.nodes || [],
            connections: Array.isArray(project.connections) ? project.connections : previous?.connections || [],
        };
        const canvasFile = path.join(dir, "canvas.json");
        const identityFile = path.join(dir, "project.json");
        const temporary = `${identityFile}.${process.pid}.tmp`;
        await fs.writeFile(canvasFile, `${JSON.stringify({ viewport: record.viewport, nodes: record.nodes, connections: record.connections }, null, 2)}\n`);
        await fs.writeFile(temporary, `${JSON.stringify(identityOf(record), null, 2)}\n`);
        await fs.rename(temporary, identityFile);
        return record;
    }

    async delete(userId: string, projectId: string) {
        try {
            await this.get(userId, projectId);
        } catch (error) {
            if (error instanceof Error && error.message === "找不到项目") return;
            throw error;
        }
        await fs.rm(this.dir(userId, projectId), { recursive: true, force: true });
    }

    dir(userId: string, projectId: string) {
        return projectDir(this.dataRoot, userId, projectId);
    }

    private async readIdentity(dir: string) {
        return this.readRecord(dir);
    }

    private async readRecord(dir: string): Promise<StoredCanvasProject> {
        const identity = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8")) as Partial<StoredCanvasProject>;
        if (!identity.id || !identity.ownerUserId) throw new Error("找不到项目");
        let canvas: Partial<StoredCanvasProject> = {};
        try {
            canvas = JSON.parse(await fs.readFile(path.join(dir, "canvas.json"), "utf8")) as Partial<StoredCanvasProject>;
        } catch (error) {
            if (!isMissing(error)) throw error;
        }
        return {
            schemaVersion: 2,
            id: identity.id,
            ownerUserId: identity.ownerUserId,
            title: identity.title || "未命名研究",
            canvasWorkspaceId: identity.canvasWorkspaceId || "",
            revision: Number(identity.revision) || 0,
            createdAt: identity.createdAt || "",
            updatedAt: identity.updatedAt || "",
            backgroundMode: identity.backgroundMode || "dots",
            showImageInfo: Boolean(identity.showImageInfo),
            viewport: canvas.viewport || identity.viewport || { x: 0, y: 0, k: 1 },
            nodes: Array.isArray(canvas.nodes) ? canvas.nodes : identity.nodes || [],
            connections: Array.isArray(canvas.connections) ? canvas.connections : identity.connections || [],
        };
    }
}

function identityOf(record: StoredCanvasProject) {
    return {
        schemaVersion: record.schemaVersion,
        id: record.id,
        ownerUserId: record.ownerUserId,
        title: record.title,
        canvasWorkspaceId: record.canvasWorkspaceId,
        revision: record.revision,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        backgroundMode: record.backgroundMode,
        showImageInfo: record.showImageInfo,
    };
}

function summaryOf(record: StoredCanvasProject): StoredProjectSummary {
    return {
        id: record.id,
        ownerUserId: record.ownerUserId,
        title: record.title,
        canvasWorkspaceId: record.canvasWorkspaceId,
        revision: record.revision,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        nodeCount: record.nodes.length,
        connectionCount: record.connections.length,
    };
}

function isMissing(error: unknown) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export { projectKey };
