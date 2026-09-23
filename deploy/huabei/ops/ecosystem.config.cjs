// pm2 进程定义。每次 deploy.sh 都会从新 bundle 覆盖这份文件并以 --update-env 重新加载，
// 所以 GIT_SHA 等值总是从当前 release 读取。
const fs = require("node:fs");
const path = require("node:path");

const home = process.env.CORESEARCH_HOME || "/root/data/zmj/coresearch";
const current = path.join(home, "current");
const read = (file) => {
  try {
    return fs.readFileSync(path.join(current, file), "utf8").trim();
  } catch {
    return "unknown";
  }
};

const apps = [
  {
    name: "agent-api",
    cwd: current,
    script: "dist/index.js",
    // --env-file 不覆盖已存在的环境变量，所以下面 env 里的值优先于密钥文件里的同名项。
    node_args: `--env-file=${path.join(home, "secrets/agent-api.env")}`,
    env: {
      NODE_ENV: "production",
      GIT_SHA: read("VERSION"),
      APP_VERSION: read("APP_VERSION"),
      PI_AGENT_DIR: path.join(home, "data/pi"),
    },
    time: true,
    restart_delay: 3000,
    max_restarts: 10,
  },
  {
    name: "updater",
    script: path.join(home, "bin/updater.sh"),
    interpreter: "bash",
    env: { CORESEARCH_HOME: home },
    time: true,
    restart_delay: 10000,
  },
];

const tunnelConfig = path.join(home, "secrets/cloudflared/config.yml");
if (fs.existsSync(tunnelConfig)) {
  apps.push({
    name: "cloudflared",
    script: path.join(home, "bin/cloudflared"),
    args: ["tunnel", "--no-autoupdate", "--config", tunnelConfig, "run"],
    interpreter: "none",
    time: true,
    restart_delay: 5000,
  });
}

module.exports = { apps };
