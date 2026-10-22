import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync, existsSync} from 'node:fs';
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
  writeFileSync(join(bin, 'systemd-run'), `#!/usr/bin/env node
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2);
if (process.env.FAKE_SYSTEMD_FAIL) process.exit(71);
const i = args.indexOf('--');
const r = spawnSync(args[i + 1], args.slice(i + 2), {
  env: {...process.env, FAKE_SCOPE_ARGS: JSON.stringify(args.slice(0, i))}, stdio: 'inherit',
});
process.exit(r.status ?? 1);
`, {mode: 0o755});
  const env = {...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, DEEPSEEK_API_KEY: 'test-only-placeholder'};
  for (const key of Object.keys(env)) {
    if (/^DEEPSEEK_/.test(key) && key !== 'DEEPSEEK_API_KEY') delete env[key];
  }
  // Provider-only tests also run on macOS; resource tests opt in separately.
  env.DEEPSEEK_RESOURCE_LIMITS = '0';
  return {home, env, original, run(args = [], override = {}) {
    return spawnSync('bash', [launcher, ...args], {env: {...env, ...override}, cwd: home, encoding: 'utf8', input: '', timeout: 20000});
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

const hasCgroupV2 = existsSync('/sys/fs/cgroup/cgroup.controllers');

test('default resource protection wraps Claude and preserves literal arguments and exit status', {skip: !hasCgroupV2}, t => {
  const f = fixture(t);
  const r = f.run(['-p', '$HOME ${HOME} literal "quote"'], {DEEPSEEK_RESOURCE_LIMITS: undefined});
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  const options = JSON.parse(data.effective.FAKE_SCOPE_ARGS);
  for (const option of ['--user', '--scope', '--collect', '--expand-environment=no',
    '--property=MemoryMax=4G', '--property=MemorySwapMax=0', '--property=TasksMax=256', '--property=OOMPolicy=kill']) {
    assert.ok(options.includes(option), option);
  }
  assert.equal(data.args[1], '$HOME ${HOME} literal "quote"');
  assert.equal(data.effective.DEEPSEEK_SESSION_ACTIVE, '1');
  assert.ok(!options.some(option => option.includes('test-only-placeholder')));
  assert.equal(f.run([], {DEEPSEEK_RESOURCE_LIMITS: '1', FAKE_CLAUDE_EXIT: '23'}).status, 23);
});

test('custom resource limits reach systemd and failure never starts unprotected Claude', {skip: !hasCgroupV2}, t => {
  const f = fixture(t);
  const r = f.run([], {DEEPSEEK_RESOURCE_LIMITS: '1', DEEPSEEK_MEMORY_MAX: '2G', DEEPSEEK_TASKS_MAX: '64'});
  assert.equal(r.status, 0, r.stderr);
  const options = JSON.parse(JSON.parse(r.stdout).effective.FAKE_SCOPE_ARGS);
  assert.ok(options.includes('--property=MemoryMax=2G'));
  assert.ok(options.includes('--property=TasksMax=64'));
  const failed = f.run([], {DEEPSEEK_RESOURCE_LIMITS: '1', FAKE_SYSTEMD_FAIL: '1'});
  assert.equal(failed.status, 71);
  assert.equal(failed.stdout, '');
});

test('invalid or unbounded resource limits fail before starting Claude', t => {
  const f = fixture(t);
  for (const override of [
    {DEEPSEEK_MEMORY_MAX: '0'}, {DEEPSEEK_MEMORY_MAX: 'infinity'},
    {DEEPSEEK_MEMORY_MAX: '50%'}, {DEEPSEEK_TASKS_MAX: '0'},
    {DEEPSEEK_TASKS_MAX: 'infinity'}, {DEEPSEEK_RESOURCE_LIMITS: 'auto'},
  ]) {
    const r = f.run([], {DEEPSEEK_RESOURCE_LIMITS: '1', ...override});
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /Invalid resource limits|must be 1 or 0/);
  }
});

test('explicit opt out warns but still rejects nested launcher calls', t => {
  const f = fixture(t);
  const r = f.run([], {FAKE_SYSTEMD_FAIL: '1'});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /limits explicitly disabled/);
  writeFileSync(join(f.home, 'bin/claude'), `#!/usr/bin/env bash\nexec bash "$TEST_LAUNCHER"\n`, {mode: 0o755});
  const nested = f.run([], {TEST_LAUNCHER: launcher});
  assert.equal(nested.status, 1);
  assert.match(nested.stderr, /Refusing nested/);
  assert.equal(nested.stdout, '');
});

