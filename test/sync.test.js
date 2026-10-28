import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSettings, normalizeSpool } from '../public/js/domain.js';
import {
  applyPull, applyPush, cloudBodyFromLocal, mergedNet, pairSpools, pullPreview, pushPreview,
} from '../src/bambu/sync.js';

const RFID = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

function local(over) {
  return normalizeSpool({ material: 'PLA Basic', brand: 'Bambu Lab', purchaseWeight: 1000, ...over });
}

function cloudSpools() {
  return [
    { id: 1, filamentVendor: 'Bambu Lab', filamentType: 'PLA', filamentName: 'PLA Basic', filamentId: 'GFA00', RFID,
      color: '#FF6A13FF', netWeight: 800, totalNetWeight: 1000, note: '', inPrinter: true, amsId: 0, slotId: '1' },
    { id: 2, filamentVendor: 'Bambu Lab', filamentType: 'PLA', filamentName: 'PLA Basic', filamentId: 'GFA00', RFID: '',
      color: '#000000', netWeight: 580, totalNetWeight: 1000, note: '' },
    { id: 3, filamentVendor: 'Sunlu', filamentType: 'PETG', filamentName: 'PETG', filamentId: '', RFID: '',
      color: '#FFFFFF', netWeight: 250, totalNetWeight: 1000, note: 'Rest' },
  ];
}

function memoryStore(spools) {
  return { spools, settings: defaultSettings() };
}

test('Zuordnung über RFID, Cloud-ID und gleiche Merkmale', () => {
  const a = local({ colorName: 'Orange', netWeight: 900, bambu: { rfid: RFID } });
  const b = local({ colorName: 'Schwarz', netWeight: 600 });
  const c = local({ colorName: 'Schwarz', netWeight: 1000 });
  const d = local({ colorName: 'Weiß', netWeight: 930, bambu: { cloudId: 3 } });
  const { pairs, localOnly, cloudOnly } = pairSpools([a, b, c, d], cloudSpools());
  const how = Object.fromEntries(pairs.map((p) => [p.local.colorName + p.local.netWeight, [p.cloud.id, p.how]]));
  assert.deepEqual(how.Orange900, [1, 'rfid']);
  assert.deepEqual(how['Schwarz600'], [2, 'soft']); // näher an 580 g als die volle Spule
  assert.deepEqual(how['Weiß930'], [3, 'id']);
  assert.deepEqual(localOnly.map((s) => s.netWeight), [1000]);
  assert.equal(cloudOnly.length, 0);
});

test('Pull-Vorschau: neu, verknüpfen, aktualisieren', () => {
  const a = local({ colorName: 'Orange', netWeight: 900, bambu: { rfid: RFID, cloudId: 1 } });
  const b = local({ colorName: 'Schwarz', netWeight: 600 });
  const items = pullPreview([a, b], cloudSpools());
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey['cloud:1'].kind, 'update');
  assert.deepEqual(byKey['cloud:1'].changes.map((c) => [c.field, c.from, c.to]), [['netWeight', 900, 800], ['inAms', false, true]]);
  assert.equal(byKey['cloud:2'].kind, 'link');
  assert.equal(byKey['cloud:3'].kind, 'new');
});

test('Pull übernimmt nur ausgewählte Punkte', () => {
  const store = memoryStore([local({ colorName: 'Orange', netWeight: 900, bambu: { rfid: RFID, cloudId: 1 } })]);
  const res = applyPull(store, cloudSpools(), ['cloud:1', 'cloud:3'], { now: '2026-10-24T10:00:00Z' });
  assert.deepEqual(res, { created: 1, updated: 1 });
  assert.equal(store.spools.length, 2);
  assert.equal(store.spools[0].netWeight, 800);
  assert.equal(store.spools[0].inAms, true);
  assert.equal(store.spools[0].bambu.syncedNet, 800);
  const petg = store.spools[1];
  assert.equal(petg.material, 'PETG');
  assert.equal(petg.brand, 'Sunlu');
  assert.equal(petg.colorName, 'Weiß');
  assert.equal(petg.bambu.cloudId, 3);
  assert.equal(petg.opened, true);
});

