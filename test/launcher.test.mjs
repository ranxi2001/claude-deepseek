import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync, existsSync, readdirSync} from 'node:fs';
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

test('custom endpoint overrides stale project settings with gateway defaults', t => {
  const f = fixture(t);
  const r = f.run([], {DEEPSEEK_BASE_URL: 'https://rpm.tosky.io/'});
  assert.equal(r.status, 0, r.stderr);
  const {effective} = JSON.parse(r.stdout);
  assert.equal(effective.ANTHROPIC_BASE_URL, 'https://rpm.tosky.io');
  assert.equal(effective.ANTHROPIC_MODEL, 'deepseek-flash');
  assert.equal(effective.CLAUDE_CODE_EFFORT_LEVEL, 'high');
  assert.equal(effective.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '131072');
  assert.equal(existsSync(join(f.home, '.config/deepseek/claude_code_api_key.base_url')), false);
});

test('a custom endpoint cannot reuse an existing official key', t => {
  const f = fixture(t);
  const keyFile = join(f.home, 'old-key');
  writeFileSync(keyFile, 'official-test-only-key', {mode: 0o600});
  const r = f.run([], {DEEPSEEK_API_KEY: '', DEEPSEEK_BASE_URL: 'https://rpm.tosky.io', DEEPSEEK_KEY_FILE: keyFile});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /API key not found for this endpoint/);
  assert.equal(r.stdout, '');
  assert.equal(readFileSync(keyFile, 'utf8'), 'official-test-only-key');
});

test('invalid endpoint is rejected before Claude starts or credentials are saved', t => {
  const f = fixture(t);
  for (const url of ['not-a-url', 'http://gateway.example', 'https://user:password@example.com', 'https://gateway.example/?key=secret', 'https://gateway.example/#fragment', 'https://gateway.example/\npath']) {
    const r = f.run([], {DEEPSEEK_BASE_URL: url});
    assert.equal(r.status, 1, url);
    assert.match(r.stderr, /Invalid API Base URL/);
    assert.equal(r.stdout, '');
    assert.equal(existsSync(join(f.home, '.claude-deepseek/deepseek-settings.json')), false);
  }
  assert.equal(f.run([], {DEEPSEEK_BASE_URL: 'http://127.0.0.1:8080'}).status, 0);
});

test('first interactive launch saves the URL and endpoint key for later launches', t => {
  const f = fixture(t);
  // A PTY exercises the real prompts and hidden key input on both CI platforms.
  const driver = `import os,pty,select,subprocess,sys,time
master,slave=pty.openpty()
child=subprocess.Popen(['bash',sys.argv[1]],stdin=slave,stdout=subprocess.PIPE,stderr=slave,text=True)
os.close(slave)
pending=[(b'API Base URL [',b'https://rpm.tosky.io/\\n'),(b'API key for this endpoint: ',b'gateway-test-only-key\\n')]
seen=b''
deadline=time.monotonic()+15
try:
 while pending:
  if time.monotonic()>deadline:raise RuntimeError('prompt timeout')
  ready,_,_=select.select([master],[],[],0.2)
  if not ready:continue
  seen+=os.read(master,4096)
  if pending[0][0] in seen:
   _,answer=pending.pop(0);os.write(master,answer);seen=b''
 out,_=child.communicate(timeout=15)
 if child.returncode:raise RuntimeError('launcher failed')
 sys.stdout.write(out)
finally:
 if child.poll() is None:child.kill();child.wait()
 os.close(master)
`;
  const first = spawnSync('python3', ['-c', driver, launcher], {env: {...f.env, DEEPSEEK_API_KEY: ''}, cwd: f.home, encoding: 'utf8', timeout: 35000});
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).effective.ANTHROPIC_BASE_URL, 'https://rpm.tosky.io');
  const dir = join(f.home, '.config/deepseek');
  const addressFile = join(dir, 'claude_code_api_key.base_url');
  assert.equal(readFileSync(addressFile, 'utf8'), 'https://rpm.tosky.io\n');
  assert.equal(statSync(addressFile).mode & 0o777, 0o600);
  const keys = readdirSync(dir).filter(name => /claude_code_api_key\.[a-f0-9]{64}$/.test(name));
  assert.equal(keys.length, 1);
  assert.equal(statSync(join(dir, keys[0])).mode & 0o777, 0o600);
  const again = f.run([], {DEEPSEEK_API_KEY: ''});
  assert.equal(again.status, 0, again.stderr);
  const {effective} = JSON.parse(again.stdout);
  assert.equal(effective.ANTHROPIC_BASE_URL, 'https://rpm.tosky.io');
  assert.equal(effective.ANTHROPIC_AUTH_TOKEN, 'gateway-test-only-key');
  const other = f.run([], {DEEPSEEK_API_KEY: '', DEEPSEEK_BASE_URL: 'https://another.invalid'});
  assert.equal(other.status, 1);
  assert.equal(other.stdout, '');
});
