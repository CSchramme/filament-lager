import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assetVersion, createApp } from '../src/app.js';
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
const ntfy = []; // Nachrichten an den nachgebauten ntfy-Server
const notifyFetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  ntfy.push({ url, body });
  return body.topic.includes('kaputt') ? { ok: false, status: 500, text: async () => 'down' } : { ok: true, status: 200, text: async () => '' };
};

// Nachgebaute DHL-Sendungsverfolgung
const dhlCalls = [];
const dhlState = { delivered: false };
const dhlFetch = async (url, opts) => {
  const number = new URL(url).searchParams.get('trackingNumber');
  const key = opts.headers['DHL-API-Key'];
  dhlCalls.push({ number, key });
  if (key === 'falscher-schluessel') return { ok: false, status: 401, json: async () => ({}) };
  if (number === 'JJD000000000000') return { ok: false, status: 404, json: async () => ({ title: 'No shipment with given tracking number found.' }) };
  const status = dhlState.delivered
    ? { timestamp: '2026-10-27T10:12:00Z', statusCode: 'delivered', status: 'DELIVERED', description: 'Die Sendung wurde erfolgreich zugestellt.', location: { address: { addressLocality: 'Musterstadt' } } }
    : { timestamp: '2026-10-26T18:00:00Z', statusCode: 'transit', status: 'TRANSIT', description: 'Die Sendung wurde im Paketzentrum bearbeitet.', location: { address: { addressLocality: 'Bonn' } } };
  return {
    ok: true,
    status: 200,
    json: async () => ({ shipments: [{ id: number, status, events: [status, { timestamp: '2026-10-26T09:00:00Z', statusCode: 'pre-transit', description: 'Die Auftragsdaten wurden übermittelt.' }] }] }),
  };
};

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
  const app = createApp({
    store, printers, publicDir: path.join(root, 'public'), cloudFactory: (o) => new FakeCloud(o), notifyFetch, dhlFetch,
  });
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

  const breakdown = { filament: 0.25, energy: 0.04, machine: 0.3, failure: 0.03, labor: 0.63, cost: 1.25, profit: 0.38, piece: 1.63 };
  const added = await call('POST', '/api/verkaeufe', {
    date: '2026-10-25', customer: 'Oma', items: [{ title: 'Halter', qty: 2, grams: 12.5, seconds: 3600, breakdown, taskId: '7' }], minExtra: 0,
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.sale.nr, '2026-001');
  assert.equal(added.body.sale.price, 3.26);
  assert.equal(added.body.summary.total.profit, 0.76);
  const second = await call('POST', '/api/verkaeufe', { date: '2026-10-26', items: [{ title: 'Clip', qty: 1, price: 3 }] });
  assert.equal(second.body.sale.nr, '2026-002');
  const id = added.body.sale.id;
  const upd = await call('PUT', '/api/verkaeufe/' + id, { customer: 'Opa', nr: '1999-999' });
  const changed = upd.body.sales.find((x) => x.id === id);
  assert.deepEqual([changed.customer, changed.nr, changed.price, changed.qty], ['Opa', '2026-001', 3.26, 2]);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.equal(saved.sales.length, 2);
  assert.deepEqual(saved.receiptSeq, { 2026: 2 });
  assert.equal(saved.tasks.length, 1);
  await call('DELETE', '/api/verkaeufe/' + second.body.sale.id);
  const del = await call('DELETE', '/api/verkaeufe/' + id);
  assert.equal(del.body.sales.length, 0);
  // Gelöschte Nummern werden nicht neu vergeben
  const third = await call('POST', '/api/verkaeufe', { date: '2026-10-27', items: [{ title: 'X', price: 3 }] });
  assert.equal(third.body.sale.nr, '2026-003');
  await call('DELETE', '/api/verkaeufe/' + third.body.sale.id);
});

test('Stromabrechnungen speichern und löschen', async () => {
  assert.deepEqual((await call('GET', '/api/strom')).body.payments, []);
  const rows = [{ date: '2026-10-20T10:00:00Z', title: 'Halter', seconds: 3600, status: 2, kwh: 0.12, amount: 0.04 }];
  const res = await call('POST', '/api/strom', {
    date: '2026-10-25', from: '2026-10-01T00:00:00Z', to: '2026-10-25T12:00:00Z', prints: 1, hours: 1, kwh: 0.12, amount: '0,04', energyPrice: 0.3, printerWatts: 120, rows, id: 'fremd',
  });
  assert.equal(res.status, 201);
  assert.notEqual(res.body.payment.id, 'fremd');
  assert.equal(res.body.payment.amount, 0.04);
  assert.deepEqual(res.body.payment.rows, rows);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.equal(saved.powerPayments.length, 1);
  const del = await call('DELETE', '/api/strom/' + res.body.payment.id);
  assert.deepEqual(del.body.payments, []);
});

