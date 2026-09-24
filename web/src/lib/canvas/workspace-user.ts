import { useUserStore } from "@/stores/use-user-store";

/** 未登录时本机 Canvas Agent 的固定用户；与 canvas-agent 的 LOCAL_USER_ID 保持一致。 */
export const LOCAL_WORKSPACE_USER_ID = "local";
const LEGACY_LOCAL_USER_KEY = "canvas-local-user-id";

/** 当前工作区用户：已登录用 auth id，否则用固定的本机用户，保证换浏览器、换地址都看到同一份项目。 */
export function canvasWorkspaceUserId() {
    const signedIn = useUserStore.getState().user?.id?.trim();
    if (signedIn) return signedIn;
    if (typeof window !== "undefined") window.localStorage.removeItem(LEGACY_LOCAL_USER_KEY);
    return LOCAL_WORKSPACE_USER_ID;
}
