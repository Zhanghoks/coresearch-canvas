import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { defaultDataRoot } from "../workspace-paths.js";

const MAX_PDF_BYTES = 80 * 1024 * 1024;
// 论文 PDF 常有 5–20MB，部分站点在国内只有一两百 KB/s。
const FETCH_TIMEOUT_MS = 180_000;
const inflight = new Map<string, Promise<string>>();

export class SourcePdfError extends Error {
    constructor(message: string, readonly statusCode: 400 | 413 | 415 | 502) {
        super(message);
    }
}

/**
 * 画布里的论文节点通过本机 Agent 预览 PDF：原站常禁止 iframe 嵌入，这里下载一次后缓存在 `.data/cache/sources/`，
 * 之后从同源地址直接读，离线也能看。
 */
export async function cachedSourcePdf(rawUrl: string, dataRoot = defaultDataRoot()) {
    const url = publicHttpUrl(rawUrl);
    const file = path.join(dataRoot, "cache", "sources", `${crypto.createHash("sha256").update(url.href).digest("hex").slice(0, 32)}.pdf`);
    if (await fs.stat(file).then((stat) => stat.size > 0, () => false)) return file;
    let task = inflight.get(file);
    if (!task) {
        task = download(url, file).finally(() => inflight.delete(file));
        inflight.set(file, task);
    }
    return task;
}

async function download(url: URL, file: string) {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": "CoResearch/1.0 (paper preview)", accept: "application/pdf,*/*;q=0.8" } }).catch((error) => {
        throw new SourcePdfError(`下载 PDF 失败：${error instanceof Error ? error.message : String(error)}`, 502);
    });
    if (!response.ok) throw new SourcePdfError(`下载 PDF 失败：HTTP ${response.status}`, 502);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_PDF_BYTES) throw new SourcePdfError("PDF 超过 80MB，无法预览", 413);
    const data = Buffer.from(await response.arrayBuffer().catch((error) => {
        throw new SourcePdfError(`下载 PDF 失败：${error instanceof Error ? error.message : String(error)}`, 502);
    }));
    if (data.byteLength > MAX_PDF_BYTES) throw new SourcePdfError("PDF 超过 80MB，无法预览", 413);
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new SourcePdfError("链接返回的不是 PDF 文件", 415);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, file);
    return file;
}

/** 只允许公网 http(s) 地址，避免借预览接口访问本机或内网服务。 */
function publicHttpUrl(raw: string) {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new SourcePdfError("PDF 链接无效", 400);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new SourcePdfError("只支持 http(s) PDF 链接", 400);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".local") || host === "::1" || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || /^f[cd][0-9a-f]{2}:/.test(host)) {
        throw new SourcePdfError("不支持本机或内网地址", 400);
    }
    return url;
}