test('Angebote speichern und mit einem Klick in einen Beleg umwandeln', async () => {
  const items = [{ title: 'Vase', qty: 1, grams: 90, seconds: 7200, breakdown: { filament: 1.8, energy: 0.07, machine: 0.6, failure: 0.19, labor: 1.25, cost: 3.91, profit: 1.17, piece: 5.08 } }];
  const created = await call('POST', '/api/angebote', { date: '2026-10-25', customer: 'Nachbarin', items, saleNr: '2026-999' });
  assert.equal(created.status, 201);
  assert.deepEqual([created.body.offer.nr, created.body.offer.validUntil, created.body.offer.saleNr, created.body.offer.price], ['A-2026-001', '2026-11-08', '', 5.08]);
  const id = created.body.offer.id;
  const before = (await call('GET', '/api/verkaeufe')).body.sales.length;
  const accepted = await call('POST', `/api/angebote/${id}/beleg`, {});
  assert.equal(accepted.status, 201);
  assert.deepEqual([accepted.body.sale.fromOffer, accepted.body.sale.price, accepted.body.sale.customer], ['A-2026-001', 5.08, 'Nachbarin']);
  assert.equal(accepted.body.offer.saleNr, accepted.body.sale.nr);
  assert.equal(accepted.body.sales.length, before + 1);
  const again = await call('POST', `/api/angebote/${id}/beleg`, {});
  assert.equal(again.status, 409);
  assert.match(again.body.error, /schon Beleg/);
  assert.equal((await call('POST', '/api/angebote/gibtsnicht/beleg', {})).status, 404);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.deepEqual(saved.offerSeq, { 2026: 1 });
  assert.equal((await call('DELETE', '/api/angebote/' + id)).body.offers.length, 0);
  await call('DELETE', '/api/verkaeufe/' + accepted.body.sale.id);
});

test('Benachrichtigungen einrichten, testen und knappe Rollen melden', async () => {
  const first = await call('GET', '/api/benachrichtigungen');
  assert.match(first.body.topic, /^filament-lager-[0-9a-f]{16}$/);
  assert.equal(first.body.enabled, false);
  assert.equal((await call('GET', '/api/benachrichtigungen')).body.topic, first.body.topic); // bleibt gleich
  assert.equal((await call('PUT', '/api/benachrichtigungen', { enabled: true, server: 'ftp://x' })).status, 400);
  const on = await call('PUT', '/api/benachrichtigungen', {
    enabled: true, token: 'geheim', appUrl: 'https://lager.example.de/', events: { paused: false, unbekannt: true },
  });
  assert.equal(on.status, 200);
  assert.deepEqual([on.body.enabled, on.body.hasToken, on.body.token], [true, true, undefined]);
  assert.deepEqual(on.body.events, {
    done: true, failed: true, paused: false, low: true, delivered: true, umsatz: true, termin: true,
  });
  ntfy.length = 0;
  const t = await call('POST', '/api/benachrichtigungen/test', {});
  assert.equal(t.status, 200);
  assert.deepEqual([ntfy[0].url, ntfy[0].body.topic, ntfy[0].body.click], ['https://ntfy.sh/', first.body.topic, 'https://lager.example.de/#lager']);
  assert.ok(t.body.lastSentAt);
  // Rolle wird knapp -> genau eine Nachricht
  const state = (await call('GET', '/api/state')).body;
  const full = state.spools.find((x) => x.netWeight >= 900);
  await call('PUT', '/api/spools/' + full.id, { netWeight: 50 });
  await call('PUT', '/api/spools/' + full.id, { netWeight: 40 });
  await new Promise((r) => setTimeout(r, 20));
  const low = ntfy.filter((x) => x.body.title === 'Rolle wird knapp');
  assert.equal(low.length, 1);
  assert.match(low[0].body.message, new RegExp(`^#${full.nr} `));
  await call('PUT', '/api/spools/' + full.id, { netWeight: full.netWeight });
  // Token bleibt beim Speichern ohne Token, Fehler kommt zurück
  const kaputt = await call('PUT', '/api/benachrichtigungen', { enabled: true, topic: 'filament-lager-kaputt', token: '' });
  assert.equal(kaputt.body.hasToken, true);
  const failed = await call('POST', '/api/benachrichtigungen/test', {});
  assert.equal(failed.status, 502);
  assert.match((await call('GET', '/api/benachrichtigungen')).body.lastError, /500/);
  await call('PUT', '/api/benachrichtigungen', { enabled: false, topic: first.body.topic, token: '-' });
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.equal(saved.notify.token, '');
});

test('Druckstatus vom Drucker löst Benachrichtigungen aus', async () => {
  await call('PUT', '/api/benachrichtigungen', { enabled: true });
  const id = printers.configs[0].id;
  printers.status = () => printers.current;
  ntfy.length = 0;
  for (const gcodeState of ['RUNNING', 'RUNNING', 'FINISH']) {
    printers.current = { gcodeState, job: 'Halter', progress: 50 };
    printers.emit('update', id);
  }
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ntfy.map((x) => x.body.title), ['Druck fertig']);
  assert.match(ntfy[0].body.message, /„Halter“ ist auf .+ fertig\./);
  delete printers.status;
  await call('PUT', '/api/benachrichtigungen', { enabled: false });
});

