import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { agentStorePaths } from "./workspace-paths.js";

export const DEFAULT_PORT = 17371;
const store = agentStorePaths();
export const CONFIG_DIR = store.root;
export const CONFIG_FILE = store.configFile;
export const PI_AGENT_DIR = store.runtimeDir;
export const PI_SESSION_DIR = store.sessionDir;
export const PI_AUTH_FILE = store.authFile;
export const SEARCH_AUTH_FILE = store.searchAuthFile;
const AGENT_WORKSPACE_DIR = store.workspaceDir;
export const VERSION = readPackageVersion();
export const AGENT_PROMPT = fs.readFileSync(new URL("../agent-instructions.md", import.meta.url), "utf8");
const BUNDLED_SKILLS_DIR = fileURLToPath(new URL("../skills", import.meta.url));
const initializedWorkspaces = new Set<string>();

export type SiteWorkspaceConfig = { workspacePath: string; activeThreadId?: string; pinnedThreadIds?: string[] };
export type CanvasAgentConfig = { url: string; token: string; origins?: string[]; workspace?: SiteWorkspaceConfig };

/** 读取本地 Canvas Agent 配置，不存在时生成默认配置。 */
export function loadConfig(create = false): CanvasAgentConfig {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig;
    } catch {
        const config = { url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex") };
        if (create) saveConfig(config);
        return config;
    }
}

/** 将 CoResearch Agent 配置写入仓库 `.data/`。 */
export function saveConfig(config: CanvasAgentConfig) {
    writeConfigFile(CONFIG_DIR, CONFIG_FILE, config);
}

/** 写入配置并强制目录 0700、文件 0600，包括纠正已有宽松权限。 */
export function writeConfigFile(dir: string, file: string, config: CanvasAgentConfig) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(file, 0o600);
}

/** 确保站点级工作空间存在并已初始化。 */
export function ensureSiteWorkspace(config: CanvasAgentConfig) {
    const workspacePath = AGENT_WORKSPACE_DIR;
    const current = config.workspace;
    if (current?.workspacePath !== workspacePath) {
        config.workspace = { ...current, workspacePath };
        initializeWorkspace(workspacePath);
        saveConfig(config);
        return { ...config.workspace, workspacePath };
    }
    initializeWorkspace(workspacePath);
    return { ...current, workspacePath };
}

/** 更新站点级工作空间配置。 */
export function updateSiteWorkspace(config: CanvasAgentConfig, patch: Partial<SiteWorkspaceConfig>) {
    const current = ensureSiteWorkspace(config);
    const next = { ...current, ...patch, workspacePath: AGENT_WORKSPACE_DIR };
    config.workspace = { workspacePath: next.workspacePath, activeThreadId: next.activeThreadId, pinnedThreadIds: next.pinnedThreadIds };
    initializeWorkspace(AGENT_WORKSPACE_DIR);
    saveConfig(config);
    return config.workspace;
}

/** 创建工作空间目录并写入默认 AGENTS.md 与研究节点 Skill 仓库。 */
function initializeWorkspace(workspacePath: string) {
    if (initializedWorkspaces.has(workspacePath)) return;
    fs.mkdirSync(workspacePath, { recursive: true });
    writeManagedFile(path.join(workspacePath, "AGENTS.md"), AGENT_PROMPT, "# CoResearch Agent", ["# Infinite Canvas Agent"]);
    installBundledSkills(path.join(workspacePath, "skills"));
    initializedWorkspaces.add(workspacePath);
}

export function installBundledSkills(targetDir: string) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const name of fs.readdirSync(BUNDLED_SKILLS_DIR)) {
        const sourceDir = path.join(BUNDLED_SKILLS_DIR, name);
        if (!fs.existsSync(path.join(sourceDir, "SKILL.md"))) continue;
        installBundledSkillDirectory(sourceDir, path.join(targetDir, name), name);
    }
}

function installBundledSkillDirectory(sourceDir: string, targetDir: string, skillName: string) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const source = path.join(sourceDir, entry.name);
        const target = path.join(targetDir, entry.name);
        if (entry.isDirectory()) installBundledSkillDirectory(source, target, skillName);
        if (entry.isFile()) {
            const content = fs.readFileSync(source, "utf8");
            const prefix = resourcePrefix(entry.name, skillName);
            writeManagedFile(target, content, prefix, entry.name === "SKILL.md" ? [] : ["<!-- Infinite Canvas managed skill resource -->", "# Infinite Canvas managed skill resource"]);
        }
    }
}

function resourcePrefix(entryName: string, skillName: string) {
    if (entryName === "SKILL.md") return `---\nname: ${skillName}`;
    if (/\.(py|sh)$/.test(entryName)) return "# CoResearch managed skill resource";
    return "<!-- CoResearch managed skill resource -->";
}

function writeManagedFile(file: string, content: string, managedPrefix: string, legacyPrefixes: string[] = []) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (!current || current.startsWith(managedPrefix) || legacyPrefixes.some((prefix) => current.startsWith(prefix))) fs.writeFileSync(file, content);
}

/** 从当前包信息中读取 Canvas Agent 版本号。 */
function readPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
        return pkg.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}
