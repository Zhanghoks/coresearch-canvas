import i18n from "@/i18n";
import { getMediaBlob, setMediaBlob } from "@/services/file-storage";
import { getImageBlob, setImageBlob } from "@/services/image-storage";
import { downloadWebdavFile, uploadWebdavFile, WEBDAV_MANIFEST_FILE_NAME } from "@/services/webdav-sync";
import type { WebdavSyncConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasDeletedProject, CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

type AppSyncFile = {
    storageKey: string;
    path: string;
    mimeType: string;
    bytes: number;
};

type CanvasDomainData = { projects: CanvasProject[]; deleted: CanvasDeletedProject[] };

type DomainManifest<T> = {
    app: "infinite-canvas";
    version: 1;
    domain: "canvas";
    exportedAt: string;
    data: T;
    files: AppSyncFile[];
};

type SyncDomainOptions<T> = {
    key: "canvas";
    label: string;
    localData: () => Promise<T>;
    emptyData: T;
    mergeData: (local: T, remote: T) => T;
    applyData?: (data: T) => Promise<void>;
};

type SyncDomainResult<T> = {
    data: T;
    mergedRemote: boolean;
    files: number;
    manifestBytes: number;
    uploadedFiles: number;
    uploadedBytes: number;
};

export type AppSyncDomainKey = "canvas";

export type AppSyncResult = {
    syncedAt: string;
    mergedRemote: boolean;
    projects: number;
    files: number;
    manifestBytes: number;
    uploadedFiles: number;
    uploadedBytes: number;
};

export type AppSyncProgressEvent = {
    domain?: AppSyncDomainKey;
    label?: string;
    stage: string;
    current?: number;
    total?: number;
    status?: "active" | "success" | "exception";
};

export type AppSyncProgress = (event: AppSyncProgressEvent) => void;

const FILE_CONCURRENCY = 3;
const storageKeyPattern = /^(image|video|audio|file|video-reference|audio-reference):/;

export async function syncAppDataToWebdav(config: WebdavSyncConfig, onProgress?: AppSyncProgress): Promise<AppSyncResult> {
    emitProgress(onProgress, { stage: "等待本地数据加载" });
    await waitForHydration(useCanvasStore);
    const ownerUserId = useUserStore.getState().user?.id;
    const syncScope = safeFileName(ownerUserId || "anonymous");

    const canvas = await syncDomain<CanvasDomainData>(config, syncScope, onProgress, {
        key: "canvas",
        label: "画布",
        emptyData: { projects: [], deleted: [] },
        localData: async () => {
            const { projects, deletedProjects } = useCanvasStore.getState();
            return {
                projects: projects.filter((project) => project.localOwnerUserId === ownerUserId),
                deleted: deletedProjects.filter((project) => project.localOwnerUserId === ownerUserId),
            };
        },
        mergeData: (local, remote) =>
            mergeCanvasData(local, {
                projects: (remote.projects || []).filter((project) => project.localOwnerUserId === ownerUserId),
                deleted: (remote.deleted || []).filter((project) => project.localOwnerUserId === ownerUserId),
            }),
        applyData: async (data) => {
            const { projects, deletedProjects } = useCanvasStore.getState();
            useCanvasStore.getState().replaceProjects(
                [...projects.filter((project) => project.localOwnerUserId !== ownerUserId), ...data.projects],
                [...deletedProjects.filter((project) => project.localOwnerUserId !== ownerUserId), ...data.deleted],
            );
        },
    });

    const result = {
        syncedAt: new Date().toISOString(),
        mergedRemote: canvas.mergedRemote,
        projects: canvas.data.projects.length,
        files: canvas.files,
        manifestBytes: canvas.manifestBytes,
        uploadedFiles: canvas.uploadedFiles,
        uploadedBytes: canvas.uploadedBytes,
    };
    emitProgress(onProgress, { stage: "同步完成", status: "success" });
    return result;
}

async function syncDomain<T>(config: WebdavSyncConfig, syncScope: string, onProgress: AppSyncProgress | undefined, options: SyncDomainOptions<T>): Promise<SyncDomainResult<T>> {
    try {
        emitProgress(onProgress, { domain: options.key, label: options.label, stage: "读取远端清单", status: "active" });
        const remoteManifest = await readDomainManifest(config, syncScope, options.emptyData);
        emitProgress(onProgress, { domain: options.key, label: options.label, stage: "读取本地数据", status: "active" });
        const localData = await options.localData();
        const mergedData = remoteManifest ? options.mergeData(localData, remoteManifest.data) : localData;

        if (remoteManifest) {
            emitProgress(onProgress, { domain: options.key, label: options.label, stage: "下载缺失媒体", status: "active" });
            await downloadMissingFiles(config, mergedData, remoteManifest.files, onProgress);
            emitProgress(onProgress, { domain: options.key, label: options.label, stage: "写入本地合并结果", status: "active" });
            await options.applyData?.(mergedData);
        }

        emitProgress(onProgress, { domain: options.key, label: options.label, stage: "上传新增媒体", status: "active" });
        const uploaded = await uploadChangedFiles(config, syncScope, mergedData, remoteManifest?.files || [], onProgress);
        const manifest: DomainManifest<T> = { app: "infinite-canvas", version: 1, domain: "canvas", exportedAt: new Date().toISOString(), data: mergedData, files: uploaded.files };
        const manifestFile = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
        emitProgress(onProgress, { domain: options.key, label: options.label, stage: `上传清单 ${formatBytes(manifestFile.size)}`, status: "active" });
        await uploadWebdavFile(config, domainPath(syncScope, WEBDAV_MANIFEST_FILE_NAME), manifestFile, "application/json");
        emitProgress(onProgress, { domain: options.key, label: options.label, stage: "完成", current: 1, total: 1, status: "success" });

        return {
            data: mergedData,
            mergedRemote: Boolean(remoteManifest),
            files: uploaded.files.length,
            manifestBytes: manifestFile.size,
            uploadedFiles: uploaded.uploadedFiles,
            uploadedBytes: uploaded.uploadedBytes,
        };
    } catch (error) {
        emitProgress(onProgress, { domain: options.key, label: options.label, stage: error instanceof Error ? error.message : i18n.t("config.webdav.errors.syncFailed"), status: "exception" });
        throw error;
    }
}

async function readDomainManifest<T>(config: WebdavSyncConfig, syncScope: string, emptyData: T): Promise<DomainManifest<T> | null> {
    const file = await downloadWebdavFile(config, domainPath(syncScope, WEBDAV_MANIFEST_FILE_NAME));
    if (!file) return null;
    const data = JSON.parse(await file.text()) as DomainManifest<T>;
    if (data.app !== "infinite-canvas" || data.domain !== "canvas") throw new Error(i18n.t("config.webdav.errors.invalidManifest", { domain: "canvas" }));
    return {
        app: "infinite-canvas",
        version: 1,
        domain: "canvas",
        exportedAt: data.exportedAt || new Date().toISOString(),
        data: data.data || emptyData,
        files: Array.isArray(data.files) ? data.files : [],
    };
}

async function downloadMissingFiles<T>(config: WebdavSyncConfig, data: T, remoteFiles: AppSyncFile[], onProgress?: AppSyncProgress) {
    const remoteFileMap = new Map(remoteFiles.map((item) => [item.storageKey, item]));
    const tasks: AppSyncFile[] = [];
    const storageKeys = collectStorageKeys(data);
    let scanned = 0;
    for (const storageKey of storageKeys) {
        const localBlob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        scanned += 1;
        if (localBlob) {
            emitProgress(onProgress, { domain: "canvas", label: "画布", stage: "检查缺失媒体", current: scanned, total: storageKeys.length, status: "active" });
            continue;
        }
        const remoteFile = remoteFileMap.get(storageKey);
        if (remoteFile) tasks.push(remoteFile);
        emitProgress(onProgress, { domain: "canvas", label: "画布", stage: "检查缺失媒体", current: scanned, total: storageKeys.length, status: "active" });
    }
    if (!tasks.length) {
        emitProgress(onProgress, { domain: "canvas", label: "画布", stage: "媒体已齐全", current: 1, total: 1, status: "active" });
        return;
    }
    let downloaded = 0;
    await runWithConcurrency(tasks, FILE_CONCURRENCY, async (remoteFile) => {
        const blob = await downloadWebdavFile(config, remoteFile.path);
        if (!blob) return;
        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, remoteFile.mimeType);
        await (remoteFile.storageKey.startsWith("image:") ? setImageBlob(remoteFile.storageKey, typedBlob) : setMediaBlob(remoteFile.storageKey, typedBlob));
        downloaded += 1;
        emitProgress(onProgress, { domain: "canvas", label: "画布", stage: "下载媒体", current: downloaded, total: tasks.length, status: "active" });
    });
}