test('Vorrat: anlegen, einzeln verkaufen, Beleg löschen bringt Teile zurück', async () => {
  const parts = {
    filament: 0.24, energy: 0.01, machine: 0.07, failure: 0.03, labor: 0.05,
  };
  const made = await call('POST', '/api/vorrat', {
    title: 'Kürbis', made: 25, batchQty: 25, price: '2,50', parts, grams: 12, seconds: 864, colorName: 'Orange',
  });
  assert.equal(made.status, 201);
  const item = made.body.item;
  assert.deepEqual([item.onHand, item.parts.cost, made.body.merged], [25, 0.4, false]);
  assert.equal((await call('POST', '/api/vorrat', { title: 'Leer', made: 0 })).status, 400);
  // Gleicher Name: dazu statt neu
  const again = await call('POST', '/api/vorrat', { title: 'kürbis', made: 5, parts, price: 3 });
  assert.deepEqual([again.body.merged, again.body.item.onHand, again.body.item.made, again.body.stock.length], [true, 30, 30, 1]);

  const breakdown = { ...parts, cost: 0.4, profit: 2.1, piece: 2.5 };
  const sold = await call('POST', '/api/verkaeufe', { date: '2026-10-25', items: [{ title: 'Kürbis', qty: 1, stockId: item.id, batchQty: 25, breakdown }] });
  assert.equal(sold.status, 201);
  assert.deepEqual([sold.body.sale.price, sold.body.stock[0].onHand, sold.body.stock[0].sold], [2.5, 29, 1]);
  const tooMany = await call('POST', '/api/verkaeufe', { items: [{ title: 'Kürbis', qty: 40, stockId: item.id, breakdown }] });
  assert.equal(tooMany.status, 409);
  assert.match(tooMany.body.error, /nur noch 29 Stück/);
  const del = await call('DELETE', '/api/verkaeufe/' + sold.body.sale.id);
  assert.deepEqual([del.body.stock[0].onHand, del.body.stock[0].sold], [30, 0]);

  // Angebot mit Vorrat: erst beim Annehmen abgebucht
  const offer = await call('POST', '/api/angebote', { items: [{ title: 'Kürbis', qty: 4, stockId: item.id, breakdown }] });
  assert.equal((await call('GET', '/api/vorrat')).body.stock[0].onHand, 30);
  const accepted = await call('POST', `/api/angebote/${offer.body.offer.id}/beleg`, {});
  assert.equal(accepted.body.stock[0].onHand, 26);
  await call('DELETE', '/api/verkaeufe/' + accepted.body.sale.id);
  await call('DELETE', '/api/angebote/' + offer.body.offer.id);

  // Korrektur: einer ist kaputt gegangen
  const fixed = await call('PUT', '/api/vorrat/' + item.id, { onHand: 29, price: 2, parts: { filament: 99 } });
  assert.deepEqual([fixed.body.item.onHand, fixed.body.item.price, fixed.body.item.parts.cost, fixed.body.item.made], [29, 2, 0.4, 30]);
  assert.equal((await call('PUT', '/api/vorrat/gibtsnicht', {})).status, 404);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'lager.json'), 'utf8'));
  assert.equal(saved.stock[0].onHand, 29);
  assert.deepEqual((await call('DELETE', '/api/vorrat/' + item.id)).body.stock, []);
});

test('Preisliste speichern und auf Rollen übertragen', async () => {
  const state = (await call('GET', '/api/state')).body;
  const settings = { ...state.settings, priceList: [...state.settings.priceList, { material: 'PLA Translucent', price: '24,99', weight: 1000 }], noRebuyWeights: [250, 500] };
  const saved = await call('PUT', '/api/settings', settings);
  assert.deepEqual(saved.body.settings.priceList.map((e) => [e.material, e.price]), [['PLA Basic', 19.99], ['PLA Translucent', 24.99]]);
  assert.deepEqual(saved.body.settings.noRebuyWeights, [250, 500]);
  const res = await call('POST', '/api/preisliste/uebernehmen', { material: 'PLA Translucent' });
  assert.equal(res.status, 200);
  assert.equal(res.body.changed, 1);
  assert.equal(res.body.spools.find((x) => x.material === 'PLA Translucent').price, 24.99);
  assert.equal((await call('POST', '/api/preisliste/uebernehmen', { material: 'PLA Translucent' })).body.changed, 0);
  assert.equal((await call('POST', '/api/preisliste/uebernehmen', {})).status, 400);
  // Einkaufsliste über die API kennt "nicht nachkaufen"
  await call('PUT', '/api/settings', { ...saved.body.settings, noRebuyWeights: [250] });
});

test('Versionskennung der Oberfläche gegen alte Dateien im Browser-Cache', async () => {
  const res = await fetch(base + '/version.json');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const info = await res.json();
  assert.match(info.v, /^[0-9a-f]{10}$/);
  assert.ok(info.modules.includes('js/app.js') && info.modules.includes('js/preise.js'));
  assert.ok(info.modules.every((m) => m.endsWith('.js')));
  const js = await fetch(base + '/js/app.js');
  assert.equal(js.headers.get('cache-control'), 'no-cache');
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /version\.json/);
  // Ändert sich eine Datei, ändert sich die Kennung
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lager-public-'));
  await fs.mkdir(path.join(tmp, 'js'));
  await fs.writeFile(path.join(tmp, 'js', 'app.js'), 'a');
  const v1 = (await assetVersion(tmp)).v;
  await fs.writeFile(path.join(tmp, 'js', 'app.js'), 'ab');
  assert.notEqual((await assetVersion(tmp)).v, v1);
  assert.deepEqual((await assetVersion(tmp)).modules, ['js/app.js']);
  await fs.rm(tmp, { recursive: true, force: true });
});