test('Push-Vorschau und Senden an eine nachgebaute Cloud', async () => {
  const a = local({ colorName: 'Orange', netWeight: 700, bambu: { rfid: RFID, cloudId: 1 } });
  const b = local({ colorName: 'Kürbis Orange', netWeight: 1000, location: '5', note: 'Paket 5' });
  const store = memoryStore([a, b]);
  const calls = [];
  const fake = {
    async createSpool(body) {
      calls.push(['create', body]);
      return { filamentV2: { id: 99 } };
    },
    async updateSpool(body) {
      calls.push(['update', body]);
      return {};
    },
    async listSpools() {
      return [];
    },
  };
  const items = pushPreview(store.spools, cloudSpools());
  assert.deepEqual(items.map((i) => [i.key.split(':')[0], i.kind]), [['local', 'update'], ['local', 'create']]);
  const res = await applyPush(store, fake, cloudSpools(), items.map((i) => i.key));
  assert.deepEqual(res, { created: 1, updated: 1, errors: [] });
  assert.deepEqual(calls[0], ['update', { id: 1, filamentName: 'PLA Basic', netWeight: 700 }]);
  assert.equal(calls[1][1].filamentId, 'GFA00');
  assert.equal(calls[1][1].color, '#FF9016');
  assert.equal(calls[1][1].note, 'Paket 5');
  assert.equal(store.spools[1].bambu.cloudId, 99);
});

test('Push ordnet neue Cloud-IDs über die Liste zu, wenn die Antwort keine ID enthält', async () => {
  const b = local({ colorName: 'Lila', colorHex: '#5E43B7', netWeight: 93, purchaseWeight: 250 });
  const store = memoryStore([b]);
  const created = [];
  const fake = {
    async createSpool(body) {
      created.push({ ...body, id: 77 });
      return {};
    },
    async listSpools() {
      return created;
    },
  };
  await applyPush(store, fake, [], ['local:' + b.id]);
  assert.equal(store.spools[0].bambu.cloudId, 77);
});

test('Neue Cloud-Spule hat die Felder, die Bambu Studio erwartet', () => {
  const body = cloudBodyFromLocal(local({ material: 'PETG HF', colorName: 'Schwarz', netWeight: 400 }));
  assert.equal(body.filamentType, 'PETG');
  assert.equal(body.filamentId, 'GFG02');
  assert.equal(body.totalNetWeight, 1000);
  assert.equal(body.netWeight, 400);
  assert.equal(body.createType, 'manual');
});

test('Restgewicht beim Holen: gewogene Werte gehen nicht verloren', () => {
  const at = (net, syncedNet) => local({ netWeight: net, bambu: { cloudId: 1, syncedNet } });
  assert.equal(mergedNet(at(958, 958), 908, true), 908); // nur Bambu hat sich geändert (Druck)
  assert.equal(mergedNet(at(600, 958), 958, true), 600); // nur gewogen
  assert.equal(mergedNet(at(600, 958), 908, true), 600); // beides: kleinerer Wert
  assert.equal(mergedNet(at(930, null), 1000, false), 930); // erste Zuordnung: kleinerer Wert
});

test('Gleiche Spule wird auch bei leicht anderem Farbcode erkannt', () => {
  const a = local({ colorName: 'Orange', colorHex: '#FF6A13', netWeight: 237 });
  const cloud = [{ id: 7, filamentVendor: 'Bambu Lab', filamentName: 'PLA Basic', color: '#FF6B15FF', netWeight: 240, totalNetWeight: 1000 },
    { id: 8, filamentVendor: 'Bambu Lab', filamentName: 'PLA Basic', color: '#0000FFFF', netWeight: 240, totalNetWeight: 1000 }];
  const { pairs, cloudOnly } = pairSpools([a], cloud);
  assert.deepEqual(pairs.map((p) => [p.cloud.id, p.how]), [[7, 'soft']]);
  assert.deepEqual(cloudOnly.map((c) => c.id), [8]);
});

test('Automatischer Abgleich übernimmt "im AMS" nicht aus dem Filament Manager', () => {
  const store = memoryStore([local({ colorName: 'Orange', netWeight: 800, bambu: { rfid: RFID, cloudId: 1, syncedNet: 800 } })]);
  applyPull(store, cloudSpools(), 'alle', { withAms: false });
  assert.equal(store.spools[0].inAms, false);
  assert.equal(store.spools.length, 3); // die beiden anderen Cloud-Spulen kommen neu dazu
});
