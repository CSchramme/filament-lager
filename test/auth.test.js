import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servers = [];
let dir;

async function start(options) {
  dir = dir || await fs.mkdtemp(path.join(os.tmpdir(), 'lager-auth-'));
  const store = new Store(path.join(dir, `lager-${servers.length}.json`));
  await store.load();
  const app = createApp({ store, publicDir: path.join(root, 'public'), ...options });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

after(async () => {
  for (const s of servers) s.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('Mit Passwort: Anmeldung per Cookie, Basic-Auth und Abmelden', async () => {
  const base = await start({ password: 'geheim-123' });
  assert.equal((await (await fetch(base + '/api/health')).json()).auth, 'required');
  assert.equal((await fetch(base + '/')).status, 200); // Oberfläche ist frei
  const denied = await fetch(base + '/api/state');
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).login, true);

  assert.equal((await post(base + '/api/login', { password: 'falsch' })).status, 401);
  const ok = await post(base + '/api/login', { password: 'geheim-123' });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await fetch(base + '/api/state', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await (await fetch(base + '/api/health', { headers: { Cookie: cookie } })).json()).auth, 'ok');
  assert.equal((await fetch(base + '/api/state', { headers: { Cookie: 'lager_sitzung=abc' } })).status, 401);

  const basic = 'Basic ' + Buffer.from('egal:geheim-123').toString('base64');
  assert.equal((await fetch(base + '/api/state', { headers: { Authorization: basic } })).status, 200);

  const out = await post(base + '/api/logout', {}, { Cookie: cookie });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('Nach 10 Fehlversuchen wird die Anmeldung gesperrt', async () => {
  const base = await start({ password: 'richtig' });
  const headers = { 'X-Forwarded-For': '203.0.113.9' };
  for (let i = 0; i < 10; i += 1) assert.equal((await post(base + '/api/login', { password: 'x' }, headers)).status, 401);
  assert.equal((await post(base + '/api/login', { password: 'richtig' }, headers)).status, 429);
  // Andere Adresse ist nicht betroffen
  assert.equal((await post(base + '/api/login', { password: 'richtig' }, { 'X-Forwarded-For': '203.0.113.10' })).status, 200);
});

test('Auf dem Webserver ohne Passwort bleibt alles gesperrt', async () => {
  const base = await start({ requirePassword: true });
  assert.equal((await (await fetch(base + '/api/health')).json()).auth, 'missing');
  const res = await fetch(base + '/api/state');
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /LAGER_PASSWORT/);
});

test('Im Heimnetz ohne Passwort ist alles offen', async () => {
  const base = await start({});
  assert.equal((await (await fetch(base + '/api/health')).json()).auth, 'none');
  assert.equal((await fetch(base + '/api/state')).status, 200);
});
