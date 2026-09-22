# CoResearch Codex / ZCode 插件

让 Codex / ZCode 打开并操作本仓库的 CoResearch 研究画布。安装路径目录名仍为 `infinite-canvas`（兼容已有 marketplace）；显示名为 CoResearch。

研究节点 Skill 权威源在 `../../canvas-agent/skills/`。修改后运行：

```bash
./scripts/sync-skills.sh
```

插件独有 Skill（`canvas`、`open-canvas`）不会被该脚本覆盖。

## 安装

### Codex

macOS / Linux：

```bash
git clone https://github.com/Zhanghoks/Research-canvas.git
cd Research-canvas
codex plugin marketplace add "$(pwd)"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows PowerShell：

```powershell
git clone https://github.com/Zhanghoks/Research-canvas.git
cd Research-canvas
codex plugin marketplace add "$PWD"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows CMD 将 `$PWD` 替换为 `%cd%`。

### ZCode

- 打开 **Settings → Plugin Management → Discover**，点击右上角 **`+`** 添加 marketplace。
- 选择 **本仓库目录**（`plugins/infinite-canvas`）或本仓库根目录，即可发现插件并安装。
- 或在 ZCode 界面直接以本地目录方式加载该插件目录。

安装后新建一个任务，然后输入：

```text
帮我打开并连接到 CoResearch
```