test('real cgroup applies memory and task caps to native descendants', {
  skip: process.env.CLAUDE_DEEPSEEK_INTEGRATION !== '1' || !hasCgroupV2,
}, t => {
  const f = fixture(t);
  rmSync(join(f.home, 'bin/systemd-run'));
  writeFileSync(join(f.home, 'bin/claude'), `#!/usr/bin/env python3
import json, pathlib, subprocess
code = 'import pathlib,json; cg=pathlib.Path("/sys/fs/cgroup" + pathlib.Path("/proc/self/cgroup").read_text().strip().split("::",1)[1]); print(json.dumps({k:(cg/k).read_text().strip() for k in ["memory.max","memory.swap.max","pids.max","memory.oom.group"]}))'
subprocess.run(['python3', '-c', code], check=True)
`, {mode: 0o755});
  const r = f.run([], {DEEPSEEK_RESOURCE_LIMITS: '1', DEEPSEEK_MEMORY_MAX: '128M', DEEPSEEK_TASKS_MAX: '16'});
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {'memory.max': '134217728', 'memory.swap.max': '0', 'pids.max': '16', 'memory.oom.group': '1'});
});

test('real cgroup OOM kills the session and its child without exhausting the host', {
  skip: process.env.CLAUDE_DEEPSEEK_INTEGRATION !== '1' || !hasCgroupV2,
}, t => {
  const f = fixture(t);
  rmSync(join(f.home, 'bin/systemd-run'));
  writeFileSync(join(f.home, 'bin/claude'), `#!/usr/bin/env python3
import subprocess, pathlib
pathlib.Path('started').touch()
subprocess.run(['python3', '-c', 'x=bytearray(192*1024*1024)'], check=True)
pathlib.Path('survived').touch()
`, {mode: 0o755});
  const r = f.run([], {DEEPSEEK_RESOURCE_LIMITS: '1', DEEPSEEK_MEMORY_MAX: '96M', DEEPSEEK_TASKS_MAX: '16'});
  assert.ok(r.status === 137 || r.signal === 'SIGKILL', JSON.stringify({status: r.status, signal: r.signal, stderr: r.stderr}));
  assert.ok(existsSync(join(f.home, 'started')));
  assert.ok(!existsSync(join(f.home, 'survived')));
});

test('real cgroup rejects additional native processes at the task cap', {
  skip: process.env.CLAUDE_DEEPSEEK_INTEGRATION !== '1' || !hasCgroupV2,
}, t => {
  const f = fixture(t);
  rmSync(join(f.home, 'bin/systemd-run'));
  writeFileSync(join(f.home, 'bin/claude'), `#!/usr/bin/env python3
import subprocess, pathlib, json, errno
children = []
blocked = False
try:
    for _ in range(16):
        try:
            children.append(subprocess.Popen(['python3', '-c', 'import time; time.sleep(10)']))
        except OSError as e:
            if e.errno != errno.EAGAIN: raise
            blocked = True
            break
    print(json.dumps({'blocked': blocked, 'children': len(children)}))
finally:
    for child in children: child.terminate()
    for child in children: child.wait()
`, {mode: 0o755});
  const r = f.run([], {DEEPSEEK_RESOURCE_LIMITS: '1', DEEPSEEK_MEMORY_MAX: '256M', DEEPSEEK_TASKS_MAX: '8'});
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.blocked, true);
  assert.ok(result.children > 0 && result.children < 8);
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
