import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assignNumbers, normalizeSpool } from '../public/js/domain.js';
import { seedSpools } from '../public/js/seed.js';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server;
let base;
let dir;
let store;
let cookie;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lager-api-'));
  store = new Store(path.join(dir, 'lager.json'));
  await store.load();
  const app = createApp({ store, publicDir: path.join(root, 'public'), password: 'pw' });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"pw"}' });
  cookie = res.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const get = (url, headers = {}) => fetch(base + url, { headers }).then(async (r) => ({ status: r.status, body: await r.json(), headers: r.headers }));

test('Jede Rolle hat eine feste Nummer', () => {
  assert.deepEqual(store.spools.map((s) => s.nr), Array.from({ length: 18 }, (_, i) => i + 1));
  // Nummern werden nach dem Löschen nicht neu vergeben, Doppelte bekommen eine neue
  const data = { spools: seedSpools().slice(0, 3), nextNr: 1 };
  assignNumbers(data);
  data.spools.splice(2, 1);
  data.spools.push(normalizeSpool({ colorName: 'Neu' }), normalizeSpool({ colorName: 'Kopie', nr: 1 }));
  assignNumbers(data);
  assert.deepEqual(data.spools.map((s) => s.nr), [1, 2, 4, 5]);
});

test('API ohne Schlüssel gesperrt, mit Schlüssel oder Anmeldung offen', async () => {
  const none = await get('/api/v1/bestand');
  assert.equal(none.status, 401);
  assert.match(none.body.fehler, /Einstellungen/);
  assert.equal((await get('/api/v1/bestand', { Cookie: cookie })).status, 200);

  const { key } = await (await fetch(base + '/api/schluessel', { method: 'POST', headers: { Cookie: cookie } })).json();
  assert.ok(key.length >= 30);
  assert.equal((await get('/api/v1/bestand', { 'X-API-Key': key })).status, 200);
  assert.equal((await get('/api/v1/bestand', { Authorization: 'Bearer ' + key })).status, 200);
  assert.equal((await get('/api/v1/bestand?key=' + key)).status, 200);
  assert.equal((await get('/api/v1/bestand', { 'X-API-Key': 'falsch' })).status, 401);
  // Der Schlüssel öffnet nur die Lese-API, nicht die Verwaltung
  assert.equal((await get('/api/state', { 'X-API-Key': key })).status, 401);
  const pre = await fetch(base + '/api/v1/spulen', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
});

test('Bestand nach Farbe, Material und Platz', async () => {
  const { body } = await get('/api/v1/bestand', { Cookie: cookie });
  assert.equal(body.spulen, 18);
  assert.equal(body.gesamt_g, store.spools.reduce((a, s) => a + s.netWeight, 0));
  const schwarz = body.nach_farbe.find((c) => c.farbe === 'Schwarz');
  assert.deepEqual([schwarz.spulen, schwarz.rest_g, schwarz.farbcode, schwarz.nr], [2, 1580, '#000000', [6, 7]]);
  assert.deepEqual(schwarz.materialien, [{ material: 'PLA Basic', spulen: 2, rest_g: 1580 }]);
  const rot = body.nach_farbe.find((c) => c.farbe === 'Rot');
  assert.deepEqual(rot.materialien.map((m) => m.material), ['PLA Translucent', 'PLA Basic']);
  assert.equal(body.nach_material.find((m) => m.material === 'PLA Translucent').rest_g, 958);
  assert.deepEqual(body.nach_platz.find((p) => p.platz === 'Kiste').nr, [11, 12, 13, 14, 15, 16]);
  assert.deepEqual(body.knapp, [14, 15]);
  assert.deepEqual(body.im_ams, [7, 8, 9, 10]);
});

test('Rollen abrufen und filtern', async () => {
  const h = { Cookie: cookie };
  const one = await get('/api/v1/spulen/1', h);
  assert.equal(one.body.nr, 1);
  assert.equal(one.body.farbe, 'Orange');
  assert.equal(one.body.mit_spule_g, 511);
  assert.equal(one.body.paket, '1');
  assert.equal(one.body.platz, 'Paket 1');
  assert.equal((await get('/api/v1/spulen/%2312', h)).body.farbe, 'Lila'); // "#12"
  assert.equal((await get('/api/v1/spulen/999', h)).status, 404);

  const gruen = await get('/api/v1/spulen?farbe=grün', h);
  assert.deepEqual(gruen.body.spulen.map((s) => s.farbe), ['Hell Grün', 'Mistelzweig Grün', 'Bambus Grün']);
  assert.equal((await get('/api/v1/spulen?im_ams=true', h)).body.anzahl, 4);
  assert.equal((await get('/api/v1/spulen?paket=kiste', h)).body.anzahl, 6);
  assert.equal((await get('/api/v1/spulen?status=neu', h)).body.anzahl, 2);
  const ams = await get('/api/v1/ams', h);
  assert.equal(ams.body.slots.length, 4);
  assert.equal(ams.body.ohne_slot.length, 4);
});

test('Gramm über die API ändern', async () => {
  const key = store.data.apiKey;
  const post = (url, body, headers = { 'X-API-Key': key }) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  // Restgewicht direkt
  let r = await post('/api/v1/spulen/1/gewicht', { rest_g: 200 });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.vorher_g, r.body.rest_g, r.body.mit_spule_g], [237, 200, 474]);
  // Mit Spule gewogen (Tara Bambu Plastik 274 g)
  r = await post('/api/v1/spulen/1/gewicht', { mit_spule_g: 450 });
  assert.equal(r.body.rest_g, 176);
  // Verbrauch abziehen, auch als Adresse; PATCH geht ebenso
  r = await post('/api/v1/spulen/%231/gewicht?verbraucht_g=26', {});
  assert.equal(r.body.rest_g, 150);
  const patched = await fetch(base + '/api/v1/spulen/5', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-API-Key': key }, body: '{"verbraucht_g": 12.4}',
  }).then((x) => x.json());
  assert.deepEqual([patched.rest_g, patched.geoeffnet], [988, true]); // war ungeöffnet
  assert.equal(store.spools[0].netWeight, 150);

  // Fehler
  assert.equal((await post('/api/v1/spulen/1/gewicht', {})).status, 400);
  assert.equal((await post('/api/v1/spulen/1/gewicht', { rest_g: 1, verbraucht_g: 2 })).status, 400);
  assert.equal((await post('/api/v1/spulen/1/gewicht', { rest_g: 'viel' })).status, 400);
  assert.equal((await post('/api/v1/spulen/999/gewicht', { rest_g: 1 })).status, 404);
  assert.equal((await post('/api/v1/spulen/1/gewicht', { rest_g: 1 }, { 'X-API-Key': 'falsch' })).status, 401);
  // Der Schlüssel darf sonst nichts ändern
  const other = await fetch(base + '/api/spools/' + store.spools[0].id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-API-Key': key }, body: '{"netWeight": 5}',
  });
  assert.equal(other.status, 401);
});

test('Einkaufsliste über die API', async () => {
  const key = (await fetch(base + '/api/schluessel', { method: 'POST', headers: { cookie } }).then((r) => r.json())).key;
  const res = await get('/api/v1/einkaufsliste', { 'X-API-Key': key });
  assert.equal(res.status, 200);
  assert.equal(res.body.anzahl, res.body.nachkaufen.length);
  for (const i of [...res.body.nachkaufen, ...res.body.ersatz_im_lager]) {
    assert.ok(i.knapp.length > 0);
    assert.deepEqual(Object.keys(i), ['material', 'hersteller', 'farbe', 'farbcode', 'knapp', 'ersatz', 'kaufgewicht_g', 'preis_pro_kg_eur', 'geschaetzt_eur']);
  }
  assert.equal((await get('/api/v1/einkaufsliste')).status, 401);
});