async function uploadChangedFiles<T>(config: WebdavSyncConfig, syncScope: string, data: T, remoteFiles: AppSyncFile[], onProgress?: AppSyncProgress) {
    const remoteFileMap = new Map(remoteFiles.map((item) => [item.storageKey, item]));
    const files: AppSyncFile[] = [];
    const tasks: Array<{ item: AppSyncFile; blob: Blob }> = [];
    let uploadedFiles = 0;
    let uploadedBytes = 0;

    const storageKeys = collectStorageKeys(data);
    let scanned = 0;
    for (const storageKey of storageKeys) {
        const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        const remoteFile = remoteFileMap.get(storageKey);
        if (!blob) {
            if (remoteFile) files.push(remoteFile);
            scanned += 1;
            emitProgress(onProgress, { domain: "canvas", label: "画布", stage: "检查本地媒体", current: scanned, total: storageKeys.length, status: "active" });
            continue;
        }
        const item: AppSyncFile = {
            storageKey,
            path: remoteFile?.path || domainPath(syncScope, `files/${safeFileName(storageKey)}.${fileExtension(blob.type, storageKey)}`),
            mimeType: blob.type || remoteFile?.mimeType || "application/octet-stream",
            bytes: blob.size,
        };
        files.push(item);
        if (!remoteFile || remoteFile.bytes !== blob.size) tasks.push({ item, blob });
        scanned += 1;
        emitProgress(onProgress, { domain: "canvas", label: "画布", stage: "检查本地媒体", current: scanned, total: storageKeys.length, status: "active" });
    }

    if (!tasks.length) {
        emitProgress(onProgress, { domain: "canvas", label: "画布", stage: "媒体无需上传", current: 1, total: 1, status: "active" });
        return { files, uploadedFiles, uploadedBytes };
    }

    await runWithConcurrency(tasks, FILE_CONCURRENCY, async ({ item, blob }) => {
        await uploadWebdavFile(config, item.path, blob, item.mimeType);
        uploadedFiles += 1;
        uploadedBytes += blob.size;
        emitProgress(onProgress, { domain: "canvas", label: "画布", stage: `上传媒体 ${formatBytes(blob.size)}`, current: uploadedFiles, total: tasks.length, status: "active" });
    });

    return { files, uploadedFiles, uploadedBytes };
}

