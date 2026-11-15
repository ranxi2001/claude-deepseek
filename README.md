# claude-deepseek

Run Claude Code against DeepSeek's official Anthropic-compatible API or a compatible gateway with one command.

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

On first interactive launch, enter the API Base URL, then the key issued by that endpoint. For RPM:

```text
API Base URL [https://api.deepseek.com/anthropic]: https://rpm.tosky.io
API key for this endpoint: (enter your RPM key)
```

Press Enter at the URL prompt to use the official DeepSeek endpoint and its official key. Both inputs are remembered, and key input is hidden. Use an Anthropic-compatible base address without `/v1/messages`; no source edit is required.

The URL is saved to `~/.config/deepseek/claude_code_api_key.base_url`. The official key keeps its existing filename; custom endpoints use independent key files with an address-hash suffix. Files have mode `600`. `DEEPSEEK_KEY_FILE` changes this base path, and `DEEPSEEK_BASE_URL_FILE` can override the address-file path. Saved keys are never reused for another endpoint.

`DEEPSEEK_BASE_URL` and `DEEPSEEK_API_KEY` override saved configuration for a launch without persisting the environment values. Non-interactive launches without a saved or explicit URL keep the official endpoint for backward compatibility. Gateway automation must set the URL explicitly or use a previously configured address.

## Usage

```bash
claude-deepseek
claude-deepseek -p 'Reply with hello' --max-turns 1
claude-deepseek --continue
DEEPSEEK_MODEL='deepseek-v4-pro[1m]' claude-deepseek
DEEPSEEK_BASE_URL=https://rpm.tosky.io claude-deepseek
```

| Variable | Default |
| --- | --- |
| `DEEPSEEK_API_KEY` | Read from key file or prompt |
| `DEEPSEEK_BASE_URL` | Saved URL or prompt; official endpoint if unattended and unset |
| `DEEPSEEK_BASE_URL_FILE` | `<DEEPSEEK_KEY_FILE>.base_url` |
| `DEEPSEEK_MODEL` | Official: `deepseek-flash[1m]`; gateway: `deepseek-flash` |
| `DEEPSEEK_FAST_MODEL` | `deepseek-flash` (Haiku, small/fast, subagents) |
| `DEEPSEEK_EFFORT_LEVEL` | Official: `max`; gateway: `high` |
| `DEEPSEEK_AUTO_COMPACT_WINDOW` | Official: `786432`; gateway: `131072` |
| `DEEPSEEK_CONFIG_DIR` | `~/.claude-deepseek` |
| `DEEPSEEK_KEY_FILE` | `~/.config/deepseek/claude_code_api_key` (custom endpoints append an address hash) |

The official default endpoint is `https://api.deepseek.com/anthropic`. Normal Claude
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
`DEEPSEEK_CONFIG_DIR` values. Different endpoints also need distinct configuration directories when launched concurrently. API requests are billed by the selected provider.

Exit any old Claude session before relaunching. In the new session run `/status`
and check that the base URL matches the address you configured, then send a
short message. A successful `--version` alone does not verify API routing.

To choose a new default endpoint, remove the address file and launch interactively again. Existing endpoint keys remain isolated. To rotate a saved key, replace the matching endpoint key file securely or provide `DEEPSEEK_API_KEY`.
To uninstall, remove the installed launcher; remove the key and configuration
directory separately only if you no longer need their credentials and sessions.

## Development

```bash
bash -n bin/claude-deepseek install.sh
node --test test/launcher.test.mjs
```

Tests use a mock Claude CLI and temporary home directories. They make no API calls.
CI runs on Linux and macOS. The mock tests verify settings precedence, argument
forwarding, key-file handling, permissions, model mapping, installation and exit codes. A pseudo-terminal test exercises first-run URL/key prompts and reuse; other cases cover URL validation and cross-endpoint credential isolation. No live gateway inference test is implied.

Inspired by the isolated configuration approach in
[sindecker/claude-code-byob](https://github.com/sindecker/claude-code-byob) and
[Claude Code's gateway settings documentation](https://code.claude.com/docs/en/llm-gateway-connect).
Implementation and regression tests in this repository are independent.

MIT licensed. Not affiliated with Anthropic or DeepSeek.
