/**
 * The shared copy's sync (scripts/remote-sync.mjs --once): downloads the vault with the token, unlocks it into data/app,
 * refuses a wrong passphrase without touching the old data, explains a refused token, and never sends the token to
 * any host but GitHub. A local server stands in for GitHub; nothing leaves this computer.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'remote-sync.mjs');
const PASS = 'correct horse battery staple';
const TOKEN = 'test-token-not-real';
let server, port, vaultBuf, seen;
const dirs = [];

before(async () => {
  const { seal } = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'vault.mjs')).href);
  vaultBuf = seal(
    [{ path: 'data/app/search_terms.json', data: Buffer.from('[{"term":"ivory county price"}]') }, { path: 'data/app/settings.json', data: Buffer.from('{}') }],
    PASS, 'data', { kdf: { N: 2 ** 10, r: 8, p: 1 }, savedAt: '2026-11-20T09:00:00.000Z' },
  );
  server = http.createServer((req, res) => {
    seen = { url: req.url, auth: req.headers.authorization, accept: req.headers.accept };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end(); }
    if (req.url !== '/repos/owner/str-qc/contents/vault/data.qcvault') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(vaultBuf);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => {
  server.close();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function setup({ pass = PASS, token = TOKEN, api } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-sync-'));
  dirs.push(root);
  fs.writeFileSync(path.join(root, 'token'), `${token}\n`);
  fs.writeFileSync(path.join(root, 'pass'), `${pass}\n`);
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    QC_REPO: 'owner/str-qc', QC_ROOT: root, QC_GITHUB_API: api ?? `http://127.0.0.1:${port}`,
    QC_TOKEN_FILE: path.join(root, 'token'), QC_PASSPHRASE_FILE: path.join(root, 'pass'),
  };
  const run = () => new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, '--once'], { env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (code) => resolve({ code, out }));
  });
  return { root, run };
}

test('downloads with the token and unlocks into data/app', async () => {
  const { root, run } = setup();
  const r = await run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /setup check passed/);
  assert.equal(seen.accept, 'application/vnd.github.raw');
  assert.equal(fs.readFileSync(path.join(root, 'data', 'app', 'search_terms.json'), 'utf8'), '[{"term":"ivory county price"}]');
  assert.ok(!r.out.includes(TOKEN) && !r.out.includes(PASS), 'secrets are never printed');
  assert.deepEqual(fs.readdirSync(path.join(root, 'data')), ['app'], 'no staging folder is left behind');
});

test('a wrong passphrase stops and leaves the old data as it was', async () => {
  const { root, run } = setup({ pass: 'not the passphrase at all' });
  fs.mkdirSync(path.join(root, 'data', 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'app', 'keep.json'), '1');
  const r = await run();
  assert.equal(r.code, 1);
  assert.match(r.out, /could not unlock/);
  assert.ok(!r.out.includes('not the passphrase at all'));
  assert.equal(fs.readFileSync(path.join(root, 'data', 'app', 'keep.json'), 'utf8'), '1');
});

test('a refused token is explained', async () => {
  const r = await setup({ token: 'wrong-token-zz9' }).run();
  assert.equal(r.code, 1);
  assert.match(r.out, /GitHub refused the token \(401\)/);
  assert.ok(!r.out.includes('wrong-token-zz9'));
});

test('the token is only ever sent to GitHub', async () => {
  for (const api of ['https://evil.example.com', 'http://localhost:9', 'http://127.0.0.1.evil.com:80']) {
    seen = null;
    const r = await setup({ api }).run();
    assert.equal(r.code, 1, api);
    assert.match(r.out, /QC_GITHUB_API must be https:\/\/api\.github\.com/);
    assert.equal(seen, null);
  }
});
