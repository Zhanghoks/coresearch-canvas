import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "./errors.js";

export const INVITE_INVALID = "邀请码无效";
const NICKNAME_PATTERN = /^[a-z0-9._-]+$/;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 10;

export type RegisterInviteInput = {
    inviteCode: unknown;
    nickname: unknown;
    password: unknown;
};

export class InviteRateLimiter {
    private readonly hits = new Map<string, number[]>();

    constructor(
        private readonly windowMs = RATE_WINDOW_MS,
        private readonly max = RATE_MAX,
    ) {}

    consume(key: string) {
        const now = Date.now();
        const recent = (this.hits.get(key) || []).filter((at) => now - at < this.windowMs);
        if (recent.length >= this.max) throw new AppError("请求过于频繁，请稍后再试", 429, "rate_limited");
        recent.push(now);
        this.hits.set(key, recent);
    }
}

export function normalizeInviteCode(value: unknown) {
    if (typeof value !== "string") throw new AppError(INVITE_INVALID, 400, "invalid_invite");
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8) throw new AppError(INVITE_INVALID, 400, "invalid_invite");
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function nicknameEmail(value: unknown) {
    if (typeof value !== "string") throw new AppError("请填写昵称", 400, "invalid_input");
    const nickname = value.trim().toLowerCase();
    if (!nickname) throw new AppError("请填写昵称", 400, "invalid_input");
    if (!NICKNAME_PATTERN.test(nickname)) throw new AppError("昵称只能包含字母、数字、点、下划线或连字符", 400, "invalid_input");
    return { nickname, email: `${nickname}@research-canvas.test` };
}

export function requiredPassword(value: unknown) {
    if (typeof value !== "string" || value.length < 8) throw new AppError("密码至少 8 位", 400, "invalid_input");
    return value;
}

export function generateInviteCode() {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]);
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function createInviteAdmin(url: string, secretKey: string) {
    return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function insertInviteCode(admin: SupabaseClient, code = generateInviteCode(), expiresAt?: string) {
    const { error } = await admin.from("invite_codes").insert({ code, expires_at: expiresAt || null });
    if (error) throw new AppError("无法创建邀请码", 500, "invite_create_failed");
    return code;
}

export async function registerWithInvite(admin: SupabaseClient, input: RegisterInviteInput) {
    const code = normalizeInviteCode(input.inviteCode);
    const { nickname, email } = nicknameEmail(input.nickname);
    const password = requiredPassword(input.password);
    const invite = await readInvite(admin, code);
    if (!inviteUsable(invite)) throw new AppError(INVITE_INVALID, 400, "invalid_invite");

    const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { user_name: nickname, full_name: nickname },
    });
    if (created.error || !created.data.user) {
        const duplicate = created.error?.code === "email_exists" || created.error?.code === "user_already_exists";
        throw new AppError(duplicate ? "昵称已被使用" : "无法创建账号", duplicate ? 409 : 500, duplicate ? "nickname_taken" : "register_failed");
    }

    const userId = created.data.user.id;
    const { data, error } = await admin.from("invite_codes").update({ redeemed_at: new Date().toISOString(), redeemed_by: userId }).eq("code", code).is("redeemed_at", null).select("code");
    if (error || !data?.length) {
        await admin.auth.admin.deleteUser(userId);
        throw new AppError(INVITE_INVALID, 400, "invalid_invite");
    }
    return { userId, nickname, email };
}

async function readInvite(admin: SupabaseClient, code: string) {
    const { data, error } = await admin.from("invite_codes").select("code, expires_at, redeemed_at").eq("code", code).maybeSingle();
    if (error) throw new AppError(INVITE_INVALID, 400, "invalid_invite");
    return data as { code: string; expires_at: string | null; redeemed_at: string | null } | null;
}

function inviteUsable(invite: { expires_at: string | null; redeemed_at: string | null } | null) {
    if (!invite || invite.redeemed_at) return false;
    if (invite.expires_at && Date.parse(invite.expires_at) <= Date.now()) return false;
    return true;
}
