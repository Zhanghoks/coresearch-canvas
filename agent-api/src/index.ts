import { createApp } from "./app.js";
import { provisionBuiltinTestAccount } from "./builtin-test-account.js";
import { loadConfig } from "./config.js";
import { reconcileOrphanRuns } from "./reconcile-runs.js";

const config = loadConfig();
// 内置 test 账号会把固定弱密码重置回去，只在 CI 和本地验收里开启，生产环境不要设这个变量。
if (process.env.ENABLE_BUILTIN_TEST_ACCOUNT?.trim() === "1") {
    await provisionBuiltinTestAccount(config.supabaseUrl, config.supabaseSecretKey);
}
await reconcileOrphanRuns(config.supabaseUrl, config.supabaseSecretKey);
createApp(config).listen(config.port, () => {
    console.log(`Research Canvas Agent API listening on ${config.port}`);
});
