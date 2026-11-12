/**
 * The encrypted vault (scripts/vault.mjs): round trip, wrong passphrase, tampering, unsafe paths, the
 * save/open state machine, and that nothing readable ever lands in the vault file. Runs on throwaway folders
 * with a lowered scrypt cost so the suite stays fast; the real files use N=2^17.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const VAULT = pathToFileURL(path.join(__dirname, '..', 'scripts', 'vault.mjs')).href;
const FAST = { kdf: { N: 2 ** 10, r: 8, p: 1 } };
const PASS = 'correct horse battery staple';
const made = [];
const realMkdtemp = fs.mkdtempSync;
fs.mkdtempSync = (prefix, ...rest) => {
  const dir = realMkdtemp(prefix, ...rest);
  if (prefix.startsWith(os.tmpdir())) made.push(dir);
  return dir;
};
after(() => {
  fs.mkdtempSync = realMkdtemp;
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-vault-'));
  const put = (rel, text) => {
    const p = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  };
  put('data/app/search_terms.json', JSON.stringify([{ day: '2026-11-05', term: 'ivory county price', cost: 812.5 }]));
  put('data/app/settings.json', JSON.stringify({ agency_sheet_id: 'SECRET-SHEET-ID-should-never-be-readable' }));
  put('data/app/sub/deep.json', '{"ok":true}');
  return { root, put };
}

test('save then open on a fresh copy gives back every file, byte for byte', async () => {
  const V = await import(VAULT);
  const a = tempRepo();
  const r = V.saveBundle(a.root, 'data', PASS, FAST);
  assert.equal(r.saved, true);
  assert.equal(r.files, 3);

  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-vault-b-'));
  fs.mkdirSync(path.join(b, 'vault'));
  fs.copyFileSync(path.join(a.root, 'vault', 'data.qcvault'), path.join(b, 'vault', 'data.qcvault'));
  const o = V.openBundle(b, 'data', PASS);
  assert.equal(o.opened, true);
  assert.deepEqual(o.placed, ['data/app']);
  for (const rel of ['data/app/search_terms.json', 'data/app/settings.json', 'data/app/sub/deep.json']) {
    assert.deepEqual(fs.readFileSync(path.join(b, ...rel.split('/'))), fs.readFileSync(path.join(a.root, ...rel.split('/'))), rel);
  }
  const s = V.bundleStatus(b, 'data');
  assert.equal(s.vaultChanged, false);
  assert.equal(s.localChanged, false, 'a fresh open is in step with the vault');
  assert.equal(fs.readdirSync(b).some((n) => n.startsWith('.vault-restore-')), false, 'the staging folder is removed');
});

test('the vault file never contains readable data', async () => {
  const V = await import(VAULT);
  const a = tempRepo();
  V.saveBundle(a.root, 'data', PASS, FAST);
  const raw = fs.readFileSync(path.join(a.root, 'vault', 'data.qcvault'));
  for (const needle of ['SECRET-SHEET-ID', 'ivory county price', 'search_terms', 'settings.json', '812.5']) {
    assert.equal(raw.includes(Buffer.from(needle)), false, `"${needle}" must not be visible in the vault file`);
  }
  const { header } = V.readHeader(raw);
  assert.equal(header.bundle, 'data');
  assert.equal(header.cipher.name, 'aes-256-gcm');
});

test('a wrong passphrase fails without touching the disk', async () => {
  const V = await import(VAULT);
  const a = tempRepo();
  V.saveBundle(a.root, 'data', PASS, FAST);
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-vault-c-'));
  fs.mkdirSync(path.join(b, 'vault'));
  fs.copyFileSync(path.join(a.root, 'vault', 'data.qcvault'), path.join(b, 'vault', 'data.qcvault'));
  assert.throws(() => V.openBundle(b, 'data', 'Correct horse battery staple'), (e) => e.code === 2 && /Wrong passphrase/.test(e.message));
  assert.equal(fs.existsSync(path.join(b, 'data')), false, 'nothing written');
  assert.equal(V.checkPassphrase(b, 'data', 'nope nope nope'), false);
  assert.equal(V.checkPassphrase(b, 'data', PASS), true);
});

test('changing any byte, including the plain header, is detected', async () => {
  const V = await import(VAULT);
  const a = tempRepo();
  V.saveBundle(a.root, 'data', PASS, FAST);
  const good = fs.readFileSync(path.join(a.root, 'vault', 'data.qcvault'));
  const { headerEnd } = V.readHeader(good);
  // a byte in the header (savedAt digit), one in the middle of the ciphertext, and one in the tag
  const savedAtAt = good.indexOf(Buffer.from('"savedAt":"')) + 13;
  for (const at of [savedAtAt, headerEnd + Math.floor((good.length - headerEnd) / 2), good.length - 3]) {
    const bad = Buffer.from(good);
    bad[at] ^= 0x01;
    assert.throws(() => V.unseal(bad, PASS, 'data'), (e) => e.code === 2, `flip at ${at}`);
  }
  assert.throws(() => V.unseal(good, PASS, 'archive'), (e) => e.code === 2 && /bundle/.test(e.message), 'a data file is not opened as the archive');
});

test('unsafe paths are refused', async () => {
  const V = await import(VAULT);
  const roots = ['data/app', 'history'];
  for (const p of ['data/app/x.json', 'history/chat/a.txt', 'data/app']) assert.equal(V.safePath(p, roots), true, p);
  for (const p of ['../evil', 'data/app/../../evil', '/etc/passwd', 'C:/x', 'data\\app\\x', 'data/apps/x', 'data/app/./x', 'data/app//x',
    'data/app/con.txt', 'data/app/x.', 'data/app/a:b', '', 'inbox/x.csv']) {
    assert.equal(V.safePath(p, roots), false, JSON.stringify(p));
  }
  // a vault that carries a traversal path is refused before anything is written
  const files = [{ path: 'data/app/../../owned.txt', mtimeMs: 0, data: Buffer.from('x') }];
  const buf = V.seal(files, PASS, 'data', FAST);
  assert.throws(() => V.unseal(buf, PASS, 'data'), (e) => e.code === 2 && /not allowed/.test(e.message));
});

test('save skips when nothing changed, and an open never overwrites without --replace', async () => {
  const V = await import(VAULT);
  const a = tempRepo();
  assert.equal(V.saveBundle(a.root, 'data', PASS, FAST).saved, true);
  assert.equal(V.saveBundle(a.root, 'data', PASS, FAST).reason, 'already saved, nothing changed');

  a.put('data/app/search_terms.json', '[]');
  let s = V.bundleStatus(a.root, 'data');
  assert.equal(s.localChanged, true);
  assert.equal(s.vaultChanged, false);

  // open without replace keeps the newer local data
  const kept = V.openBundle(a.root, 'data', PASS);
  assert.deepEqual(kept.kept, ['data/app']);
  assert.equal(fs.readFileSync(path.join(a.root, 'data', 'app', 'search_terms.json'), 'utf8'), '[]');

  // open with replace moves the local copy to backups/ first, never deletes it
  const swapped = V.openBundle(a.root, 'data', PASS, { replace: true });
  assert.deepEqual(swapped.placed, ['data/app']);
  const backups = fs.readdirSync(path.join(a.root, 'backups'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(a.root, 'backups', backups[0], 'data', 'app', 'search_terms.json'), 'utf8'), '[]');
  s = V.bundleStatus(a.root, 'data');
  assert.equal(s.localChanged, false);
});

test('files are encoded and decoded exactly, including empty files and unicode names', async () => {
  const V = await import(VAULT);
  const files = [
    { path: 'history/a.txt', mtimeMs: 1730000000000.5, data: Buffer.alloc(0) },
    { path: 'history/नोट्स/₹ cost.md', mtimeMs: 0, data: Buffer.from('₹1,212.97') },
  ];
  const back = V.decodeFiles(V.encodeFiles(files));
  assert.deepEqual(back.map((f) => [f.path, f.mtimeMs, f.data.toString('utf8')]), files.map((f) => [f.path, f.mtimeMs, f.data.toString('utf8')]));
  assert.throws(() => V.decodeFiles(V.encodeFiles(files).subarray(0, 20)), (e) => e.code === 2);
});
