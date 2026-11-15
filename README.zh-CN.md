# claude-deepseek

用一条命令，让 Claude Code 接入 DeepSeek 官方 API 或兼容网关。

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

首次在终端运行时，先填写 API Base URL，再输入该地址对应的 API Key；Key 输入不会回显。例如接入 RPM：

```text
API Base URL [https://api.deepseek.com/anthropic]: https://rpm.tosky.io
API key for this endpoint: （输入 RPM API Key）
```

地址直接回车使用 DeepSeek 官方接口，此时填写 DeepSeek 官方 Key。地址与 Key 保存后，后续直接运行 `claude-deepseek` 即可，无需修改源码或重复填写。使用网关时填写 Anthropic 兼容基础地址，不包含 `/v1/messages`。

地址保存在 `~/.config/deepseek/claude_code_api_key.base_url`。官方 Key 沿用原文件，网关 Key 使用带地址哈希后缀的独立文件，权限均为 `600`；不同地址不会自动共用保存的 Key。`DEEPSEEK_KEY_FILE` 可指定这套文件的基础路径，`DEEPSEEK_BASE_URL_FILE` 可单独指定地址文件。原有官方 Key 无需迁移。

也可通过 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_API_KEY` 临时指定地址与 Key，它们优先于保存的配置，环境变量不会自动写入保存文件。非交互运行且没有保存地址时沿用官方端点；自动化接入网关需显式指定地址或先完成首次配置。

## 使用

```bash
claude-deepseek
claude-deepseek -p '你好' --max-turns 1
claude-deepseek --continue
DEEPSEEK_MODEL='deepseek-v4-pro[1m]' claude-deepseek
DEEPSEEK_BASE_URL=https://rpm.tosky.io claude-deepseek
```

官方端点主模型默认 `deepseek-flash[1m]`、effort 为 `max`、自动压缩窗口为 `786432`；自定义网关默认 `deepseek-flash`、`high`、`131072`，不默认宣称网关支持 1M 上下文。Haiku、小模型和子代理均默认 `deepseek-flash`。
可用 `DEEPSEEK_MODEL`、`DEEPSEEK_FAST_MODEL` 修改。
其他参数及默认值见 [英文说明](README.md#usage)。

启动器会将自己的 `--settings` 放在参数末尾，确保覆盖旧供应商配置。
项目规则、权限、hooks、MCP 仍可能加载；管理员托管策略仍有效。
原来的 `claude` 配置和登录保持不变；DeepSeek 的会话与记忆单独保存。

## 验证与密钥

退出旧会话，重新执行 `claude-deepseek`，输入 `/status`，确认 Base URL 与首次填写的地址一致（RPM 为 `https://rpm.tosky.io`），再发送一条消息。只验证 `--version` 不足以确认接入成功。

运行时生成的 `~/.claude-deepseek/deepseek-settings.json` 同样包含密钥，文件权限为
`600`、目录为 `700`，请将其视为密钥文件。仓库不包含任何实际密钥或个人配置。
使用不同密钥或端点并发启动时，请用不同的 `DEEPSEEK_CONFIG_DIR`。API 按所选服务商的规则计费。需要重新选择默认地址时，删除地址文件后交互启动；各地址的 Key 文件仍独立保存。

## 测试

```bash
bash -n bin/claude-deepseek install.sh
node --test test/launcher.test.mjs
```

回归测试使用模拟 CLI，不请求真实 API；覆盖旧配置冲突、密钥读取、文件权限、
模型映射、参数传递、安装备份与退出码，并通过伪终端检查首次填写地址与 Key、保存后复用，以及地址变更时的凭据隔离。CI 配置为 Linux 与 macOS；网关路径未在本次进行真实付费测试。

参考了 [claude-code-byob](https://github.com/sindecker/claude-code-byob) 的独立配置思路，
本仓库独立实现。MIT 开源；与 Anthropic、DeepSeek 无隶属关系。
