import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const launcher = fileURLToPath(new URL('../bin/claude-deepseek', import.meta.url));

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'claude-deepseek-test-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const bin = join(home, 'bin');
  mkdirSync(bin);
  mkdirSync(join(home, '.claude'));
  const original = JSON.stringify({env: {ANTHROPIC_BASE_URL: 'https://old.invalid', ANTHROPIC_AUTH_TOKEN: 'old-test-token'}});
  writeFileSync(join(home, '.claude/settings.json'), original);
  writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const i = args.lastIndexOf('--settings');
const settings = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));
const project = JSON.parse(fs.readFileSync(process.env.HOME + '/.claude/settings.json', 'utf8'));
const effective = {...process.env, ...project.env, ...settings.env};
console.log(JSON.stringify({args, settings, effective, config: process.env.CLAUDE_CONFIG_DIR}));
process.exit(Number(process.env.FAKE_CLAUDE_EXIT || 0));
`, {mode: 0o755});
  const env = {...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, DEEPSEEK_API_KEY: 'test-only-placeholder'};
  for (const key of Object.keys(env)) {
    if (/^DEEPSEEK_/.test(key) && key !== 'DEEPSEEK_API_KEY') delete env[key];
  }
  return {home, env, original, run(args = [], override = {}) {
    return spawnSync('bash', [launcher, ...args], {env: {...env, ...override}, cwd: home, encoding: 'utf8', input: ''});
  }};
}

test('explicit settings defeat conflicting project credentials without editing them', t => {
  const f = fixture(t);
  const r = f.run(['-p', 'hello world', '--settings', 'earlier.json']);
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.equal(data.effective.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic');
  assert.equal(data.effective.ANTHROPIC_AUTH_TOKEN, 'test-only-placeholder');
  assert.deepEqual(data.args.slice(0, 4), ['-p', 'hello world', '--settings', 'earlier.json']);
  assert.equal(data.args.at(-2), '--settings');
  assert.equal(data.config, join(f.home, '.claude-deepseek'));
  assert.equal(readFileSync(join(f.home, '.claude/settings.json'), 'utf8'), f.original);
  assert.equal(statSync(data.args.at(-1)).mode & 0o777, 0o600);
  assert.equal(statSync(data.config).mode & 0o777, 0o700);
  assert.ok(!r.stdout.includes('old-test-token'));
});

test('stored key supports missing final newline and CRLF', t => {
  const f = fixture(t);
  const keyFile = join(f.home, 'key');
  for (const value of ['stored-test-key', 'stored-test-key\r\n']) {
    writeFileSync(keyFile, value, {mode: 0o600});
    const r = f.run([], {DEEPSEEK_API_KEY: '', DEEPSEEK_KEY_FILE: keyFile});
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).settings.env.ANTHROPIC_AUTH_TOKEN, 'stored-test-key');
  }
});

test('missing key fails without starting Claude or creating settings', t => {
  const r = fixture(t).run([], {DEEPSEEK_API_KEY: ''});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /API key not found/);
  assert.equal(r.stdout, '');
});

test('custom models, key escaping, paths with spaces and auth conflicts', t => {
  const f = fixture(t);
  const key = 'test-only-"quoted"\\key';
  const r = f.run([], {
    DEEPSEEK_API_KEY: key, DEEPSEEK_MODEL: 'custom-main[1m]', DEEPSEEK_FAST_MODEL: 'custom-fast',
    DEEPSEEK_CONFIG_DIR: join(f.home, 'config with spaces'),
    ANTHROPIC_API_KEY: 'stale-key', CLAUDE_CODE_USE_BEDROCK: '1',
  });
  assert.equal(r.status, 0, r.stderr);
  const {settings, effective} = JSON.parse(r.stdout);
  assert.equal(settings.model, 'custom-main[1m]');
  assert.equal(effective.ANTHROPIC_AUTH_TOKEN, key);
  assert.equal(effective.ANTHROPIC_API_KEY, '');
  assert.equal(effective.CLAUDE_CODE_USE_BEDROCK, '');
  assert.equal(effective.ANTHROPIC_DEFAULT_OPUS_MODEL, 'custom-main[1m]');
  assert.equal(effective.ANTHROPIC_DEFAULT_SONNET_MODEL, 'custom-main[1m]');
  assert.equal(effective.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'custom-fast');
  assert.equal(effective.CLAUDE_CODE_SUBAGENT_MODEL, 'custom-fast');
});

test('Claude exit status passes through', t => {
  assert.equal(fixture(t).run([], {FAKE_CLAUDE_EXIT: '23'}).status, 23);
});

test('installer installs and preserves an existing launcher', t => {
  const f = fixture(t);
  const installer = resolve(launcher, '../../install.sh');
  const target = join(f.home, 'installed');
  mkdirSync(target);
  writeFileSync(join(target, 'claude-deepseek'), 'previous launcher');
  const r = spawnSync('bash', [installer], {env: {...f.env, INSTALL_DIR: target}, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(target, 'claude-deepseek'), 'utf8'), readFileSync(launcher, 'utf8'));
  assert.equal(statSync(join(target, 'claude-deepseek')).mode & 0o777, 0o755);
  assert.match(r.stdout, /backed up/);
});
