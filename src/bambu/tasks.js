// Druckverlauf aus der Bambu Cloud (GET /v1/user-service/my/tasks).
// Bekannte Status: 2 = fertig, 3 = abgebrochen oder fehlgeschlagen.
import { normHex } from '../../public/js/domain.js';

const MAX_TASKS = 300;

// amsDetailMapping.ams ist ein flacher Index: 0–15 = Einheit * 4 + Slot,
// 16–23 = AMS HT, 254/255 = externe Spule.
export function slotFromAmsIndex(i) {
  const n = Number(i);
  if (n >= 0 && n < 16) return String.fromCharCode(65 + Math.floor(n / 4)) + ((n % 4) + 1);
  if (n >= 16 && n < 24) return 'HT' + (n - 15);
  if (n === 254 || n === 255) return 'Ext';
  return '';
}

export function taskSummary(t) {
  const start = Date.parse(t.startTime || '') || 0;
  const end = Date.parse(t.endTime || '') || 0;
  const estimate = Number(t.costTime) || 0;
  const status = Number(t.status) || 0;
  // Die echte Dauer nur bei fertigen Drucken; endTime kurz nach startTime heißt "läuft noch".
  const actual = status === 2 && end - start > 60000 ? Math.round((end - start) / 1000) : 0;
  return {
    id: String(t.id),
    title: String(t.title || t.designTitle || 'Druck'),
    designId: Number(t.designId) || 0,
    cover: String(t.cover || ''),
    status,
    startTime: String(t.startTime || ''),
    endTime: String(t.endTime || ''),
    seconds: actual || estimate,
    grams: Math.round((Number(t.weight) || 0) * 100) / 100,
    plate: Number(t.plateIndex) || 0,
    deviceId: String(t.deviceId || ''),
    deviceName: String(t.deviceName || t.deviceModel || ''),
    filaments: (Array.isArray(t.amsDetailMapping) ? t.amsDetailMapping : []).map((m) => ({
      slot: slotFromAmsIndex(m.ams),
      color: normHex(m.targetColor) || normHex(m.sourceColor),
      type: String(m.targetFilamentType || m.filamentType || ''),
      filamentId: String(m.filamentId || ''),
      grams: Math.round((Number(m.weight) || 0) * 100) / 100,
    })),
  };
}

// Neue Einträge vorne einsortieren, vorhandene aktualisieren (z. B. Titelbild-Link).
export function mergeTasks(existing, fresh) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const t of fresh) byId.set(t.id, t);
  return [...byId.values()]
    .sort((a, b) => (Date.parse(b.startTime) || 0) - (Date.parse(a.startTime) || 0))
    .slice(0, MAX_TASKS);
}
