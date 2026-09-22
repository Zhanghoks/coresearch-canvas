import { createInviteAdmin, generateInviteCode, insertInviteCode } from "../src/invite.js";

const url = required("SUPABASE_URL");
const secretKey = required("SUPABASE_SECRET_KEY");
const code = process.argv[2]?.trim() || generateInviteCode();
const created = await insertInviteCode(createInviteAdmin(url, secretKey), code);
console.log(created);

function required(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
        console.error(`缺少环境变量 ${name}`);
        process.exit(1);
    }
    return value;
}
