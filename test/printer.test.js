import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { normalizeSpool } from '../public/js/domain.js';
import { reconcileAms } from '../src/bambu/ams.js';
import { PrinterManager, emptyPrinterState, mergeReport, stateView } from '../src/bambu/printer.js';

const RFID = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

function report() {
  return {
    ams: {
      ams: [{
        id: '0',
        humidity: '4',
        humidity_raw: '23',
        temp: '24.5',
        tray: [
          { id: '0', tray_type: 'PLA', tray_sub_brands: 'PLA Basic', tray_info_idx: 'GFA00', tray_color: 'FF6A13FF',
            tray_weight: '1000', remain: 62, tray_uuid: RFID, tag_uid: '1234567890AB0100', cols: ['FF6A13FF'] },
          { id: '1', tray_type: 'PETG', tray_sub_brands: '', tray_info_idx: 'GFG99', tray_color: '000000FF',
            tray_weight: '0', remain: 100, tray_uuid: '00000000000000000000000000000000', tag_uid: '0000000000000000' },
          { id: '2' },
          { id: '3', tray_type: 'PLA', tray_info_idx: 'GFA00', tray_color: 'FFFFFFFF', remain: -1, tray_uuid: '0' },
        ],
      }],
      tray_exist_bits: '3',
      tray_now: '1',
    },
    vt_tray: { id: '254', tray_type: '', tray_color: '00000000' },
    gcode_state: 'RUNNING',
    mc_percent: 40,
    subtask_name: 'Halter',
  };
}

test('AMS-Bericht wird gelesen', () => {
  const state = mergeReport(emptyPrinterState(), report());
  const v = stateView(state);
  assert.equal(v.units.length, 1);
  assert.equal(v.units[0].label, 'AMS A');
  assert.equal(v.units[0].humidity, 23);
  const [a1, a2, a3, a4] = v.units[0].slots;
  assert.equal(a1.slot, 'A1');
  assert.equal(a1.rfid, RFID);
  assert.equal(a1.remainPct, 62);
  assert.equal(a1.estimatedNet, 620);
  assert.equal(a1.colorName, 'Orange');
  assert.equal(a2.name, 'PETG');
  assert.equal(a2.rfid, '');
  assert.equal(a2.remainPct, null); // ohne RFID kein Füllstand
  assert.equal(a2.active, true);
  assert.equal(a3.empty, true);
  assert.equal(a4.empty, true); // laut tray_exist_bits nicht eingelegt
  assert.deepEqual(v.external, []);
  assert.equal(v.gcodeState, 'RUNNING');
});

test('Teilberichte von P1/A1 werden zusammengeführt', () => {
  const state = mergeReport(emptyPrinterState(), report());
  mergeReport(state, { ams: { ams: [{ id: '0', tray: [{ id: '0', remain: 55 }] }] } });
  mergeReport(state, { mc_percent: 41 });
  const a1 = stateView(state).units[0].slots[0];
  assert.equal(a1.remainPct, 55);
  assert.equal(a1.colorHex, '#FF6A13');
  assert.equal(stateView(state).progress, 41);
  mergeReport(state, { ams: { ams: [{ id: '0', tray: [{ id: '0' }] }], tray_exist_bits: '2' } });
  assert.equal(stateView(state).units[0].slots[0].empty, true);
});

test('Abgleich setzt "im AMS" per RFID und löst Zuordnungen leerer Slots', () => {
  const state = mergeReport(emptyPrinterState(), report());
  const slots = stateView(state).units[0].slots;
  const printers = [{ printerId: 'p1', slots }];
  const orange = normalizeSpool({ colorName: 'Orange', netWeight: 900, bambu: { rfid: RFID } });
  const petg = normalizeSpool({ material: 'PETG', colorName: 'Schwarz', inAms: true, bambu: { printerId: 'p1', slot: 'A2', slotColor: '#000000' } });
  const gone = normalizeSpool({ colorName: 'Weiß', inAms: true, bambu: { printerId: 'p1', slot: 'A3', slotColor: '#FFFFFF' } });
  const manual = normalizeSpool({ colorName: 'Blau', inAms: true });
  const changes = reconcileAms([orange, petg, gone, manual], printers, { amsWeights: true });
  const byId = Object.fromEntries(changes.map((c) => [c.id, c.patch]));
  assert.deepEqual(byId[orange.id], { inAms: true, netWeight: 620, opened: true, bambu: { printerId: 'p1', slot: 'A1', slotColor: '#FF6A13' } });
  assert.equal(byId[petg.id], undefined);
  assert.deepEqual(byId[gone.id], { inAms: false, bambu: { printerId: '', slot: '', slotColor: '' } });
  assert.equal(byId[manual.id], undefined); // ohne Slot-Zuordnung nicht anfassen
});

test('Andere Farbe im Slot löst die Zuordnung', () => {
  const state = mergeReport(emptyPrinterState(), report());
  const printers = [{ printerId: 'p1', slots: stateView(state).units[0].slots }];
  const spool = normalizeSpool({ colorName: 'Rot', inAms: true, bambu: { printerId: 'p1', slot: 'A2', slotColor: '#C12E1F' } });
  const [c] = reconcileAms([spool], printers);
  assert.equal(c.patch.inAms, false);
});

