import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { CloudError } from '../src/bambu/cloud.js';
import { Store } from '../src/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RFID = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

// Nachgebaute Bambu Cloud mit gemeinsamem Zustand für alle Instanzen.
const cloudDb = { spools: [{ id: 501, filamentVendor: 'Bambu Lab', filamentName: 'PLA Basic', filamentType: 'PLA', color: '#FFFFFFFF', netWeight: 700, totalNetWeight: 1000, RFID }], nextId: 600 };
class FakeCloud {
  constructor({ token }) {
    this.token = token;
  }

  async listDevices() {
    return [];
  }

  async listTasks() {
    return [{ id: 7, title: 'Halter', status: 2, startTime: '2026-10-20T10:00:00Z', endTime: '2026-10-20T11:00:00Z', weight: 12.5, costTime: 3500,
      amsDetailMapping: [{ ams: 0, targetColor: 'FFFFFFFF', filamentType: 'PLA', weight: 12.5 }] }];
  }

  async mqttUsername() {
    return 'u_1';
  }

  async login(account, password) {
    if (password !== 'richtig') throw new CloudError('E-Mail oder Passwort ist falsch.', 400, 'credentials');
    return { status: 'code' };
  }

  async sendCode(account) {
    cloudDb.codesSent = (cloudDb.codesSent || 0) + 1;
    this.lastCodeFor = account;
  }

  async loginWithCode(account, code) {
    if (code !== '111111') throw new CloudError('Der Code ist falsch.', 400, 'code-wrong');
    return { status: 'ok', token: 'TOKEN-1' };
  }

  async listSpools() {
    if (this.token !== 'TOKEN-1') throw new CloudError('abgelaufen', 401, 'auth');
    return structuredClone(cloudDb.spools);
  }

  async createSpool(body) {
    const spool = { ...body, id: cloudDb.nextId++ };
    cloudDb.spools.push(spool);
    return { filamentV2: spool };
  }

  async updateSpool(body) {
    const s = cloudDb.spools.find((x) => x.id === body.id);
    Object.assign(s, body);
    return { filamentV2: s };
  }
}

// Drucker-Verwaltung ohne echte MQTT-Verbindung.
class FakePrinters extends EventEmitter {
  constructor() {
    super();
    this.slots = [
      { slot: 'A1', empty: false, rfid: RFID, colorHex: '#FFFFFF', colorName: 'Weiß', name: 'PLA Basic', type: 'PLA', remainPct: 40, totalWeight: 1000, estimatedNet: 400 },
      { slot: 'A2', empty: false, rfid: '', colorHex: '#000000', colorName: 'Schwarz', name: 'PETG', type: 'PETG', remainPct: null, totalWeight: null, estimatedNet: null },
    ];
  }

  sync(configs) { this.configs = configs; }
  view(configs) { return configs.map((c) => ({ id: c.id, name: c.name, status: 'verbunden', units: [], external: [] })); }
  liveSlots() { return this.configs && this.configs.length ? [{ printerId: this.configs[0].id, slots: this.slots }] : []; }
  findSlot(printerId, slot) { return this.liveSlots().flatMap((p) => p.slots).find((s) => s.slot === slot) || null; }
}

let server;
let base;
let dir;
const printers = new FakePrinters();

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lager-'));
  const store = new Store(path.join(dir, 'lager.json'));
  await store.load();
  store.bambu.options.autoSync = false; // die Abgleich-Tests rufen alles selbst auf
  const app = createApp({ store, printers, publicDir: path.join(root, 'public'), cloudFactory: (o) => new FakeCloud(o) });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test('Weboberfläche und Startdaten werden ausgeliefert', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Filament-Lager/);
  const { body } = await call('GET', '/api/state');
  assert.equal(body.spools.length, 18);
  assert.equal(body.settings.spoolTypes[0].tare, 274);
});

test('Spulen anlegen, ändern, löschen und speichern', async () => {
  const created = await call('POST', '/api/spools', { spools: [{ material: 'PETG HF', colorName: 'Schwarz', purchaseWeight: 1000 }] });
  assert.equal(created.status, 201);
  const id = created.body.spools[0].id;
  const upd = await call('PUT', '/api/spools/' + id, { netWeight: 640, id: 'manipuliert' });
  assert.equal(upd.body.spool.netWeight, 640);
  assert.equal(upd.body.spool.id, id);
  assert.equal((await call('PUT', '/api/spools/gibtsnicht', {})).status, 404);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.equal(saved.spools.find((s) => s.id === id).netWeight, 640);
  assert.equal((await call('DELETE', '/api/spools/' + id)).status, 200);
  assert.equal((await call('GET', '/api/state')).body.spools.length, 18);
});

