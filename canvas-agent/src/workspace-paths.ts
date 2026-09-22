import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * CoResearch 仓库内的项目配置与运行数据分开存放。
 *
 * .coresearch/                      项目级配置，可部分提交 Git
 *   AGENTS.md                       Agent 工作空间指令
 *   skills/                         研究节点 Skill 安装副本
 *   extensions/                     可选；目录存在才加载
 *
 * .data/                            运行数据，不提交 Git（可用 CANVAS_DATA_DIR 覆盖）
 *   agent.json                      HTTP 地址、token、允许的 Origin
 *   auth.json                       模型 API Key（文件 0600）
 *   search.json                     文献搜索 API 配置（文件 0600）
 *   logs/                           Debug 日志
 *   sessions/                       Pi 会话
 *   runtime/                        Pi agentDir（models.json 等）
 *   messages/                       对话附件与引用元数据
 *   users/<userId>/projects/        画布 JSON 与 Artifact
 */
function repoRoot() {
    return path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
}

export function defaultCoresearchRoot() {
    return path.join(repoRoot(), ".coresearch");
}

export function defaultDataRoot() {
    return process.env.CANVAS_DATA_DIR || path.join(repoRoot(), ".data");
}

export type AgentStorePaths = {
    root: string;
    workspaceDir: string;
    configFile: string;
    authFile: string;
    searchAuthFile: string;
    logDir: string;
    sessionDir: string;
    runtimeDir: string;
    messageDir: string;
};

export function agentStorePaths(root = defaultDataRoot()): AgentStorePaths {
    return {
        root,
        workspaceDir: defaultCoresearchRoot(),
        configFile: path.join(root, "agent.json"),
        authFile: path.join(root, "auth.json"),
        searchAuthFile: path.join(root, "search.json"),
        logDir: path.join(root, "logs"),
        sessionDir: path.join(root, "sessions"),
        runtimeDir: path.join(root, "runtime"),
        messageDir: path.join(root, "messages"),
    };
}

export function sanitizeUserId(userId: string) {
    const id = userId.trim();
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) throw new Error("无效用户");
    return id;
}

/** 路径 key，不是权限机制。 */
export function projectKey(projectId: string) {
    return crypto.createHash("sha256").update(projectId).digest("hex").slice(0, 24);
}

export function userDir(dataRoot: string, userId: string) {
    return path.join(dataRoot, "users", sanitizeUserId(userId));
}

export function projectDir(dataRoot: string, userId: string, projectId: string) {
    return path.join(userDir(dataRoot, userId), "projects", projectKey(projectId));
}
