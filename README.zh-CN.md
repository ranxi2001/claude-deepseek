# claude-deepseek

用一条命令，让 Claude Code 直连 DeepSeek 官方 API。

[English](README.md) · [DeepSeek 官方接入文档](https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/claude_code/)

## 解决什么问题

只在 shell 中设置 `ANTHROPIC_BASE_URL` 和 token，可能被已有的用户或项目
`settings.json` 覆盖，导致仍请求旧中转站。本工具使用独立的 `CLAUDE_CONFIG_DIR`，
并通过命令行 `--settings` 固定 DeepSeek 地址、密钥和所有模型槽位。
无需部署代理，也不修改 Claude Code。

## 安装

需要 Bash、Node.js 18+ 和已安装的 `claude` 命令。默认启用资源限制，需要 Linux
cgroup v2、systemd 254+ 和可用的 systemd 用户管理器；正确配置后的 WSL 也可使用。
macOS 等不支持的环境需显式关闭资源保护，见下方说明。
已在 Linux、Claude Code 2.1.296 上完成真实 API 请求验证。

```bash
git clone https://github.com/ranxi2001/claude-deepseek.git
cd claude-deepseek
bash install.sh
claude-deepseek
```

默认安装到 `~/.local/bin`；已有同名启动器会先备份。安装脚本不会修改 shell
启动文件。如果目录尚未加入 PATH，脚本会提示。可用 `INSTALL_DIR` 指定安装目录。

首次运行时，按提示输入 DeepSeek 平台签发的 API Key，输入不会回显。
密钥保存在 `~/.config/deepseek/claude_code_api_key`，权限为 `600`。
也可通过环境变量 `DEEPSEEK_API_KEY` 提供，优先于密钥文件。

## 使用

```bash
claude-deepseek
claude-deepseek -p '你好' --max-turns 1
claude-deepseek --continue
DEEPSEEK_MODEL='deepseek-v4-pro[1m]' claude-deepseek
```

主模型默认 `deepseek-flash[1m]`；Haiku、小模型和子代理默认 `deepseek-flash`。
可用 `DEEPSEEK_MODEL`、`DEEPSEEK_FAST_MODEL` 修改。
其他参数及默认值见 [英文说明](README.md#usage)。

启动器会将自己的 `--settings` 放在参数末尾，确保覆盖旧供应商配置。
项目规则、权限、hooks、MCP 仍可能加载；管理员托管策略仍有效。
原来的 `claude` 配置和登录保持不变；DeepSeek 的会话与记忆单独保存。

## 内存、进程数量与递归启动保护

默认将每次启动放进独立的 systemd 用户 scope：**总内存上限 4 GiB、进程与线程
合计最多 256 个、禁止使用 swap**。Shell、原生程序、后台 Codex 任务及其编译进程
等普通子孙进程共享这一预算。限制覆盖整棵进程树，不只限制 JavaScript 堆。
内存耗尽触发 OOM 时，`OOMPolicy=kill` 会终止整个 scope。

无法建立 scope 时直接退出，不会自动退回无保护运行。可用
`systemctl --user status` 检查用户管理器。需要调整时：

```bash
DEEPSEEK_MEMORY_MAX=6G DEEPSEEK_TASKS_MAX=384 claude-deepseek
```

内存支持正整数字节数及 `K/M/G/T` 后缀，任务数支持正整数；拒绝 `0`、`infinity`。
独立启动的会话各有预算，多会话总和仍可能超出机器容量，需要控制并发会话数。
已有会话需要退出并重新启动，才能应用新的限制。

会话标记会被子进程继承：在会话内再次调用 `claude-deepseek` 会直接拒绝，以防
误递归启动。该检查不阻止其他代理命令，但普通子进程仍受同一个 scope 的资源
限制。这是运维保护，不是安全沙箱；有权限的程序仍可能主动切换 cgroup 或通过
服务管理器启动 scope 外的服务。

不支持资源限制的环境可显式使用 `DEEPSEEK_RESOURCE_LIMITS=0 claude-deepseek`，
此时会警告，且**没有内存和进程数保护**，防嵌套启动检查仍保留。

## 验证与密钥

退出旧会话，重新执行 `claude-deepseek`，输入 `/status`，确认 Base URL 为
`https://api.deepseek.com/anthropic`，再发送一条消息。只验证 `--version` 不足以确认接入成功。

运行时生成的 `~/.claude-deepseek/deepseek-settings.json` 同样包含密钥，文件权限为
`600`、目录为 `700`，请将其视为密钥文件。仓库不包含任何实际密钥或个人配置。
使用不同密钥并发启动时，请用不同的 `DEEPSEEK_CONFIG_DIR`。API 按 DeepSeek 规则计费。

## 测试

```bash
bash -n bin/claude-deepseek install.sh
node --test test/launcher.test.mjs
# 可选：在 Linux 上验证真实 cgroup 限制（需要可用的 systemd 用户管理器）
CLAUDE_DEEPSEEK_INTEGRATION=1 node --test test/launcher.test.mjs
```

回归测试使用模拟 CLI，不请求真实 API；覆盖旧配置冲突、密钥读取、文件权限、
模型映射、参数传递、安装备份与退出码。CI 配置为 Linux 与 macOS。
另覆盖防嵌套启动、scope 参数、显式关闭保护以及限制失败时禁止无保护启动。
可选集成测试验证子进程继承实际限制、96 MiB 内存上限下的 OOM 终止，以及达到
8 个任务后拒绝创建更多进程；全部使用模拟 Claude，不调用真实 API。

参考了 [claude-code-byob](https://github.com/sindecker/claude-code-byob) 的独立配置思路，
本仓库独立实现。MIT 开源；与 Anthropic、DeepSeek 无隶属关系。
