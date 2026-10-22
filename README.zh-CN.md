# claude-deepseek

用一条命令，让 Claude Code 直连 DeepSeek 官方 API。

[English](README.md) · [DeepSeek 官方接入文档](https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/claude_code/)

## 解决什么问题

只在 shell 中设置 `ANTHROPIC_BASE_URL` 和 token，可能被已有的用户或项目
`settings.json` 覆盖，导致仍请求旧中转站。本工具使用独立的 `CLAUDE_CONFIG_DIR`，
并通过命令行 `--settings` 固定 DeepSeek 地址、密钥和所有模型槽位。
无需部署代理，也不修改 Claude Code。

## 安装

需要 Bash、Node.js 18+ 和已安装的 `claude` 命令。适用于 Linux、macOS、WSL。
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
```

回归测试使用模拟 CLI，不请求真实 API；覆盖旧配置冲突、密钥读取、文件权限、
模型映射、参数传递、安装备份与退出码。CI 配置为 Linux 与 macOS。

参考了 [claude-code-byob](https://github.com/sindecker/claude-code-byob) 的独立配置思路，
本仓库独立实现。MIT 开源；与 Anthropic、DeepSeek 无隶属关系。
