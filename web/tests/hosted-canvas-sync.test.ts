import { expect, test } from "bun:test";

import { HostedCanvasSync, type CommitResult } from "../src/lib/canvas/hosted-canvas-sync";

class Conflict extends Error {
    constructor(readonly currentRevision: number) {
        super("conflict");
    }
}

// 模拟服务端：baseRevision 必须等于当前值才 +1。
function fakeServer(initial = 0) {
    const state = { revision: initial, snapshots: [] as unknown[], inflight: 0, maxInflight: 0 };
    const publish = async (base: number, snapshot: unknown): Promise<CommitResult> => {
        state.inflight += 1;
        state.maxInflight = Math.max(state.maxInflight, state.inflight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        state.inflight -= 1;
        if (base !== state.revision) throw new Conflict(state.revision);
        state.revision += 1;
        state.snapshots.push(snapshot);
        return { revision: state.revision };
    };
    return { state, publish };
}

function createSync(server: ReturnType<typeof fakeServer>, base = 0) {
    const committed: number[] = [];
    const errors: unknown[] = [];
    const sync = new HostedCanvasSync({
        baseRevision: base,
        debounceMs: 10,
        publish: server.publish,
        conflictRevision: (error) => error instanceof Conflict ? error.currentRevision : null,
        onCommitted: (revision) => committed.push(revision),
        onError: (error) => errors.push(error),
    });
    return { sync, committed, errors };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("连续编辑防抖后只发布最新一份，revision 由服务端分配", async () => {
    const server = fakeServer();
    const { sync, committed } = createSync(server);
    for (let index = 1; index <= 5; index += 1) sync.schedule({ n: index }, `k${index}`);
    await wait(40);
    await sync.flush();
    expect(server.state.snapshots).toEqual([{ n: 5 }]);
    expect(committed).toEqual([1]);
    expect(sync.revision).toBe(1);
});

test("同一时刻最多一个提交在途，不会乱序触发 409", async () => {
    const server = fakeServer();
    const { sync, errors } = createSync(server);
    const tasks = [1, 2, 3, 4].map((index) => {
        sync.schedule({ n: index }, `k${index}`);
        return sync.flush();
    });
    await Promise.all(tasks);
    expect(server.state.maxInflight).toBe(1);
    expect(errors).toEqual([]);
    expect(server.state.snapshots.at(-1)).toEqual({ n: 4 });

    // 在途时继续编辑：等当前提交返回后再基于新 revision 发下一份。
    sync.schedule({ n: 5 }, "k5");
    const first = sync.flush();
    sync.schedule({ n: 6 }, "k6");
    const second = sync.flush();
    await Promise.all([first, second]);
    expect(server.state.maxInflight).toBe(1);
    expect(errors).toEqual([]);
    expect(server.state.snapshots.at(-1)).toEqual({ n: 6 });
    expect(sync.revision).toBe(server.state.revision);
});

test("内容未变化（只动了视口或选区）不发布", async () => {
    const server = fakeServer();
    const { sync } = createSync(server);
    sync.markInSync("same");
    sync.schedule({ n: 1, viewport: 2 }, "same");
    await wait(30);
    await sync.flush();
    expect(server.state.snapshots).toEqual([]);
});

test("冲突时以浏览器为准：用服务端当前 revision 重试一次", async () => {
    const server = fakeServer(7);
    const { sync, committed, errors } = createSync(server, 3);
    sync.schedule({ n: 1 }, "k1");
    await sync.flush();
    expect(errors).toEqual([]);
    expect(server.state.snapshots).toEqual([{ n: 1 }]);
    expect(committed).toEqual([8]);
});

test("重试后仍冲突交给 onError，不无限重试", async () => {
    const server = fakeServer(5);
    const conflicting = async (): Promise<CommitResult> => {
        throw new Conflict(server.state.revision++);
    };
    const errors: unknown[] = [];
    const sync = new HostedCanvasSync({
        baseRevision: 0,
        debounceMs: 10,
        publish: conflicting,
        conflictRevision: (error) => error instanceof Conflict ? error.currentRevision : null,
        onCommitted: () => {},
        onError: (error) => errors.push(error),
    });
    sync.schedule({ n: 1 }, "k1");
    await sync.flush();
    expect(errors).toHaveLength(1);
});

test("Agent 工具结果与普通发布走同一条队列，按顺序使用前一次返回的 revision", async () => {
    const server = fakeServer();
    const { sync, errors } = createSync(server);
    sync.schedule({ n: 1 }, "k1");
    const publishing = sync.flush();
    const tool = sync.commitWith("k-tool", (base) => server.publish(base, { tool: true }));
    await Promise.all([publishing, tool]);
    expect(errors).toEqual([]);
    expect(server.state.maxInflight).toBe(1);
    expect(server.state.snapshots).toEqual([{ n: 1 }, { tool: true }]);
    expect((await tool).revision).toBe(2);
});

test("工具结果提交后，等待中的同内容快照不再重复发布", async () => {
    const server = fakeServer();
    const { sync } = createSync(server);
    sync.schedule({ tool: true }, "k-tool");
    await sync.commitWith("k-tool", (base) => server.publish(base, { tool: true }));
    await wait(30);
    await sync.flush();
    expect(server.state.snapshots).toEqual([{ tool: true }]);
});