function mergeCanvasData(local: CanvasDomainData, remote: CanvasDomainData): CanvasDomainData {
    const localDeleted = local.deleted || [];
    const remoteDeleted = remote.deleted || [];
    const deletedById = new Map<string, CanvasDeletedProject>();
    for (const item of [...remoteDeleted, ...localDeleted]) {
        if (!item.id || !item.deletedAt) continue;
        const current = deletedById.get(item.id);
        if (!current || item.deletedAt >= current.deletedAt) deletedById.set(item.id, item);
    }

    const projects = mergeById(local.projects || [], remote.projects || [], "updatedAt").filter((project) => {
        const deleted = deletedById.get(project.id);
        if (!deleted) return true;
        if (getTime(project as Record<string, unknown>, "updatedAt") > Date.parse(deleted.deletedAt)) {
            deletedById.delete(project.id);
            return true;
        }
        return false;
    });

    return {
        projects,
        deleted: [...deletedById.values()],
    };
}

function mergeById<T extends { id?: string }>(local: T[], remote: T[], timeKey: string) {
    const items = new Map<string, T>();
    remote.forEach((item) => {
        const id = item.id || "";
        if (id) items.set(id, item);
    });
    local.forEach((item) => {
        const id = item.id || "";
        if (!id) return;
        const current = items.get(id);
        if (!current || getTime(item as Record<string, unknown>, timeKey) >= getTime(current as Record<string, unknown>, timeKey)) items.set(id, item);
    });
    return Array.from(items.values()).sort((a, b) => getTime(b as Record<string, unknown>, timeKey) - getTime(a as Record<string, unknown>, timeKey));
}

function collectStorageKeys(value: unknown, keys = new Set<string>()) {
    if (typeof value === "string") {
        if (storageKeyPattern.test(value)) keys.add(value);
        return [...keys];
    }
    if (!value || typeof value !== "object") return [...keys];
    if ("storageKey" in value && typeof value.storageKey === "string" && storageKeyPattern.test(value.storageKey)) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectStorageKeys(child, keys)) : collectStorageKeys(item, keys)));
    return [...keys];
}

function domainPath(syncScope: string, path: string) {
    return `users/${syncScope}/canvas/${path}`;
}

function emitProgress(onProgress: AppSyncProgress | undefined, event: AppSyncProgressEvent) {
    onProgress?.(event);
}

function getTime(item: Record<string, unknown>, key: string) {
    const value = item[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    return 0;
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    return storageKey.startsWith("image:") ? "png" : "bin";
}

function waitForHydration<T extends { hydrated: boolean }>(store: { getState: () => T; subscribe: (listener: (state: T) => void) => () => void }) {
    if (store.getState().hydrated) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const unsubscribe = store.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            resolve();
        });
    });
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (nextIndex < items.length) {
                const index = nextIndex++;
                results[index] = await worker(items[index], index);
            }
        }),
    );
    return results;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