test('Bambu-Anmeldung mit Code, Token bleibt geheim', async () => {
  assert.equal((await call('POST', '/api/bambu/cloud/login', { account: 'a@b.de', password: 'falsch' })).status, 400);
  const step1 = await call('POST', '/api/bambu/cloud/login', { account: 'a@b.de', password: 'richtig' });
  assert.deepEqual(step1.body.cloud.pending, { status: 'code', account: 'a@b.de' });
  assert.equal((await call('POST', '/api/bambu/cloud/code', { code: '000000' })).status, 400);
  const step2 = await call('POST', '/api/bambu/cloud/code', { code: '111111' });
  assert.equal(step2.body.cloud.connected, true);
  assert.equal(JSON.stringify(step2.body).includes('TOKEN-1'), false);
});

test('Von Bambu holen und nach Bambu senden', async () => {
  const preview = await call('GET', '/api/bambu/cloud/pull');
  const item = preview.body.items.find((i) => i.key === 'cloud:501');
  // Die weiße Spule aus der Excel-Liste wird über Hersteller, Material, Farbe und Gewicht erkannt.
  assert.equal(item.kind, 'link');
  assert.equal(item.local.colorName, 'Weiß');
  const pulled = await call('POST', '/api/bambu/cloud/pull', { keys: ['cloud:501'] });
  const weiss = pulled.body.spools.find((s) => s.bambu.cloudId === 501);
  assert.equal(weiss.netWeight, 700);
  assert.equal(weiss.bambu.rfid, RFID);

  const push = await call('GET', '/api/bambu/cloud/push');
  assert.equal(push.body.items.filter((i) => i.kind === 'create').length, 17);
  const keys = push.body.items.slice(0, 2).map((i) => i.key);
  const pushed = await call('POST', '/api/bambu/cloud/push', { keys });
  assert.equal(pushed.body.result.created, 2);
  assert.equal(cloudDb.spools.length, 3);
  assert.equal(pushed.body.spools.filter((s) => s.bambu.cloudId).length, 3);
});

test('Drucker anlegen, AMS-Abgleich und Slot-Zuordnung', async () => {
  assert.equal((await call('POST', '/api/bambu/printers', { host: '192.168.1.20' })).status, 400);
  const added = await call('POST', '/api/bambu/printers', { name: 'P1S', host: '192.168.1.20', serial: 'sn1', accessCode: 'abcd1234' });
  assert.equal(added.status, 201);
  const p = added.body.printers[0];
  assert.equal(JSON.stringify(added.body).includes('abcd1234'), false);

  printers.emit('update', p.id);
  await new Promise((r) => setTimeout(r, 20));
  let { spools } = (await call('GET', '/api/state')).body;
  const weiss = spools.find((s) => s.bambu.rfid === RFID);
  assert.equal(weiss.inAms, true);
  assert.equal(weiss.bambu.slot, 'A1');

  const schwarz = spools.find((s) => s.colorName === 'Schwarz' && s.netWeight === 580);
  const linked = await call('POST', '/api/bambu/ams/link', { printerId: p.id, slot: 'A2', spoolId: schwarz.id });
  spools = linked.body.spools;
  assert.equal(spools.find((s) => s.id === schwarz.id).bambu.slot, 'A2');

  const w = await call('POST', '/api/bambu/ams/weight', { printerId: p.id, slot: 'A1', spoolId: weiss.id });
  assert.equal(w.body.spool.netWeight, 400);
  assert.equal((await call('POST', '/api/bambu/ams/weight', { printerId: p.id, slot: 'A2', spoolId: schwarz.id })).status, 400);

  const created = await call('POST', '/api/bambu/ams/create', { printerId: p.id, slot: 'A2' });
  assert.equal(created.body.spool.material, 'PETG');
  assert.equal(created.body.spool.inAms, true);
  assert.equal((await call('POST', '/api/bambu/ams/link', { printerId: p.id, slot: 'B1', spoolId: schwarz.id })).status, 404);
});

