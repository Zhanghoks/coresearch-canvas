import { createApp } from "./app.js";
import { provisionBuiltinTestAccount } from "./builtin-test-account.js";
import { loadConfig } from "./config.js";
import { reconcileOrphanRuns } from "./reconcile-runs.js";

const config = loadConfig();
// 内置 test 账号会把固定弱密码重置回去，只在 CI 和本地验收里开启，生产环境不要设这个变量。
if (process.env.ENABLE_BUILTIN_TEST_ACCOUNT?.trim() === "1") {
    await provisionBuiltinTestAccount(config.supabaseUrl, config.supabaseSecretKey);
}
// reconcile 失败（例如 Supabase 暂时不可达）不应阻止服务启动：残留的 running run 只影响对应对话，下次重启会再收尾。
// 注意它假设单实例部署：多实例时会把其他实例上仍在运行的 run 也标记为失败。
await reconcileOrphanRuns(config.supabaseUrl, config.supabaseSecretKey).catch((error) => {
    console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), event: "reconcile_failed", error: error instanceof Error ? error.message : String(error) }));
});
createApp(config).listen(config.port, () => {
    console.log(`Research Canvas Agent API listening on ${config.port}`);
});
