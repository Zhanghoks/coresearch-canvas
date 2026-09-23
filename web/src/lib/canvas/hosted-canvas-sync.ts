// 浏览器画布 → 托管 agent-api 的快照同步队列。
//
// 服务端按乐观锁分配 revision：提交时带上最后确认的 baseRevision，只有等于服务端当前值才写入并 +1，
// 否则 409 并带回 currentRevision。这里保证同一时刻最多一个提交在途（Agent 工具结果也走同一条队列），
// 编辑先防抖再只发最新一份；遇到冲突以浏览器为准（浏览器是画布的权威来源），用服务端当前 revision 重试一次。

export type CommitResult = { revision: number };

export type HostedCanvasSyncOptions = {
    baseRevision: number;
    debounceMs?: number;
    publish(baseRevision: number, snapshot: Record<string, unknown>): Promise<CommitResult>;
    /** 从错误里取出服务端当前 revision；不是 revision 冲突时返回 null。 */
    conflictRevision(error: unknown): number | null;
    onCommitted(revision: number): void;
    onError(error: unknown): void;
};

type Pending = { snapshot: Record<string, unknown>; key: string };

export class HostedCanvasSync {
    private base: number;
    private pending: Pending | null = null;
    private committedKey: string | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private chain: Promise<unknown> = Promise.resolve();
    private disposed = false;

    constructor(private readonly options: HostedCanvasSyncOptions) {
        this.base = options.baseRevision;
    }

    get revision() {
        return this.base;
    }

    /** 已知与服务端一致的内容（例如刚从服务端拉取），不必再发布。 */
    markInSync(key: string) {
        this.committedKey = key;
        if (this.pending?.key === key) this.pending = null;
    }

    /** key 只由会影响画布内容的部分（节点、连线）计算；选区、视口变化不触发发布。 */
    schedule(snapshot: Record<string, unknown>, key: string) {
        if (this.disposed) return;
        if (key === this.committedKey && !this.pending) return;
        this.pending = { snapshot, key };
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), this.options.debounceMs ?? 800);
    }

    /** 立即发布待发的最新快照；失败交给 onError。 */
    flush(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        return this.enqueue(async () => {
            const pending = this.pending;
            this.pending = null;
            if (!pending || pending.key === this.committedKey || this.disposed) return;
            await this.commit((base) => this.options.publish(base, pending.snapshot));
            this.committedKey = pending.key;
        }).catch((error) => this.options.onError(error));
    }

    /**
     * 在同一条队列里执行一次带快照的提交（Agent 工具结果）。
     * 调用方拿到错误自行处理，不会再经过 onError。
     */
    commitWith<T extends CommitResult>(key: string, submit: (baseRevision: number) => Promise<T>): Promise<T> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        return this.enqueue(async () => {
            const result = await this.commit(submit);
            this.committedKey = key;
            if (this.pending?.key === key) this.pending = null;
            return result;
        });
    }

    dispose() {
        this.disposed = true;
        this.pending = null;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private async commit<T extends CommitResult>(submit: (baseRevision: number) => Promise<T>): Promise<T> {
        let result: T;
        try {
            result = await submit(this.base);
        } catch (error) {
            const current = this.options.conflictRevision(error);
            if (current === null) throw error;
            this.base = current;
            result = await submit(this.base);
        }
        this.base = result.revision;
        if (!this.disposed) this.options.onCommitted(result.revision);
        return result;
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.chain.then(task);
        this.chain = run.then(() => undefined, () => undefined);
        return run;
    }
}