test('DHL-Sendungsverfolgung: Nummer am Beleg, Stand abfragen, Zustellung melden', async () => {
  const sale = { date: '2026-10-26', customer: 'Lisa Müller\nHauptstr. 1', items: [{ title: 'Halter', qty: 1, price: 5, cost: 2 }, { title: 'Versand', kind: 'versand', qty: 1, price: 4.5, cost: 4.19 }] };
  assert.equal((await call('POST', '/api/verkaeufe', { ...sale, tracking: { number: 'abc' } })).status, 400);
  const created = await call('POST', '/api/verkaeufe', { ...sale, tracking: { number: ' 0034 0434 1612 3456 7890 ' } });
  assert.equal(created.status, 201);
  const id = created.body.sale.id;
  assert.deepEqual([created.body.sale.tracking.number, created.body.sale.tracking.status], ['00340434161234567890', '']);
  assert.equal(dhlCalls.length, 0); // ohne Schlüssel nur der Link
  assert.equal((await call('GET', '/api/dhl')).body.hasKey, false);
  assert.equal((await call('POST', `/api/verkaeufe/${id}/sendung/pruefen`, {})).status, 409);

  // Schlüssel speichern: kommt nie zurück
  assert.equal((await call('PUT', '/api/dhl', { apiKey: 'x y' })).status, 400);
  const keyed = await call('PUT', '/api/dhl', { apiKey: 'test-schluessel-123' });
  assert.deepEqual([keyed.body.hasKey, JSON.stringify(keyed.body).includes('test-schluessel')], [true, false]);
  assert.equal(JSON.stringify((await call('GET', '/api/state')).body).includes('test-schluessel'), false);
  await new Promise((r) => setTimeout(r, 30)); // offene Sendungen werden gleich abgefragt

  const checked = await call('POST', `/api/verkaeufe/${id}/sendung/pruefen`, {});
  assert.equal(checked.status, 200);
  const t = checked.body.sale.tracking;
  assert.deepEqual([t.status, t.place, t.statusText, t.events.length], ['transit', 'Bonn', 'Die Sendung wurde im Paketzentrum bearbeitet.', 2]);
  assert.equal(dhlCalls.at(-1).key, 'test-schluessel-123');
  assert.equal(dhlCalls.at(-1).number, '00340434161234567890');

  // Zustellung -> Nachricht aufs Handy
  await call('PUT', '/api/benachrichtigungen', { enabled: true, topic: 'filament-lager-dhltest', events: { delivered: true } });
  ntfy.length = 0;
  dhlState.delivered = true;
  const done = await call('POST', `/api/verkaeufe/${id}/sendung/pruefen`, {});
  assert.deepEqual([done.body.sale.tracking.status, done.body.sale.tracking.deliveredAt], ['delivered', '2026-10-27T10:12:00Z']);
  await new Promise((r) => setTimeout(r, 20));
  const msg = ntfy.find((x) => x.body.title === 'Paket zugestellt');
  assert.match(msg.body.message, /an Lisa Müller ist zugestellt \(Musterstadt\)/);
  // Zugestellte Sendungen werden nicht mehr automatisch abgefragt
  const before = dhlCalls.length;
  await call('GET', '/api/verkaeufe');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(dhlCalls.length, before);

  // Nummer ändern: DHL kennt sie noch nicht
  const unknown = await call('PUT', `/api/verkaeufe/${id}/sendung`, { number: 'JJD000000000000' });
  assert.deepEqual([unknown.body.sale.tracking.status, unknown.body.sale.tracking.deliveredAt], ['unknown', '']);
  assert.match(unknown.body.sale.tracking.statusText, /noch nicht/);
  assert.equal((await call('PUT', `/api/verkaeufe/${id}/sendung`, { number: '12' })).status, 400);

  // Falscher Schlüssel: Fehler am Beleg und in den Einstellungen
  await call('PUT', '/api/dhl', { apiKey: 'falscher-schluessel' });
  const bad = await call('POST', `/api/verkaeufe/${id}/sendung/pruefen`, {});
  assert.match(bad.body.sale.tracking.error, /Schlüssel/);
  assert.equal(bad.body.sale.tracking.status, 'unknown'); // Stand bleibt
  assert.match((await call('GET', '/api/dhl')).body.lastError, /Schlüssel/);

  // Entfernen
  const removed = await call('PUT', `/api/verkaeufe/${id}/sendung`, { number: '' });
  assert.equal(removed.body.sale.tracking, null);
  assert.equal((await call('PUT', '/api/dhl', { remove: true })).body.hasKey, false);
  await call('PUT', '/api/benachrichtigungen', { enabled: false });
});

