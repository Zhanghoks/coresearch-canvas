import assert from "node:assert/strict";
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { InMemoryResearchStore } from "../in-memory-store.js";
import type { ResearchStore } from "../store.js";
import { SupabaseResearchStore } from "../supabase-store.js";

// 生产库的 project ref。测试会创建和删除用户，绝不能指向它。
const PRODUCTION_REF = "bpxlnucpdmunyvwjpjov";

export type TestUser = { id: string; store: ResearchStore };
export type StoreHarness = {
    name: string;
    createUser(): Promise<TestUser>;
    cleanup(): Promise<void>;
};

export function supabaseTestEnv() {
    const url = process.env.SUPABASE_TEST_URL?.trim();
    if (!url) return null;
    if (url.includes(PRODUCTION_REF)) throw new Error("SUPABASE_TEST_URL 指向生产库，拒绝运行会创建/删除用户的测试");
    return {
        url,
        publishableKey: required("SUPABASE_TEST_PUBLISHABLE_KEY"),
        secretKey: required("SUPABASE_TEST_SECRET_KEY"),
    };
}

export function inMemoryHarness(): StoreHarness {
    const store = new InMemoryResearchStore();
    return {
        name: "in-memory",
        async createUser() {
            return { id: crypto.randomUUID(), store };
        },
        async cleanup() {},
    };
}

export function supabaseHarness(env: NonNullable<ReturnType<typeof supabaseTestEnv>>): StoreHarness {
    const admin = plainClient(env.url, env.secretKey);
    const userIds: string[] = [];
    return {
        name: "supabase",
        async createUser() {
            const email = `contract-${crypto.randomUUID()}@research-canvas.test`;
            const password = `Contract-${crypto.randomUUID()}`;
            const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
            assert.ifError(error);
            userIds.push(data.user!.id);
            return { id: data.user!.id, store: new SupabaseResearchStore(await signedInClient(env.url, env.publishableKey, email, password)) };
        },
        async cleanup() {
            for (const id of userIds) await admin.auth.admin.deleteUser(id);
        },
    };
}

export function adminClient(env: NonNullable<ReturnType<typeof supabaseTestEnv>>) {
    return plainClient(env.url, env.secretKey);
}

export async function signedInClient(url: string, key: string, email: string, password: string): Promise<SupabaseClient> {
    const auth = plainClient(url, key);
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    const token = data.session!.access_token;
    // 本地栈里 GoTrue 签发的 iat 偶尔比 PostgREST 的时钟快不到一秒，立刻使用会被拒（PGRST303 JWT issued at future）。
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return createClient(url, key, { accessToken: async () => token, auth: { persistSession: false, autoRefreshToken: false } });
}

function plainClient(url: string, key: string) {
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function required(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`缺少环境变量 ${name}`);
    return value;
}
