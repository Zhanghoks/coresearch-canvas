import type { ResearchStore } from "./store.js";
import type { RequestContext } from "./types.js";

// 一次 Agent 运行期间的写操作。运行可能远长于用户 JWT 的有效期（默认 1 小时），
// 生产环境由 ServiceRoleRunWriter 承担这些写；读仍走用户自己的 store（RLS）。
export type RunWrites = Pick<ResearchStore, "appendEvent" | "finishRun" | "saveConversationSession" | "bindCodexThread" | "bindCodexTurn">;

/** 运行开始时（用户 JWT 下）已经确认归属的范围；写入只允许落在这个范围内。 */
export type RunScope = { ctx: RequestContext; conversationId: string; runId: string };

export type RunWritesFactory = (scope: RunScope, userStore: ResearchStore) => RunWrites;

/** 默认沿用请求自己的 store：内存实现和测试不需要 service role。 */
export const userStoreRunWrites: RunWritesFactory = (_scope, store) => store;

/** 读委托给用户 store，运行期间的写改走 writes。 */
export function runScopedStore(store: ResearchStore, writes: RunWrites): ResearchStore {
    if (writes === store) return store;
    const scoped = Object.create(store) as ResearchStore;
    scoped.appendEvent = writes.appendEvent.bind(writes);
    scoped.finishRun = writes.finishRun.bind(writes);
    scoped.saveConversationSession = writes.saveConversationSession.bind(writes);
    scoped.bindCodexThread = writes.bindCodexThread.bind(writes);
    scoped.bindCodexTurn = writes.bindCodexTurn.bind(writes);
    return scoped;
}
