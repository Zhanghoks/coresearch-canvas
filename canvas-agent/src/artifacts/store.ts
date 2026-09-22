import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { defaultDataRoot, projectDir as resolveProjectDir } from "../workspace-paths.js";

export const researchArtifactKinds = [
    "seed-brief",
    "direction-map",
    "rq-comparison",
    "problem-evidence",
    "hypothesis-test-plan",
    "approach-tradeoff",
    "method-protocol",
    "evaluation-matrix",
    "idea-review",
    "paper-plan",
    "paper-draft",
    "paper-audit",
    "export",
] as const;

export type ResearchArtifactKind = (typeof researchArtifactKinds)[number];
export type ResearchArtifactScope = {
    userId: string;
    projectId: string;
    conversationId: string;
    turnId: string;
};
export type ResearchArtifactInput = {
    kind: ResearchArtifactKind;
    title: string;
    content: string;
    sourceNodeIds: string[];
};
export type ResearchArtifactRecord = {
    schemaVersion: 1;
    id: string;
    projectId: string;
    kind: ResearchArtifactKind;
    title: string;
    mediaType: "text/markdown";
    sourceNodeIds: string[];
    contentHash: string;
    createdAt: string;
    actor: "agent";
    conversationId: string;
    turnId: string;
};

/** 在用户 Project 目录中按 Project 隔离、不可变地保存研究产物。 */
export class ResearchArtifactStore {
    constructor(private readonly dataRoot = defaultDataRoot()) {}

    async write(scope: ResearchArtifactScope, input: ResearchArtifactInput): Promise<ResearchArtifactRecord> {
        requireText(scope.userId, "userId");
        requireText(scope.projectId, "projectId");
        requireText(scope.conversationId, "conversationId");
        requireText(scope.turnId, "turnId");
        requireText(input.title, "title");
        requireText(input.content, "content");

        const ownedDir = this.ownedDir(scope.userId, scope.projectId);
        const artifactsDir = path.join(ownedDir, "artifacts");
        const id = `artifact-${crypto.randomUUID()}`;
        const artifactDir = path.join(artifactsDir, id);
        const temporaryDir = path.join(artifactsDir, `.${id}.tmp`);
        const record: ResearchArtifactRecord = {
            schemaVersion: 1,
            id,
            projectId: scope.projectId,
            kind: input.kind,
            title: input.title.trim(),
            mediaType: "text/markdown",
            sourceNodeIds: [...input.sourceNodeIds],
            contentHash: crypto.createHash("sha256").update(input.content).digest("hex"),
            createdAt: new Date().toISOString(),
            actor: "agent",
            conversationId: scope.conversationId,
            turnId: scope.turnId,
        };

        await fs.mkdir(artifactsDir, { recursive: true });
        await writeProjectIdentity(ownedDir, scope.userId, scope.projectId);
        await fs.mkdir(temporaryDir);
        try {
            await Promise.all([
                fs.writeFile(path.join(temporaryDir, "metadata.json"), `${JSON.stringify(record, null, 2)}\n`),
                fs.writeFile(path.join(temporaryDir, "content.md"), input.content),
            ]);
            await fs.rename(temporaryDir, artifactDir);
        } catch (error) {
            await fs.rm(temporaryDir, { recursive: true, force: true });
            throw error;
        }
        return record;
    }

    async list(userId: string, projectId: string): Promise<ResearchArtifactRecord[]> {
        requireText(userId, "userId");
        requireText(projectId, "projectId");
        const artifactsDir = path.join(this.ownedDir(userId, projectId), "artifacts");
        let entries: string[];
        try {
            entries = await fs.readdir(artifactsDir);
        } catch (error) {
            if (isMissing(error)) return [];
            throw error;
        }
        const records = await Promise.all(
            entries.filter(isArtifactId).map(async (id) => this.readMetadata(userId, projectId, id)),
        );
        return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }

    async read(userId: string, projectId: string, artifactId: string): Promise<ResearchArtifactRecord & { content: string }> {
        requireText(userId, "userId");
        requireText(projectId, "projectId");
        if (!isArtifactId(artifactId)) throw new Error(`找不到 Artifact：${artifactId}`);
        try {
            const record = await this.readMetadata(userId, projectId, artifactId);
            const content = await fs.readFile(path.join(this.ownedDir(userId, projectId), "artifacts", artifactId, "content.md"), "utf8");
            if (record.contentHash !== crypto.createHash("sha256").update(content).digest("hex")) throw new Error(`Artifact 内容校验失败：${artifactId}`);
            return { ...record, content };
        } catch (error) {
            if (isMissing(error)) throw new Error(`找不到 Artifact：${artifactId}`);
            throw error;
        }
    }

    private ownedDir(userId: string, projectId: string) {
        return resolveProjectDir(this.dataRoot, userId, projectId);
    }

    private async readMetadata(userId: string, projectId: string, artifactId: string) {
        const file = path.join(this.ownedDir(userId, projectId), "artifacts", artifactId, "metadata.json");
        const record = JSON.parse(await fs.readFile(file, "utf8")) as ResearchArtifactRecord;
        if (record.projectId !== projectId || record.id !== artifactId) throw new Error(`找不到 Artifact：${artifactId}`);
        return record;
    }
}

async function writeProjectIdentity(dir: string, userId: string, projectId: string) {
    const file = path.join(dir, "project.json");
    try {
        const current = JSON.parse(await fs.readFile(file, "utf8")) as { id?: string; projectId?: string; ownerUserId?: string };
        const currentId = current.id || current.projectId;
        if (currentId !== projectId || (current.ownerUserId && current.ownerUserId !== userId)) throw new Error("Project 工作空间身份冲突");
    } catch (error) {
        if (!isMissing(error)) throw error;
        await fs.writeFile(file, `${JSON.stringify({ schemaVersion: 2, id: projectId, ownerUserId: userId }, null, 2)}\n`, { flag: "wx" }).catch(async (writeError) => {
            if (!isExists(writeError)) throw writeError;
            const current = JSON.parse(await fs.readFile(file, "utf8")) as { id?: string; projectId?: string; ownerUserId?: string };
            const currentId = current.id || current.projectId;
            if (currentId !== projectId || (current.ownerUserId && current.ownerUserId !== userId)) throw new Error("Project 工作空间身份冲突");
        });
    }
}

function requireText(value: string, field: string) {
    if (!value.trim()) throw new Error(`${field} 不能为空`);
}

function isArtifactId(value: string) {
    return /^artifact-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function isMissing(error: unknown) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExists(error: unknown) {
    return error instanceof Error && "code" in error && error.code === "EEXIST";
}