test('Link nur zum Ansehen: Strom ohne Anmeldung, nichts anderes', async () => {
  const view = (token) => fetch(base + '/api/strom-ansicht', { headers: token ? { 'X-Zugang': token } : {} });
  assert.equal((await view()).status, 403);
  assert.equal((await call('GET', '/api/teilen')).body.token, '');
  const { body: share } = await call('POST', '/api/teilen', {});
  assert.match(share.token, /^[A-Za-z0-9_-]{24}$/);
  assert.equal((await view('falsch')).status, 403);
  const res = await view(share.token);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const d = await res.json();
  assert.equal(d.payee, 'Papa');
  assert.ok(Array.isArray(d.power.rows) && Array.isArray(d.payments));
  for (const k of ['sales', 'customers', 'spools', 'settings', 'stock']) assert.equal(k in d, false);

  // Mit Passwort: alles andere gesperrt, der Link geht trotzdem
  const store = new Store(path.join(dir, 'lager.json'));
  await store.load();
  const locked = createApp({ store, printers: null, publicDir: path.join(root, 'public'), password: 'geheim' });
  const srv = await new Promise((resolve) => { const s = locked.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  assert.equal((await fetch(url + '/api/state')).status, 401);
  assert.equal((await fetch(url + '/api/teilen')).status, 401);
  assert.equal((await fetch(url + '/api/strom-ansicht', { headers: { 'X-Zugang': share.token } })).status, 200);
  srv.close();

  // Neuer Link macht den alten ungültig, zurückziehen sperrt
  const { body: next } = await call('POST', '/api/teilen', {});
  assert.notEqual(next.token, share.token);
  assert.equal((await view(share.token)).status, 403);
  assert.equal((await call('DELETE', '/api/teilen')).body.token, '');
  assert.equal((await view(next.token)).status, 403);
  assert.equal((await fetch(base + '/strom.html')).status, 200);
});

test('Sicherungen: täglich, von Hand, herunterladen ohne Zugänge, zurückholen', async () => {
  // Zugänge setzen, die in keiner heruntergeladenen Sicherung stehen dürfen
  await call('PUT', '/api/dhl', { apiKey: 'dhl-geheim-123' });
  const { body: share } = await call('POST', '/api/teilen', {});
  const state = (await call('GET', '/api/state')).body;
  const spoolCount = state.spools.length;

  const made = await call('POST', '/api/sicherungen', {});
  assert.equal(made.status, 201);
  assert.match(made.body.name, /^lager-\d{4}-\d{2}-\d{2}-\d{6}-manuell\.json$/);
  assert.equal(made.body.backups[0].kind, 'manuell');
  const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'backups', made.body.name), 'utf8'));
  assert.equal(onDisk.dhl.apiKey, 'dhl-geheim-123'); // auf dem Server vollständig

  const dl = await fetch(`${base}/api/sicherungen/${made.body.name}`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  const text = await dl.text();
  for (const secret of ['dhl-geheim-123', share.token]) assert.equal(text.includes(secret), false);
  const now = await (await fetch(`${base}/api/sicherungen/aktuell`)).json();
  assert.equal(now.spools.length, spoolCount);
  assert.equal(JSON.stringify(now).includes('dhl-geheim-123'), false);
  assert.equal((await fetch(`${base}/api/sicherungen/..%2Flager.json`)).status, 404);

  // Etwas ändern, dann die Sicherung zurückholen
  const victim = state.spools[0];
  await call('DELETE', '/api/spools/' + victim.id);
  assert.equal((await call('GET', '/api/state')).body.spools.length, spoolCount - 1);
  assert.equal((await call('POST', '/api/sicherungen/zurueckholen', { data: { spools: [], settings: {} } })).status, 400); // nur Spulen: Import
  const back = await call('POST', '/api/sicherungen/zurueckholen', { name: made.body.name });
  assert.equal(back.status, 200);
  assert.match(back.body.before, /vor-wiederherstellen/);
  assert.equal((await call('GET', '/api/state')).body.spools.length, spoolCount);
  // Zugänge bleiben wie vor dem Zurückholen
  assert.equal((await call('GET', '/api/dhl')).body.hasKey, true);
  assert.equal((await call('GET', '/api/teilen')).body.token, share.token);

  // Aus einer heruntergeladenen Datei (ohne Zugänge) zurückholen: Zugänge bleiben
  const fromFile = await call('POST', '/api/sicherungen/zurueckholen', { data: JSON.parse(text) });
  assert.equal(fromFile.status, 200);
  assert.equal((await call('GET', '/api/dhl')).body.hasKey, true);

  // Tägliche Sicherung nur einmal am Tag
  const { Backups } = await import('../src/backup.js');
  const store = new Store(path.join(dir, 'lager.json'));
  await store.load();
  const b = new Backups({ store, dir: path.join(dir, 'b2'), now: () => new Date('2026-10-26T08:00:00') });
  assert.equal(await b.daily(), 'lager-2026-10-26.json');
  assert.equal(await b.daily(), null);
  for (let i = 1; i <= 20; i += 1) {
    b.now = () => new Date(2026, 10, i, 8);
    await b.daily();
  }
  const list = await b.list();
  assert.equal(list.length, 14);
  assert.equal(list[0].name, 'lager-2026-11-20.json');

  await call('PUT', '/api/dhl', { remove: true });
  await call('DELETE', '/api/teilen');
});

test('Filament abbuchen: Schalter, von Hand je Druck, rückgängig', async () => {
  await call('POST', '/api/drucke/aktualisieren', {});
  const st = (await call('GET', '/api/state')).body;
  const a1 = st.spools.find((s) => s.inAms && s.bambu.slot === 'A1');
  assert.ok(a1, 'eine Rolle steckt in A1');
  const before = a1.netWeight;
  const opt = await call('PUT', '/api/bambu/options', { autoBook: true });
  assert.equal(opt.body.options.autoBook, true);
  const tasks = (await call('GET', '/api/drucke')).body;
  assert.equal(tasks.autoBook, true);
  assert.equal(tasks.bookings['7'], undefined); // älter als das Einschalten: nicht automatisch
  const booked = await call('POST', '/api/drucke/7/abbuchen', {});
  assert.equal(booked.status, 200);
  assert.deepEqual(booked.body.entry.items.map((i) => [i.spoolId, i.grams]), [[a1.id, 12.5]]);
  assert.equal(booked.body.spools.find((s) => s.id === a1.id).netWeight, Math.round(before - 12.5));
  assert.equal(booked.body.bookings['7'].undone, false);
  assert.equal((await call('POST', '/api/drucke/7/abbuchen', {})).status, 409);
  const undone = await call('POST', '/api/drucke/7/rueckgaengig', {});
  assert.equal(undone.body.spools.find((s) => s.id === a1.id).netWeight, before);
  assert.equal((await call('POST', '/api/drucke/7/rueckgaengig', {})).status, 409);
  assert.equal((await call('POST', '/api/drucke/fehlt/abbuchen', {})).status, 404);
  await call('PUT', '/api/bambu/options', { autoBook: false });
});