test('PrinterManager verbindet per MQTT und fordert den vollen Status an', () => {
  const published = [];
  const subscribed = [];
  let opts = null;
  const fakeConnect = (url, o) => {
    opts = { url, ...o };
    const client = new EventEmitter();
    client.connected = true;
    client.subscribe = (t) => subscribed.push(t);
    client.publish = (t, m) => published.push([t, JSON.parse(m)]);
    client.end = () => {};
    setImmediate(() => {
      client.emit('connect');
      client.emit('message', 'device/SN1/report', Buffer.from(JSON.stringify({ print: report() })));
    });
    return client;
  };
  const pm = new PrinterManager({ connect: fakeConnect });
  return new Promise((resolve) => {
    let updates = 0;
    pm.on('update', () => {
      updates += 1;
      if (updates < 2) return;
      assert.equal(opts.url, 'mqtts://192.168.1.20:8883');
      assert.equal(opts.username, 'bblp');
      assert.equal(opts.password, 'abcd1234');
      assert.deepEqual(subscribed, ['device/SN1/report']);
      assert.equal(published[0][0], 'device/SN1/request');
      assert.equal(published[0][1].pushing.command, 'pushall');
      const [view] = pm.view([{ id: 'p1', name: 'P1S', host: '192.168.1.20', serial: 'SN1' }]);
      assert.equal(view.status, 'verbunden');
      assert.equal(view.units[0].slots[0].slot, 'A1');
      assert.equal(pm.findSlot('p1', 'A1').rfid, RFID);
      assert.equal(pm.liveSlots()[0].slots.length, 4);
      pm.stopAll();
      resolve();
    });
    pm.sync([{ id: 'p1', name: 'P1S', host: '192.168.1.20', serial: 'SN1', accessCode: 'abcd1234' }]);
  });
});

test('Gelernte RFID: Spule von Hand in einen Slot gelegt, Bambu-Spule steckt dort', () => {
  const state = mergeReport(emptyPrinterState(), report());
  const printers = [{ printerId: 'cloud:SN1', slots: stateView(state).units[0].slots }];
  // Orange liegt laut "Plätze" in A1, dort steckt eine orange Bambu-Spule mit RFID
  const orange = normalizeSpool({ colorName: 'Orange', colorHex: '#FF6A13', inAms: true, bambu: { slot: 'A1' } });
  // Blau in A2: dort steckt eine schwarze Spule ohne RFID, Farbe wird gemerkt
  const blau = normalizeSpool({ colorName: 'Blau', inAms: true, bambu: { slot: 'A2' } });
  const [c1, c2] = reconcileAms([orange, blau], printers);
  assert.deepEqual(c1.patch.bambu, { printerId: 'cloud:SN1', slotColor: '#FF6A13', rfid: RFID });
  assert.deepEqual(c2.patch.bambu, { printerId: 'cloud:SN1', slotColor: '#000000' });
  // Grün in A1 passt farblich nicht zur orangen Spule: Zuordnung wird gelöst
  const gruen = normalizeSpool({ colorName: 'Bambus Grün', inAms: true, bambu: { slot: 'A1' } });
  const [c3] = reconcileAms([gruen], printers);
  assert.equal(c3.patch.inAms, false);
});

test('Cloud-Verbindung nutzt Bambu-Konto statt IP und Zugangscode', () => {
  let opts = null;
  const fakeConnect = (url, o) => {
    opts = { url, ...o };
    const client = new EventEmitter();
    client.subscribe = () => {};
    client.publish = () => {};
    client.end = () => {};
    return client;
  };
  const pm = new PrinterManager({ connect: fakeConnect });
  pm.sync([{ id: 'cloud:SN1', name: 'P1S', kind: 'cloud', host: 'us.mqtt.bambulab.com', serial: 'SN1', username: 'u_42', accessCode: 'TOKEN' }]);
  assert.equal(opts.url, 'mqtts://us.mqtt.bambulab.com:8883');
  assert.equal(opts.username, 'u_42');
  assert.equal(opts.password, 'TOKEN');
  assert.equal(opts.rejectUnauthorized, true);
  const [v] = pm.view([{ id: 'cloud:SN1', name: 'P1S', kind: 'cloud', serial: 'SN1' }]);
  assert.equal(v.kind, 'cloud');
  assert.equal(JSON.stringify(v).includes('TOKEN'), false);
  pm.stopAll();
});

test('Spulen "im AMS, Slot unbekannt" werden den Bambu-Spulen im AMS zugeordnet', () => {
  const state = mergeReport(emptyPrinterState(), report());
  const printers = [{ printerId: 'p1', slots: stateView(state).units[0].slots }];
  const orange = normalizeSpool({ colorName: 'Orange', inAms: true }); // A1 ist orange mit RFID
  const gelb = normalizeSpool({ colorName: 'Gelb', inAms: true }); // keine passende Spule
  const imPaket = normalizeSpool({ colorName: 'Orange', location: '3' }); // nicht im AMS: bleibt
  const changes = reconcileAms([gelb, imPaket, orange], printers);
  assert.deepEqual(changes, [{ id: orange.id, patch: { bambu: { printerId: 'p1', slot: 'A1', slotColor: '#FF6A13', rfid: RFID } } }]);
});
