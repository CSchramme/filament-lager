// Benachrichtigungen aufs Handy über ntfy (kostenlose App "ntfy" für iOS und
// Android, dort das Thema abonnieren). Gemeldet wird: Druck fertig,
// abgebrochen oder pausiert (z. B. Filament leer) und eine Rolle wird knapp.
// Das Thema ist zufällig und wirkt wie ein Passwort: Wer es kennt, liest mit.
import crypto from 'node:crypto';
import { stockLevel } from '../public/js/domain.js';

export const EVENTS = ['done', 'failed', 'paused', 'low'];

export function newTopic() {
  return 'filament-lager-' + crypto.randomBytes(8).toString('hex');
}

export function normalizeNotify(input) {
  const src = input && typeof input === 'object' ? input : {};
  const events = src.events && typeof src.events === 'object' ? src.events : {};
  return {
    enabled: src.enabled === true,
    server: String(src.server || 'https://ntfy.sh').trim().replace(/\/+$/, ''),
    topic: String(src.topic || '').trim(),
    token: String(src.token || ''),
    appUrl: String(src.appUrl || ''),
    events: Object.fromEntries(EVENTS.map((k) => [k, events[k] !== false])),
    lowNotified: Array.isArray(src.lowNotified) ? src.lowNotified.map(String) : [],
    lastSentAt: String(src.lastSentAt || ''),
    lastError: String(src.lastError || ''),
  };
}

// Prüft Eingaben aus den Einstellungen; wirft mit verständlicher Meldung.
export function validateNotify({ server, topic }) {
  let url;
  try {
    url = new URL(server);
  } catch {
    throw new Error('Die Server-Adresse ist ungültig, z. B. https://ntfy.sh');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Die Server-Adresse muss mit https:// beginnen.');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(topic)) throw new Error('Das Thema darf nur Buchstaben, Ziffern, - und _ enthalten (6 bis 64 Zeichen).');
}

const PRINT_EVENTS = {
  // vorher -> jetzt
  FINISH: { event: 'done', title: 'Druck fertig', tags: ['white_check_mark'], priority: 3 },
  FAILED: { event: 'failed', title: 'Druck abgebrochen', tags: ['x'], priority: 4 },
  PAUSE: { event: 'paused', title: 'Druck pausiert', tags: ['pause_button'], priority: 4 },
};

export class Notifier {
  constructor({ store, fetchFn = (...a) => fetch(...a), log = console } = {}) {
    this.store = store;
    this.fetch = fetchFn;
    this.log = log;
    this.printerStates = new Map(); // Drucker-ID -> letzter gcode_state
  }

  get config() {
    if (!this.store.data.notify) this.store.data.notify = normalizeNotify();
    return this.store.data.notify;
  }

  async send({ title, message, tags = [], priority = 3, view = '' }) {
    const c = this.config;
    if (!c.topic) throw new Error('Kein Thema eingestellt.');
    const body = {
      topic: c.topic, title, message, tags, priority,
    };
    if (c.appUrl && view) body.click = `${c.appUrl}#${view}`;
    const headers = { 'Content-Type': 'application/json' };
    if (c.token) headers.Authorization = `Bearer ${c.token}`;
    try {
      const res = await this.fetch(c.server + '/', {
        method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(res.status === 401 || res.status === 403
          ? 'Der ntfy-Server verlangt eine Anmeldung. Zugangstoken prüfen.'
          : `ntfy antwortet mit Fehler ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
      }
      c.lastSentAt = new Date().toISOString();
      c.lastError = '';
    } catch (err) {
      c.lastError = err.name === 'TimeoutError' ? 'ntfy-Server antwortet nicht.' : err.message;
      throw new Error(c.lastError);
    }
  }

  // Im Hintergrund senden, Fehler nur protokollieren.
  notify(event, msg) {
    const c = this.config;
    if (!c.enabled || !c.topic || !c.events[event]) return;
    this.send(msg).catch((err) => this.log.error('Benachrichtigung nicht gesendet:', err.message));
  }

  // Wechsel des Druckstatus. Der erste bekannte Stand nach dem Start löst
  // nichts aus, sonst käme nach jedem Neustart "Druck fertig".
  printerUpdate(id, name, { gcodeState, job, progress } = {}) {
    if (!gcodeState) return;
    const prev = this.printerStates.get(id);
    this.printerStates.set(id, gcodeState);
    if (!prev || prev === gcodeState) return;
    const ev = PRINT_EVENTS[gcodeState];
    if (!ev) return;
    // "fertig" nur nach einem laufenden Druck, nicht nach Pause -> Abbruch doppelt
    if (gcodeState === 'FINISH' && !['RUNNING', 'PREPARE', 'PAUSE', 'SLICING'].includes(prev)) return;
    if (gcodeState === 'PAUSE' && prev !== 'RUNNING') return;
    const what = job ? `„${job}“` : 'Der Druck';
    const where = name ? ` auf ${name}` : '';
    const text = {
      done: `${what} ist${where} fertig.`,
      failed: `${what} wurde${where} abgebrochen${Number.isFinite(progress) && progress > 0 ? ` (bei ${progress} %)` : ''}.`,
      paused: `${what} ist${where} pausiert${Number.isFinite(progress) ? ` bei ${progress} %` : ''}. Vielleicht ist das Filament leer oder es gibt einen Fehler am Drucker.`,
    }[ev.event];
    this.notify(ev.event, {
      title: ev.title, message: text, tags: ev.tags, priority: ev.priority, view: 'drucke',
    });
  }

  // Vor jedem Speichern: Rollen, die neu knapp oder leer sind, melden. Wird eine
  // Rolle wieder voll (nachgefüllt, korrigiert), darf sie später erneut melden.
  checkStock() {
    const c = this.config;
    const { spools, settings } = this.store.data;
    const lowNow = new Set(spools.filter((s) => ['knapp', 'leer'].includes(stockLevel(s, settings))).map((s) => s.id));
    const known = new Set(c.lowNotified);
    const fresh = spools.filter((s) => lowNow.has(s.id) && !known.has(s.id));
    c.lowNotified = [...lowNow];
    for (const s of fresh) {
      const level = stockLevel(s, settings);
      const name = `#${s.nr} ${s.colorName || s.colorHex} (${s.material})`;
      this.notify('low', {
        title: level === 'leer' ? 'Rolle leer' : 'Rolle wird knapp',
        message: level === 'leer' ? `${name} ist leer.` : `${name} hat nur noch ${s.netWeight} g. Zeit zum Nachkaufen?`,
        tags: ['warning'],
        priority: 3,
        view: 'lager',
      });
    }
  }

  // Beim Einschalten: was jetzt schon knapp ist, nicht noch einmal melden.
  markCurrentStock() {
    const { spools, settings } = this.store.data;
    this.config.lowNotified = spools.filter((s) => ['knapp', 'leer'].includes(stockLevel(s, settings))).map((s) => s.id);
  }

  view() {
    const c = this.config;
    return {
      enabled: c.enabled, server: c.server, topic: c.topic, hasToken: Boolean(c.token), events: c.events, lastSentAt: c.lastSentAt, lastError: c.lastError,
    };
  }
}
