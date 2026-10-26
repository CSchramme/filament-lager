// Filament bei Druckende automatisch abbuchen: Für jeden fertigen Druck aus
// dem Bambu-Verlauf wird das Gewicht je AMS-Slot von der Lagerrolle
// abgezogen, die in diesem Slot steckt. Jeder Druck wird höchstens einmal
// gebucht und lässt sich rückgängig machen.
//
// Nicht gebucht wird, was Bambu schon selbst zählt: Rollen aus dem Bambu
// Filament Manager bei eingeschaltetem Abgleich und RFID-Rollen, deren
// Restgewicht aus dem AMS kommt. Sonst würde doppelt abgezogen.
import { colorDistance, filamentTypeOf, normalizeSpool, spoolLabel } from '../../public/js/domain.js';

const MAX_LOG = 60;
const MAX_COLOR_DISTANCE = 60;

export function normalizeAutoBook(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    since: String(src.since || ''), // nur Drucke, die danach begonnen haben
    booked: src.booked && typeof src.booked === 'object' ? { ...src.booked } : {}, // taskId -> Zeitpunkt
    log: (Array.isArray(src.log) ? src.log : []).slice(0, MAX_LOG),
  };
}

// Welche Rolle für welchen Slot? Erst die Rolle im Slot (gleiche Farbe und
// Material), sonst eine Rolle im AMS mit passender Farbe.
export function planBooking(task, spools, { autoSync = false, amsWeights = false } = {}) {
  const items = [];
  const skipped = [];
  const inAms = spools.filter((s) => s.inAms);
  for (const f of task.filaments || []) {
    if (!(f.grams > 0)) continue;
    const fits = (s) => (!f.type || filamentTypeOf(s.material) === filamentTypeOf(f.type)) && (!f.color || colorDistance(s.colorHex, f.color) <= MAX_COLOR_DISTANCE);
    let spool = f.slot && f.slot !== 'Ext' ? inAms.find((s) => s.bambu.slot === f.slot && fits(s)) : null;
    if (!spool && f.color) {
      const candidates = inAms.filter(fits).sort((a, b) => colorDistance(a.colorHex, f.color) - colorDistance(b.colorHex, f.color));
      spool = candidates[0] || null;
    }
    if (!spool) {
      skipped.push({ ...f, reason: 'keine passende Rolle im AMS' });
    } else if (autoSync && spool.bambu.cloudId) {
      skipped.push({ ...f, spoolId: spool.id, nr: spool.nr, reason: 'zählt der Bambu Filament Manager' });
    } else if (amsWeights && spool.bambu.rfid) {
      skipped.push({ ...f, spoolId: spool.id, nr: spool.nr, reason: 'Restgewicht kommt aus dem AMS' });
    } else {
      items.push({ spoolId: spool.id, slot: f.slot, grams: f.grams });
    }
  }
  return { items, skipped };
}

// Bucht einen Druck. Gibt den Protokolleintrag zurück oder null, wenn der
// Druck schon gebucht ist. spools wird verändert.
export function bookTask(state, task, spools, options, now = new Date().toISOString()) {
  if (state.booked[task.id] && !canBookAgain(state, task.id)) return null;
  const { items, skipped } = planBooking(task, spools, options);
  const done = [];
  // Mehrere Slots mit derselben Rolle zusammenfassen
  const bySpool = new Map();
  for (const it of items) bySpool.set(it.spoolId, (bySpool.get(it.spoolId) || 0) + it.grams);
  for (const [spoolId, grams] of bySpool) {
    const idx = spools.findIndex((s) => s.id === spoolId);
    const s = spools[idx];
    const before = s.netWeight;
    const after = Math.max(0, Math.round(before - grams));
    spools[idx] = normalizeSpool({ netWeight: after, opened: true }, { base: s, now });
    done.push({
      spoolId, nr: s.nr, label: spoolLabel(s), grams: Math.round(grams * 10) / 10, before, after, taken: before - after,
    });
  }
  state.booked[task.id] = now;
  const entry = {
    taskId: task.id, title: task.title, at: now, items: done, skipped: skipped.map((x) => ({ slot: x.slot, color: x.color, grams: x.grams, nr: x.nr || null, reason: x.reason })), undone: false,
  };
  state.log = [entry, ...state.log.filter((e) => e.taskId !== task.id)].slice(0, MAX_LOG);
  return entry;
}

// Von Hand noch einmal buchen geht, wenn beim letzten Mal nichts abgezogen
// wurde (z. B. Rolle noch nicht im Slot) oder die Buchung zurückgenommen ist.
export function canBookAgain(state, taskId) {
  const e = state.log.find((x) => x.taskId === taskId);
  return !e || e.undone || e.items.length === 0;
}

// Fertige Drucke seit dem Einschalten, die noch nicht gebucht sind
export function dueTasks(state, tasks) {
  const since = Date.parse(state.since) || Infinity;
  return tasks.filter((t) => t.status === 2 && !state.booked[t.id] && (Date.parse(t.startTime) || 0) >= since)
    .sort((a, b) => (Date.parse(a.startTime) || 0) - (Date.parse(b.startTime) || 0));
}

// Abgezogene Gramm wieder gutschreiben (nur was wirklich abgezogen wurde,
// eine Rolle kann nicht unter 0 g fallen). Der Druck bleibt als gebucht markiert,
// damit er nicht beim nächsten Abgleich erneut abgezogen wird.
export function undoBooking(state, taskId, spools, now = new Date().toISOString()) {
  const entry = state.log.find((e) => e.taskId === taskId);
  if (!entry || entry.undone) return null;
  for (const it of entry.items) {
    const idx = spools.findIndex((s) => s.id === it.spoolId);
    if (idx < 0) continue;
    const s = spools[idx];
    const back = it.taken ?? it.grams;
    spools[idx] = normalizeSpool({ netWeight: Math.min(Math.max(s.purchaseWeight, s.netWeight), Math.round(s.netWeight + back)) }, { base: s, now });
  }
  entry.undone = true;
  entry.undoneAt = now;
  return entry;
}