test('Bestellverfolgung: Status, Link ohne Passwort, Druckende, DHL', async () => {
  const created = await call('POST', '/api/verkaeufe', {
    date: '2026-10-26', customer: 'Lisa Müller\nHauptstr. 1\n12345 Musterstadt',
    items: [{ title: 'Kürbis', qty: 3, price: 4.5, cost: 1.2, material: 'PLA Basic', colorName: 'Orange', colorHex: '#FF6A13' }, { title: 'Versand', kind: 'versand', qty: 1, price: 4.5, cost: 4.19 }],
  });
  const id = created.body.sale.id;
  assert.deepEqual([created.body.sale.order.status, created.body.sale.order.delivery], ['', 'versand']);
  const view = (token) => fetch(base + '/api/bestellung', { headers: token ? { 'X-Zugang': token } : {} });
  assert.equal((await view()).status, 404);

  // Link erstellen startet die Verfolgung
  const linked = await call('PUT', `/api/verkaeufe/${id}/bestellung`, { link: 'neu', expectedAt: '2026-10-30', note: 'Danke!' });
  const o = linked.body.sale.order;
  assert.deepEqual([o.status, o.expectedAt, o.note], ['bestellt', '2026-10-30', 'Danke!']);
  assert.match(o.token, /^[A-Za-z0-9_-]{24}$/);
  let res = await view(o.token);
  assert.equal(res.status, 200);
  let d = await res.json();
  assert.deepEqual([d.nr, d.customer, d.price, d.order.status, d.items.length, d.items[0].colorName], [created.body.sale.nr, 'Lisa Müller', 9, 'bestellt', 1, 'Orange']);
  const text = JSON.stringify(d);
  for (const secret of ['Hauptstr', 'cost', 'breakdown', 'token', 'customerId']) assert.equal(text.includes(secret), false, secret);
  assert.equal((await view('falsch-falsch-falsch-falsch')).status, 404);

  // "Wird gedruckt" merkt sich den laufenden Druck und zeigt den Fortschritt
  const pid = printers.configs[0].id;
  printers.status = () => printers.current;
  printers.current = { gcodeState: 'RUNNING', job: 'Kürbis x3', progress: 37, remaining: 70, layer: 120, layers: 300 };
  printers.emit('update', pid);
  const printing = await call('PUT', `/api/verkaeufe/${id}/bestellung`, { status: 'druck' });
  assert.deepEqual(printing.body.sale.order.printJob, { printerId: pid, job: 'Kürbis x3' });
  d = await (await view(o.token)).json();
  assert.deepEqual(d.live, { state: 'RUNNING', progress: 37, remaining: 70, layer: 120, layers: 300 });
  assert.deepEqual(d.order.history.map((h) => h.status), ['bestellt', 'druck']);
  // Druckende -> verpackt bzw. fertig
  printers.current = { gcodeState: 'FINISH', job: 'Kürbis x3', progress: 100 };
  printers.emit('update', pid);
  await new Promise((r) => setTimeout(r, 20));
  d = await (await view(o.token)).json();
  assert.equal(d.order.status, 'fertig');
  assert.equal(d.live, null);
  delete printers.status;

  // Sendungsnummer -> versendet, DHL zugestellt -> zugestellt
  await call('PUT', '/api/dhl', { apiKey: 'test-schluessel-123' });
  dhlState.delivered = false;
  const shipped = await call('PUT', `/api/verkaeufe/${id}/sendung`, { number: '00340434161234567890' });
  assert.equal(shipped.body.sale.order.status, 'versendet');
  d = await (await view(o.token)).json();
  assert.deepEqual([d.tracking.status, d.tracking.place], ['transit', 'Bonn']);
  assert.match(d.tracking.url, /dhl\.de/);
  dhlState.delivered = true;
  await call('POST', `/api/verkaeufe/${id}/sendung/pruefen`, {});
  d = await (await view(o.token)).json();
  assert.equal(d.order.status, 'zugestellt');
  assert.deepEqual(d.order.history.map((h) => h.status), ['bestellt', 'druck', 'fertig', 'versendet', 'zugestellt']);

  // Zurück auf einen früheren Schritt, Abholung, unbekannter Status
  const back = await call('PUT', `/api/verkaeufe/${id}/bestellung`, { status: 'bearbeitung', delivery: 'abholung' });
  assert.deepEqual([back.body.sale.order.status, back.body.sale.order.delivery, back.body.sale.order.history.length], ['bearbeitung', 'abholung', 2]);
  assert.equal((await call('PUT', `/api/verkaeufe/${id}/bestellung`, { status: 'quatsch' })).status, 400);

  // Link zurückziehen sperrt die Seite
  await call('PUT', `/api/verkaeufe/${id}/bestellung`, { link: 'weg' });
  assert.equal((await view(o.token)).status, 404);
  await call('PUT', '/api/dhl', { remove: true });
  assert.equal((await fetch(base + '/bestellung.html')).status, 200);
});

