import { useUserStore } from "@/stores/use-user-store";

const LOCAL_USER_KEY = "canvas-local-user-id";

/** 当前工作区用户：已登录用 auth id，否则用本机稳定 id。 */
export function canvasWorkspaceUserId() {
    const signedIn = useUserStore.getState().user?.id?.trim();
    if (signedIn) return signedIn;
    if (typeof window === "undefined") return "local";
    const existing = window.localStorage.getItem(LOCAL_USER_KEY)?.trim();
    if (existing) return existing;
    const id = `local-${crypto.randomUUID()}`;
    window.localStorage.setItem(LOCAL_USER_KEY, id);
    return id;
}
