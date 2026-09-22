import fs from "node:fs";
import path from "node:path";

import { SEARCH_AUTH_FILE } from "../config.js";

export type SearchApiKind = "none" | "secret" | "email";
export type SearchApiSpec = {
    id: string;
    name: string;
    description: string;
    skill: string;
    kind: SearchApiKind;
    env: string;
};
export type SearchApiStatus = SearchApiSpec & { required: false; configured: boolean; valueHint?: string };

/** 论文检索实际用到的接口目录；前端 Agent 配置只渲染这份列表。 */
export const SEARCH_APIS: SearchApiSpec[] = [
    { id: "arxiv", name: "arXiv", description: "预印本检索，公开 Atom API。", skill: "paper-arxiv", kind: "none", env: "" },
    { id: "web", name: "网页搜索", description: "pi-web-access 的 web_search / fetch_content，默认可用。", skill: "paper-lit", kind: "none", env: "" },
    { id: "semantic-scholar", name: "Semantic Scholar", description: "venue / IEEE / 引用量。可选 API Key 提高限额。", skill: "paper-scholar", kind: "secret", env: "SEMANTIC_SCHOLAR_API_KEY" },
    { id: "openalex", name: "OpenAlex", description: "机构 / 资助 / 开放引文。可选邮箱走礼貌池。", skill: "paper-openalex", kind: "email", env: "OPENALEX_EMAIL" },
    { id: "verify-email", name: "礼貌池邮箱", description: "CrossRef 核验与 arXiv User-Agent。可选。", skill: "paper-verify", kind: "email", env: "ARIS_VERIFY_EMAIL" },
];

const EMAIL_RE = /.+@.+\..+/;
const VALUE_MAX = 512;

/** 启动或保存后把 `.data/search.json` 注入进程环境，供 bash 脚本读取。 */
export function applySearchEnv() {
    const values = readSearchAuth();
    for (const api of SEARCH_APIS) {
        if (!api.env) continue;
        const value = values[api.id] || process.env[api.env]?.trim() || "";
        if (value) process.env[api.env] = value;
        else delete process.env[api.env];
    }
}

/** 列出搜索接口及是否已配置，密钥本身不返回。 */
export function listSearchApiStatus(): SearchApiStatus[] {
    const values = readSearchAuth();
    return SEARCH_APIS.map((api) => {
        if (api.kind === "none") return { ...api, required: false, configured: true };
        const value = values[api.id] || "";
        return {
            ...api,
            required: false,
            configured: Boolean(value),
            valueHint: api.kind === "email" && value ? value : undefined,
        };
    });
}

/** 写入可选搜索密钥或邮箱。 */
export function setSearchApiValue(apiId: string, raw: string) {
    const api = findConfigurable(apiId);
    const value = raw.trim();
    if (!value) throw new Error("请提供配置值");
    if (value.length > VALUE_MAX) throw new Error("配置值过长");
    if (api.kind === "email" && !EMAIL_RE.test(value)) throw new Error("请填写有效邮箱");
    const next = { ...readSearchAuth(), [api.id]: value };
    writeSearchAuth(next);
    applySearchEnv();
}

/** 删除指定搜索接口的已存配置。 */
export function deleteSearchApiValue(apiId: string) {
    const api = findConfigurable(apiId);
    const current = readSearchAuth();
    delete current[api.id];
    writeSearchAuth(current);
    applySearchEnv();
}

function findConfigurable(apiId: string) {
    const api = SEARCH_APIS.find((item) => item.id === apiId.trim());
    if (!api) throw new Error("未知搜索接口");
    if (api.kind === "none") throw new Error("该接口无需密钥");
    return api;
}

function readSearchAuth(): Record<string, string> {
    try {
        const parsed = JSON.parse(fs.readFileSync(SEARCH_AUTH_FILE, "utf8")) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const out: Record<string, string> = {};
        for (const api of SEARCH_APIS) {
            if (api.kind === "none") continue;
            const value = (parsed as Record<string, unknown>)[api.id];
            if (typeof value === "string" && value.trim()) out[api.id] = value.trim();
        }
        return out;
    } catch {
        return {};
    }
}

function writeSearchAuth(values: Record<string, string>) {
    fs.mkdirSync(path.dirname(SEARCH_AUTH_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(SEARCH_AUTH_FILE, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(path.dirname(SEARCH_AUTH_FILE), 0o700);
    fs.chmodSync(SEARCH_AUTH_FILE, 0o600);
}
