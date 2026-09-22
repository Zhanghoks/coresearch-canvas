import fs from "node:fs";
import path from "node:path";

import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import { PI_AGENT_DIR, PI_AUTH_FILE } from "../config.js";

export type AgentProviderStatus = { id: string; name: string; configured: boolean; auth?: string };

let runtimePromise: Promise<ModelRuntime> | null = null;

/** 返回指向仓库 `.data/runtime` 与 `.data/auth.json` 的 Pi ModelRuntime。 */
export function getModelRuntime() {
    fs.mkdirSync(PI_AGENT_DIR, { recursive: true, mode: 0o700 });
    fs.chmodSync(PI_AGENT_DIR, 0o700);
    runtimePromise ||= ModelRuntime.create({
        authPath: PI_AUTH_FILE,
        modelsPath: path.join(PI_AGENT_DIR, "models.json"),
        modelsStorePath: path.join(PI_AGENT_DIR, "models-store.json"),
    });
    return runtimePromise;
}

/** 列出提供商及是否已配置密钥，不返回密钥本身。 */
export async function listProviderStatus(): Promise<AgentProviderStatus[]> {
    const runtime = await getModelRuntime();
    const providers = runtime.getProviders();
    return Promise.all(providers.map(async (provider) => {
        const status = await runtime.checkAuth(provider.id).catch(() => undefined);
        return {
            id: provider.id,
            name: provider.name,
            configured: runtime.hasConfiguredAuth(provider.id) || Boolean(status),
            auth: status?.type,
        };
    }));
}

/** 将 API Key 写入 Pi auth.json 并刷新可用模型。 */
export async function setProviderApiKey(providerId: string, apiKey: string) {
    const id = providerId.trim();
    const key = apiKey.trim();
    if (!id || !key) throw new Error("请提供提供商和 API Key");
    ensureAuthFile();
    const runtime = await getModelRuntime();
    if (!runtime.getProvider(id)) throw new Error(`未知提供商：${id}`);
    await runtime.login(id, "api_key", {
        prompt: async (prompt) => {
            if (prompt.type === "secret" || prompt.type === "text") return key;
            return prompt.type === "select" ? prompt.options[0]?.id || "" : "";
        },
        notify: () => undefined,
    });
    if (fs.existsSync(PI_AUTH_FILE)) fs.chmodSync(PI_AUTH_FILE, 0o600);
}

/** 删除指定提供商的已存密钥。 */
export async function deleteProviderApiKey(providerId: string) {
    const runtime = await getModelRuntime();
    await runtime.logout(providerId.trim());
}

function ensureAuthFile() {
    if (fs.existsSync(PI_AUTH_FILE)) return;
    fs.mkdirSync(path.dirname(PI_AUTH_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(PI_AUTH_FILE, "{}", { mode: 0o600 });
    fs.chmodSync(path.dirname(PI_AUTH_FILE), 0o700);
    fs.chmodSync(PI_AUTH_FILE, 0o600);
}

const ENV_KEYS_BY_PROVIDER: Record<string, string[]> = {
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    "google-gemini": ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    groq: ["GROQ_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY"],
    mistral: ["MISTRAL_API_KEY"],
    xai: ["XAI_API_KEY"],
};

/** 启动时把进程环境变量里的模型 API Key 写入 auth.json（不覆盖已有配置）。 */
export async function applyCredentialsFromEnv() {
    const runtime = await getModelRuntime();
    for (const provider of runtime.getProviders()) {
        if (runtime.hasConfiguredAuth(provider.id)) continue;
        const envNames = ENV_KEYS_BY_PROVIDER[provider.id] || [`${provider.id.toUpperCase().replace(/-/g, "_")}_API_KEY`];
        for (const env of envNames) {
            const key = process.env[env]?.trim();
            if (!key) continue;
            try {
                await setProviderApiKey(provider.id, key);
            } catch {
                // 未知提供商或 Pi 拒绝该密钥时跳过
            }
            break;
        }
    }
}