test('Filament-Pakete: DHL-Stand, Meldung bei Zustellung, ins Lager', async () => {
  await call('PUT', '/api/dhl', { apiKey: 'test-schluessel-123' });
  await call('PUT', '/api/benachrichtigungen', { enabled: true, topic: 'filament-lager-dhltest', events: { delivered: true } });
  dhlState.delivered = false;
  assert.equal((await call('POST', '/api/lieferungen', { number: 'xx' })).status, 400);
  const created = await call('POST', '/api/lieferungen', {
    shop: 'Bambu Lab Store', orderedAt: '2026-10-20', number: '0034 0434 1612 3456 7891',
    items: [{ material: 'PLA Basic', colorName: 'Schwarz', colorHex: '#000000', purchaseWeight: 1000, price: 19.99, qty: 2 }],
  });
  assert.equal(created.status, 201);
  const d = created.body.item;
  assert.deepEqual([d.tracking.number, d.tracking.status, d.tracking.place], ['00340434161234567891', 'transit', 'Bonn']);
  assert.equal(dhlCalls.at(-1).number, '00340434161234567891');
  assert.equal((await call('GET', '/api/lieferungen')).body.deliveries[0].id, d.id);

  // Ändern ohne neue Nummer fragt DHL nicht erneut
  const before = dhlCalls.length;
  const upd = await call('PUT', `/api/lieferungen/${d.id}`, { expectedAt: '2026-10-28' });
  assert.deepEqual([upd.body.item.expectedAt, upd.body.item.tracking.status, dhlCalls.length], ['2026-10-28', 'transit', before]);

  // Zugestellt -> Nachricht "Filament ist da"
  ntfy.length = 0;
  dhlState.delivered = true;
  const checked = await call('POST', `/api/lieferungen/${d.id}/pruefen`, {});
  assert.equal(checked.body.item.tracking.status, 'delivered');
  await new Promise((r) => setTimeout(r, 20));
  assert.match(ntfy.find((x) => x.body.title === 'Filament ist da').body.message, /Bambu Lab Store ist zugestellt \(Musterstadt\)/);

  // Ins Lager: zwei Rollen mit Preis, Kaufdatum und Nummer
  const count = (await call('GET', '/api/state')).body.spools.length;
  const got = await call('POST', `/api/lieferungen/${d.id}/angekommen`, { location: 'Kiste' });
  assert.equal(got.status, 200);
  assert.equal(got.body.created.length, 2);
  assert.deepEqual(got.body.created.map((s) => [s.price, s.boughtAt, s.location, s.netWeight]), [[19.99, '2026-10-20', 'Kiste', 1000], [19.99, '2026-10-20', 'Kiste', 1000]]);
  assert.ok(got.body.created.every((s) => s.nr > 0));
  assert.equal(got.body.spools.length, count + 2);
  assert.ok(got.body.item.receivedAt);
  assert.equal((await call('POST', `/api/lieferungen/${d.id}/angekommen`, {})).status, 409);
  // Angekommene Pakete fragt das Lager nicht mehr ab
  const n = dhlCalls.length;
  await call('GET', '/api/lieferungen');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(dhlCalls.length, n);

  assert.deepEqual((await call('DELETE', `/api/lieferungen/${d.id}`)).body.deliveries, []);
  await call('PUT', '/api/benachrichtigungen', { enabled: false });
  await call('PUT', '/api/dhl', { remove: true });
});

test('Entfernung zum Kunden über OpenStreetMap, mit Zwischenspeicher', async () => {
  const calls = [];
  const mapFetch = async (url, opts) => {
    calls.push({ url, agent: opts.headers['User-Agent'] });
    if (url.includes('nominatim')) {
      const q = new URL(url).searchParams.get('q');
      if (q.includes('Nirgendwo')) return { ok: true, json: async () => [] };
      const home = q.includes('Hauptstr');
      return { ok: true, json: async () => [{ lat: home ? '50.1' : '50.2', lon: home ? '8.6' : '8.7', display_name: home ? 'Hauptstraße 1, Musterstadt, Hessen, 12345, Deutschland' : 'Gartenweg 5, Nachbarort, Hessen, 12346, Deutschland' }] };
    }
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 12345, duration: 960 }] }) };
  };
  const store = new Store(path.join(dir, 'route.json'));
  await store.load();
  const app = createApp({ store, printers: null, publicDir: path.join(root, 'public'), mapFetch });
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  const post = async (body) => {
    const r = await fetch(url + '/api/entfernung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  assert.match((await post({ to: 'Gartenweg 5, 12346 Nachbarort' })).body.error, /Deine Adresse fehlt/);
  store.data.settings.homeAddress = 'Hauptstr. 1\n12345 Musterstadt';
  const r = await post({ to: 'Gartenweg 5\n12346 Nachbarort' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.km, r.body.minutes], [12.3, 16]);
  assert.equal(r.body.from, 'Hauptstraße 1, Musterstadt, Hessen, 12345');
  assert.ok(calls.every((c) => /Filament-Lager/.test(c.agent)));
  assert.match(calls.find((c) => c.url.includes('nominatim')).url, /Hauptstr\.%201%2C%2012345%20Musterstadt/);
  // zweites Mal aus dem Speicher, ohne Abfrage
  const before = calls.length;
  assert.equal((await post({ to: 'gartenweg 5, 12346 nachbarort' })).body.km, 12.3);
  assert.equal(calls.length, before);
  assert.match((await post({ to: 'Nirgendwo 1' })).body.error, /nicht gefunden/);
  assert.match((await post({ to: '' })).body.error, /Adresse des Kunden/);
  srv.close();
});