test('Abgelaufene Anmeldung wird erkannt', async () => {
  const store = new Store(path.join(dir, 'zwei.json'));
  await store.load();
  store.bambu.cloud.token = 'ALT';
  const app = createApp({ store, publicDir: path.join(root, 'public'), cloudFactory: (o) => new FakeCloud(o) });
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/bambu/cloud/pull`);
  assert.equal(res.status, 401);
  assert.equal(store.bambu.cloud.token, '');
  srv.close();
});

test('Import ersetzt oder ergänzt den Bestand', async () => {
  const before = (await call('GET', '/api/state')).body.spools.length;
  const add = await call('POST', '/api/import', { mode: 'append', spools: [{ material: 'ASA', colorName: 'Grau' }] });
  assert.equal(add.body.spools.length, before + 1);
  const rep = await call('POST', '/api/import', { mode: 'replace', spools: [{ material: 'ASA', colorName: 'Grau' }] });
  assert.equal(rep.body.spools.length, 1);
  const seed = await call('POST', '/api/import', { mode: 'seed' });
  assert.equal(seed.body.spools.length, 18);
});

test('Anmeldung ohne Passwort (Google-Konto) per E-Mail-Code', async () => {
  await call('POST', '/api/bambu/cloud/logout', {});
  const step1 = await call('POST', '/api/bambu/cloud/login', { account: 'google@example.org', password: '' });
  assert.equal(step1.status, 200);
  assert.deepEqual(step1.body.cloud.pending, { status: 'code', account: 'google@example.org' });
  assert.equal(cloudDb.codesSent, 1);
  const step2 = await call('POST', '/api/bambu/cloud/code', { code: '111111' });
  assert.equal(step2.body.cloud.connected, true);
  assert.equal((await call('POST', '/api/bambu/cloud/login', { account: '', password: '' })).status, 400);
});

test('Spulen verschieben und Pakete verwalten', async () => {
  await call('POST', '/api/import', { mode: 'seed' });
  const { spools } = (await call('GET', '/api/state')).body;
  const orange = spools[0];
  const moved = await call('POST', '/api/spools/move', { ids: [orange.id], target: { kind: 'slot', slot: 'A2' } });
  assert.equal(moved.status, 200);
  const o = moved.body.spools.find((s) => s.id === orange.id);
  assert.deepEqual([o.inAms, o.bambu.slot, o.location], [true, 'A2', '']);
  // Paket 1 ist jetzt leer, bleibt aber erhalten
  assert.ok((await call('GET', '/api/state')).body.settings.places.includes('1'));
  assert.equal((await call('POST', '/api/spools/move', { ids: [orange.id], target: { kind: 'paket' } })).status, 400);

  const added = await call('POST', '/api/places', { action: 'add', name: '7' });
  assert.ok(added.body.settings.places.includes('7'));
  const back = await call('POST', '/api/spools/move', { ids: [orange.id], target: { kind: 'place', place: '7' } });
  assert.equal(back.body.spools.find((s) => s.id === orange.id).location, '7');
  const renamed = await call('POST', '/api/places', { action: 'rename', name: '7', to: 'Regal' });
  assert.equal(renamed.body.spools.find((s) => s.id === orange.id).location, 'Regal');
  assert.equal((await call('POST', '/api/places', { action: 'remove', name: 'Regal' })).status, 400);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.ok(saved.settings.places.includes('Regal'));
});

test('Automatischer Abgleich und Drucker aus dem Bambu-Konto', async () => {
  const store = new Store(path.join(dir, 'auto.json'));
  await store.load();
  store.bambu.cloud.token = 'TOKEN-1';
  class DeviceCloud extends FakeCloud {
    async listDevices() {
      return [{ dev_id: 'SN9', name: 'P1S Werkstatt', dev_product_name: 'P1S' }];
    }
  }
  const pm = new FakePrinters();
  const app = createApp({ store, printers: pm, publicDir: path.join(root, 'public'), cloudFactory: (o) => new DeviceCloud(o) });
  await app.locals.startBambu();
  await app.locals.autoSync();
  // Drucker wird über die Cloud verbunden, ohne IP-Adresse
  assert.deepEqual(pm.configs.map((c) => [c.id, c.kind, c.host, c.username, c.accessCode]),
    [['cloud:SN9', 'cloud', 'us.mqtt.bambulab.com', 'u_1', 'TOKEN-1']]);
  // Spulen aus dem Filament Manager wurden zugeordnet statt doppelt angelegt
  assert.equal(store.spools.length, 18);
  const weiss = store.spools.find((s) => s.bambu.cloudId === 501);
  assert.equal(weiss.colorName, 'Weiß');
  assert.equal(weiss.netWeight, 700);
  assert.ok(store.bambu.cloud.lastPullAt);
  // Ausschalten verhindert den Abgleich
  store.bambu.options.autoSync = false;
  assert.equal(await app.locals.autoSync(), null);
  // Abmelden trennt die Cloud-Drucker
  store.bambu.options.autoSync = true;
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  await fetch(`http://127.0.0.1:${srv.address().port}/api/bambu/cloud/logout`, { method: 'POST' });
  assert.deepEqual(pm.configs, []);
  srv.close();
});

test('Druckverlauf holen und Verkäufe verwalten', async () => {
  await call('POST', '/api/bambu/cloud/login', { account: 'a@b.de', password: '' });
  await call('POST', '/api/bambu/cloud/code', { code: '111111' });
  const refreshed = await call('POST', '/api/drucke/aktualisieren', {});
  assert.equal(refreshed.body.connected, true);
  assert.deepEqual(refreshed.body.tasks.map((t) => [t.id, t.title, t.seconds, t.grams]), [['7', 'Halter', 3600, 12.5]]);
  assert.equal((await call('GET', '/api/drucke')).body.tasks.length, 1);

  const added = await call('POST', '/api/verkaeufe', { title: 'Halter', qty: 2, price: '3,50', cost: 1.2, taskId: '7' });
  assert.equal(added.status, 201);
  assert.equal(added.body.summary.total.profit, 2.3);
  const id = added.body.sale.id;
  const upd = await call('PUT', '/api/verkaeufe/' + id, { price: 4 });
  assert.equal(upd.body.sales[0].price, 4);
  assert.equal(upd.body.sales[0].qty, 2);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.equal(saved.sales.length, 1);
  assert.equal(saved.tasks.length, 1);
  const del = await call('DELETE', '/api/verkaeufe/' + id);
  assert.equal(del.body.sales.length, 0);
});
