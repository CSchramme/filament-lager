// Gleicht den Status "im AMS" der Lagerspulen mit den Live-Daten der Drucker ab.
//
// Eine Spule gilt als eingelegt, wenn ihre RFID-Kennung in einem Slot steckt
// oder sie einem Slot zugeordnet wurde (von Hand unter "Plätze" oder in der
// AMS-Ansicht) und dort noch passt. Steckt in diesem Slot eine Bambu-Spule mit
// unbekannter RFID und ähnlicher Farbe, merkt sich die Lagerspule diese RFID;
// danach wird sie in jedem Slot automatisch erkannt. Spulen, die nur als
// "im AMS" (ohne Slot) markiert sind, bekommen so die passende Bambu-Spule
// nach Material und ähnlichster Farbe. Wird der Slot leer oder liegt dort
// eine andere Spule, wird die Zuordnung gelöst.
import { colorDistance, filamentTypeOf } from '../../public/js/domain.js';

const MAX_COLOR_DISTANCE = 60;
const OUT = { inAms: false, printerId: '', slot: '', slotColor: '' };

function patchIfChanged(spool, next) {
  const b = spool.bambu;
  const patch = {};
  if (next.inAms !== spool.inAms) patch.inAms = next.inAms;
  if (next.netWeight !== undefined && next.netWeight !== spool.netWeight) {
    patch.netWeight = next.netWeight;
    patch.opened = true;
  }
  const bambu = {};
  for (const k of ['printerId', 'slot', 'slotColor', 'rfid']) if (next[k] !== undefined && next[k] !== b[k]) bambu[k] = next[k];
  if (Object.keys(bambu).length) patch.bambu = bambu;
  return Object.keys(patch).length ? { id: spool.id, patch } : null;
}

export function reconcileAms(spools, printers, { amsWeights = false } = {}) {
  const live = new Map(printers.map((p) => [p.printerId, new Map(p.slots.map((s) => [s.slot, s]))]));
  // Von Hand zugeordnete Slots gehören zum Drucker, wenn es nur einen gibt.
  const onlyPrinter = printers.length === 1 ? printers[0].printerId : '';
  const byRfid = new Map();
  for (const p of printers) {
    for (const s of p.slots) if (!s.empty && s.rfid) byRfid.set(s.rfid, { printerId: p.printerId, tray: s });
  }
  const knownRfids = new Set(spools.map((s) => s.bambu.rfid).filter(Boolean));
  const changes = [];
  for (const spool of spools) {
    const b = spool.bambu;
    const hit = b.rfid ? byRfid.get(b.rfid) : null;
    let next = null;
    if (hit) {
      next = { inAms: true, printerId: hit.printerId, slot: hit.tray.slot, slotColor: hit.tray.colorHex };
      if (amsWeights && hit.tray.remainPct !== null) {
        next.netWeight = Math.min(spool.purchaseWeight, Math.round((spool.purchaseWeight * hit.tray.remainPct) / 100));
      }
    } else {
      const pid = b.printerId || (spool.inAms && b.slot ? onlyPrinter : '');
      if (!pid || !b.slot || !live.has(pid)) continue;
      const tray = live.get(pid).get(b.slot);
      if (!tray || tray.empty || b.rfid) {
        next = OUT; // Slot leer oder die eigene RFID steckt nirgends mehr
      } else if (tray.rfid) {
        const learn = !knownRfids.has(tray.rfid) && colorDistance(tray.colorHex, spool.colorHex) <= MAX_COLOR_DISTANCE;
        next = learn ? { inAms: true, printerId: pid, slot: b.slot, slotColor: tray.colorHex, rfid: tray.rfid } : OUT;
        if (learn) knownRfids.add(tray.rfid);
      } else if (!b.slotColor || tray.colorHex === b.slotColor) {
        next = { inAms: true, printerId: pid, slot: b.slot, slotColor: tray.colorHex };
      } else {
        next = OUT; // andere Farbe im Slot: dort liegt jetzt eine andere Spule
      }
    }
    const c = patchIfChanged(spool, next);
    if (c) changes.push(c);
  }

  // Unbekannte Bambu-Spulen den Lagerspulen "im AMS, Slot unbekannt" zuordnen.
  const touched = new Set(changes.map((c) => c.id));
  const loose = spools.filter((s) => s.inAms && !s.bambu.slot && !s.bambu.rfid && !touched.has(s.id));
  for (const p of printers) {
    for (const tray of p.slots) {
      if (tray.empty || !tray.rfid || knownRfids.has(tray.rfid)) continue;
      let best = null;
      for (const s of loose) {
        if (touched.has(s.id) || (tray.type && filamentTypeOf(s.material) !== tray.type)) continue;
        const d = colorDistance(s.colorHex, tray.colorHex);
        if (d <= MAX_COLOR_DISTANCE && (!best || d < best.d)) best = { s, d };
      }
      if (!best) continue;
      touched.add(best.s.id);
      knownRfids.add(tray.rfid);
      changes.push({ id: best.s.id, patch: { bambu: { printerId: p.printerId, slot: tray.slot, slotColor: tray.colorHex, rfid: tray.rfid } } });
    }
  }
  return changes;
}