test('Verschenkt: anlegen zieht vom Vorrat ab, löschen bringt zurück, kein Beleg', async () => {
  const { body: made } = await call('POST', '/api/vorrat', { title: 'Probe-Herz', made: 5, price: 2, parts: { filament: 0.1, labor: 0.05 } });
  const item = made.item;
  const salesBefore = (await call('GET', '/api/verkaeufe')).body.sales.length;
  assert.equal((await call('POST', '/api/geschenke', { items: [{ title: 'Herz', qty: 1, cost: 0.2 }] })).status, 400); // wem?
  const g = await call('POST', '/api/geschenke', {
    customer: 'Oma Erna', reason: 'Geschenk', items: [{ title: item.title, qty: 2, stockId: item.id, breakdown: { cost: item.parts.cost } }],
  });
  assert.equal(g.status, 201);
  assert.deepEqual([g.body.item.reason, g.body.item.qty, g.body.item.cost], ['Geschenk', 2, 0.3]);
  const st = g.body.stock.find((x) => x.id === item.id);
  assert.deepEqual([st.onHand, st.given, st.sold], [3, 2, 0]);
  assert.equal((await call('GET', '/api/verkaeufe')).body.sales.length, salesBefore); // kein Beleg
  assert.equal((await call('POST', '/api/geschenke', { customer: 'X', items: [{ title: item.title, qty: 9, stockId: item.id }] })).status, 409);
  const upd = await call('PUT', `/api/geschenke/${g.body.item.id}`, { note: 'zum Geburtstag', items: [] });
  assert.deepEqual([upd.body.item.note, upd.body.item.qty], ['zum Geburtstag', 2]); // Teile bleiben
  const del = await call('DELETE', `/api/geschenke/${g.body.item.id}`);
  assert.equal(del.body.gifts.length, 0);
  assert.equal(del.body.stock.find((x) => x.id === item.id).onHand, 5);
});

test('Farbkarte: Link ohne Passwort, nur Farben, kein Gramm', async () => {
  const view = (token) => fetch(base + '/api/farbkarte', { headers: token ? { 'X-Zugang': token } : {} });
  assert.equal((await view()).status, 403);
  const { body: link } = await call('POST', '/api/farbkarte/link', {});
  assert.match(link.token, /^[A-Za-z0-9_-]{24}$/);
  const res = await view(link.token);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(d.materials.length > 0);
  const text = JSON.stringify(d);
  for (const secret of ['netWeight', 'grams', 'location', 'price', '"nr"']) assert.equal(text.includes(secret), false, secret);
  assert.ok(d.materials.every((m) => m.colors.every((c) => ['da', 'wenig'].includes(c.level))));
  // anderer Schlüssel als die Strom-Ansicht
  const { body: strom } = await call('POST', '/api/teilen', {});
  assert.equal((await view(strom.token)).status, 403);
  await call('DELETE', '/api/teilen');
  await call('DELETE', '/api/farbkarte/link');
  assert.equal((await view(link.token)).status, 403);
  assert.equal((await fetch(base + '/farben.html')).status, 200);
});

test('Katalog: Teile anlegen, ändern, löschen', async () => {
  assert.equal((await call('POST', '/api/katalog', { name: '' })).status, 400);
  const made = await call('POST', '/api/katalog', { name: 'Kürbis', grams: '8', perPlate: 25, price: '1,50', photo: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(made.status, 201);
  assert.deepEqual([made.body.item.grams, made.body.item.perPlate, made.body.item.price], [8, 25, 1.5]);
  const upd = await call('PUT', `/api/katalog/${made.body.item.id}`, { price: 2 });
  assert.deepEqual([upd.body.item.price, upd.body.item.photo.startsWith('data:image/png')], [2, true]);
  assert.equal((await call('GET', '/api/katalog')).body.products.length, 1);
  assert.equal((await call('DELETE', `/api/katalog/${made.body.item.id}`)).body.products.length, 0);
});

test('Termin am Beleg: speichern, auf der Kundenseite, neue Zeit erinnert neu', async () => {
  const created = await call('POST', '/api/verkaeufe', { date: '2026-10-28', customer: 'Tom', items: [{ title: 'Clip', qty: 1, price: 2 }] });
  const id = created.body.sale.id;
  const r1 = await call('PUT', `/api/verkaeufe/${id}/bestellung`, { link: 'neu', delivery: 'abholung', appointment: { at: '2026-11-02T15:00:00.000Z', note: 'klingeln' } });
  const a = r1.body.sale.order.appointment;
  assert.deepEqual([a.at, a.note, a.reminded], ['2026-11-02T15:00:00.000Z', 'klingeln', '']);
  assert.ok(a.setAt);
  const pub = await (await fetch(base + '/api/bestellung', { headers: { 'X-Zugang': r1.body.sale.order.token } })).json();
  assert.deepEqual(pub.order.appointment, { at: '2026-11-02T15:00:00.000Z', note: 'klingeln' });
  // gleiche Zeit behält setAt, leer entfernt den Termin
  const r2 = await call('PUT', `/api/verkaeufe/${id}/bestellung`, { appointment: { at: '2026-11-02T15:00:00.000Z', note: 'klingeln' } });
  assert.equal(r2.body.sale.order.appointment.setAt, a.setAt);
  const r3 = await call('PUT', `/api/verkaeufe/${id}/bestellung`, { appointment: { at: '' } });
  assert.equal(r3.body.sale.order.appointment, null);
  await call('DELETE', `/api/verkaeufe/${id}`);
});
