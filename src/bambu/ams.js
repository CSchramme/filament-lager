// Gleicht den Status "im AMS" der Lagerspulen mit den Live-Daten der Drucker ab.
//
// Eine Spule gilt als eingelegt, wenn ihre RFID-Kennung in einem Slot steckt
// oder sie von Hand mit einem Slot verknüpft wurde und dort noch dieselbe
// Farbe liegt. Wird der Slot leer oder liegt dort eine andere Spule, wird die
// Verknüpfung gelöst.

function patchIfChanged(spool, next) {
  const b = spool.bambu;
  const patch = {};
  if (next.inAms !== spool.inAms) patch.inAms = next.inAms;
  if (next.netWeight !== undefined && next.netWeight !== spool.netWeight) {
    patch.netWeight = next.netWeight;
    patch.opened = true;
  }
  const bambu = {};
  for (const k of ['printerId', 'slot', 'slotColor']) if (next[k] !== b[k]) bambu[k] = next[k];
  if (Object.keys(bambu).length) patch.bambu = bambu;
  return Object.keys(patch).length ? { id: spool.id, patch } : null;
}

export function reconcileAms(spools, printers, { amsWeights = false } = {}) {
  const live = new Map(printers.map((p) => [p.printerId, new Map(p.slots.map((s) => [s.slot, s]))]));
  const byRfid = new Map();
  for (const p of printers) {
    for (const s of p.slots) if (!s.empty && s.rfid) byRfid.set(s.rfid, { printerId: p.printerId, tray: s });
  }
  const changes = [];
  for (const spool of spools) {
    const b = spool.bambu;
    const hit = b.rfid ? byRfid.get(b.rfid) : null;
    if (hit) {
      const next = { inAms: true, printerId: hit.printerId, slot: hit.tray.slot, slotColor: hit.tray.colorHex };
      if (amsWeights && hit.tray.remainPct !== null) {
        next.netWeight = Math.min(spool.purchaseWeight, Math.round((spool.purchaseWeight * hit.tray.remainPct) / 100));
      }
      const c = patchIfChanged(spool, next);
      if (c) changes.push(c);
      continue;
    }
    if (!b.printerId || !b.slot || !live.has(b.printerId)) continue;
    const tray = live.get(b.printerId).get(b.slot);
    const stillThere = tray && !tray.empty && !b.rfid && !tray.rfid && (!b.slotColor || tray.colorHex === b.slotColor);
    const next = stillThere
      ? { inAms: true, printerId: b.printerId, slot: b.slot, slotColor: b.slotColor }
      : { inAms: false, printerId: '', slot: '', slotColor: '' };
    const c = patchIfChanged(spool, next);
    if (c) changes.push(c);
  }
  return changes;
}
