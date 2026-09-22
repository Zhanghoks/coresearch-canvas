import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "./errors.js";
import { InviteRateLimiter, nicknameEmail, normalizeInviteCode, requiredPassword } from "./invite.js";

test("邀请码忽略大小写和分隔符", () => {
    assert.equal(normalizeInviteCode("ab-cd-ef-gh"), "ABCD-EFGH");
    assert.equal(normalizeInviteCode("abcdefgh"), "ABCD-EFGH");
    assert.throws(() => normalizeInviteCode("short"), (error) => error instanceof AppError && error.code === "invalid_invite");
});

test("昵称映射到内部邮箱", () => {
    assert.deepEqual(nicknameEmail("Ada_1"), { nickname: "ada_1", email: "ada_1@research-canvas.test" });
    assert.throws(() => nicknameEmail("中文"), (error) => error instanceof AppError && error.code === "invalid_input");
});

test("密码至少 8 位", () => {
    assert.equal(requiredPassword("12345678"), "12345678");
    assert.throws(() => requiredPassword("1234567"), (error) => error instanceof AppError && error.code === "invalid_input");
});

test("同一 key 10 分钟最多注册 10 次", () => {
    const limiter = new InviteRateLimiter(60_000, 2);
    limiter.consume("1.1.1.1");
    limiter.consume("1.1.1.1");
    assert.throws(() => limiter.consume("1.1.1.1"), (error) => error instanceof AppError && error.code === "rate_limited");
    limiter.consume("2.2.2.2");
});
