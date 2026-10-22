# claude-deepseek

Run Claude Code against DeepSeek's official Anthropic-compatible API with one command.

[中文说明](README.zh-CN.md) · [DeepSeek setup guide](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)

The launcher sets every model slot, keeps a separate Claude configuration directory,
and supplies an explicit `--settings` file. This fixes the case where an existing
user or project `settings.json` silently overrides shell exports and routes requests
back to an old gateway. No local proxy or Claude Code patch is needed.

## Install

Requires Bash, Node.js 18+, and an installed `claude` command. Intended for Linux,
macOS, and WSL. The real API smoke test was run on Linux with Claude Code 2.1.296.

```bash
git clone https://github.com/ranxi2001/claude-deepseek.git
cd claude-deepseek
bash install.sh
claude-deepseek
```

The installer uses `~/.local/bin` and backs up an existing launcher. It prints a
PATH reminder if needed; it does not modify shell startup files. Override the
destination with `INSTALL_DIR=/your/bin bash install.sh`.

On first interactive launch, enter a key issued by the DeepSeek platform. Input
is hidden and is saved to `~/.config/deepseek/claude_code_api_key` with mode `600`.
Alternatively, provide `DEEPSEEK_API_KEY` through your environment or secret manager.
The launcher never reuses an existing Anthropic/gateway token as a DeepSeek key.

## Usage

```bash
claude-deepseek
claude-deepseek -p 'Reply with hello' --max-turns 1
claude-deepseek --continue
DEEPSEEK_MODEL='deepseek-v4-pro[1m]' claude-deepseek
```

| Variable | Default |
| --- | --- |
| `DEEPSEEK_API_KEY` | Read from key file or prompt |
| `DEEPSEEK_MODEL` | `deepseek-flash[1m]` |
| `DEEPSEEK_FAST_MODEL` | `deepseek-flash` (Haiku, small/fast, subagents) |
| `DEEPSEEK_EFFORT_LEVEL` | `max` |
| `DEEPSEEK_AUTO_COMPACT_WINDOW` | `786432` |
| `DEEPSEEK_CONFIG_DIR` | `~/.claude-deepseek` |
| `DEEPSEEK_KEY_FILE` | `~/.config/deepseek/claude_code_api_key` |

The endpoint is fixed to `https://api.deepseek.com/anthropic`. Normal Claude
arguments pass through; the launcher's provider `--settings` is appended last.
An earlier `--settings` cannot replace this provider configuration. Use the
environment variables above to change provider defaults. Explicit `--model`
still selects the session model. Administrative managed policies still apply.

The original Claude settings and login are left untouched. DeepSeek conversations
and memory live in the separate configuration directory, so `--continue` resumes
a DeepSeek session. Existing project permissions, hooks, MCP configuration and
rules may still load; only the provider fields are pinned. This is not a sandbox.

## Credentials and verification

The generated `~/.claude-deepseek/deepseek-settings.json` also contains the active
key and has mode `600`; its directory has mode `700`. The file is generated locally,
never shipped with the repository, and refreshed at each launch. Treat it as a
secret. Concurrent launches with different keys should use distinct
`DEEPSEEK_CONFIG_DIR` values. API requests are billed by DeepSeek.

Exit any old Claude session before relaunching. In the new session run `/status`
and check that the base URL is `https://api.deepseek.com/anthropic`, then send a
short message. A successful `--version` alone does not verify API routing.

To rotate a saved key, replace the key file securely or provide `DEEPSEEK_API_KEY`.
To uninstall, remove the installed launcher; remove the key and configuration
directory separately only if you no longer need their credentials and sessions.

## Development

```bash
bash -n bin/claude-deepseek install.sh
node --test test/launcher.test.mjs
```

Tests use a mock Claude CLI and temporary home directories. They make no API calls.
CI runs on Linux and macOS. The mock tests verify settings precedence, argument
forwarding, key-file handling, permissions, model mapping, installation and exit codes.

Inspired by the isolated configuration approach in
[sindecker/claude-code-byob](https://github.com/sindecker/claude-code-byob) and
[Claude Code's gateway settings documentation](https://code.claude.com/docs/en/llm-gateway-connect).
Implementation and regression tests in this repository are independent.

MIT licensed. Not affiliated with Anthropic or DeepSeek.
