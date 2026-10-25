// Live-Verbindung zum Drucker per MQTT (Port 8883), entweder direkt im
// Heimnetz (kind "lan", Zugangscode) oder über die Bambu Cloud (kind "cloud",
// Anmelde-Token des Bambu-Kontos). Liest nur: AMS-Slots, externe Spule und
// den Druckstatus.
import { EventEmitter } from 'node:events';
import mqtt from 'mqtt';
import { colorNameFor, materialForFilamentId, normHex } from '../../public/js/domain.js';
import { validRfid } from './sync.js';

const PUSHALL_INTERVAL_MS = 5 * 60 * 1000;

export function emptyPrinterState() {
  return { ams: {}, external: {}, trayExistBits: null, trayNow: '', gcodeState: '', progress: null, job: '', hasAms: false, lastSeen: 0 };
}

// Führt eine "print"-Nachricht mit dem bisherigen Stand zusammen. P1/A1
// schicken nur Änderungen, deshalb wird zusammengeführt statt ersetzt.
export function mergeReport(state, print) {
  if (!print || typeof print !== 'object') return state;
  const ams = print.ams;
  if (ams && typeof ams === 'object') {
    if (Array.isArray(ams.ams)) {
      state.hasAms = true;
      for (const unit of ams.ams) {
        if (!unit || unit.id === undefined) continue;
        const id = String(unit.id);
        const cur = state.ams[id] || { id, trays: {} };
        for (const k of ['humidity', 'humidity_raw', 'temp', 'info']) if (unit[k] !== undefined) cur[k] = unit[k];
        for (const t of Array.isArray(unit.tray) ? unit.tray : []) {
          if (!t || t.id === undefined) continue;
          const tid = String(t.id);
          // Ein Slot, der nur seine ID meldet, ist leer.
          cur.trays[tid] = Object.keys(t).length <= 1 ? { id: tid } : { ...(cur.trays[tid] || {}), ...t };
        }
        state.ams[id] = cur;
      }
    }
    if (ams.tray_exist_bits !== undefined) state.trayExistBits = String(ams.tray_exist_bits);
    if (ams.tray_now !== undefined) state.trayNow = String(ams.tray_now);
  }
  if (print.vt_tray && typeof print.vt_tray === 'object') {
    state.external['254'] = { ...(state.external['254'] || {}), ...print.vt_tray, id: '254' };
  }
  if (Array.isArray(print.vir_slot)) {
    for (const t of print.vir_slot) {
      if (t && t.id !== undefined) state.external[String(t.id)] = { ...(state.external[String(t.id)] || {}), ...t };
    }
  }
  if (print.gcode_state !== undefined) state.gcodeState = String(print.gcode_state);
  if (print.mc_percent !== undefined) state.progress = Number(print.mc_percent);
  if (print.subtask_name !== undefined) state.job = String(print.subtask_name);
  return state;
}

export function slotLabel(unitId, trayId) {
  const u = Number(unitId);
  const t = Number(trayId);
  if (u >= 254) return u === 254 ? 'Ext' : 'Ext ' + (u - 253);
  if (u >= 128) return 'HT' + (u - 127);
  return String.fromCharCode(65 + u) + (t + 1);
}

function trayIsEmpty(tray, unitId, existBits) {
  if (!tray || !tray.tray_type) return true;
  const u = Number(unitId);
  if (existBits && u < 128) {
    const bits = parseInt(existBits, 16);
    if (Number.isFinite(bits)) return !(bits & (1 << (u * 4 + Number(tray.id))));
  }
  return false;
}

export function trayView(tray, unitId, state) {
  const trayId = Number(tray.id);
  const view = { slot: slotLabel(unitId, trayId), unitId: String(unitId), trayId: String(trayId), empty: trayIsEmpty(tray, unitId, state.trayExistBits) };
  if (view.empty) return view;
  const rfid = validRfid(tray.tray_uuid) ? String(tray.tray_uuid).toUpperCase() : '';
  const remain = Number(tray.remain);
  // Ohne RFID ist "remain" nur ein Platzhalter.
  const remainPct = rfid && remain >= 0 && remain <= 100 ? remain : null;
  const totalWeight = Number(tray.tray_weight) > 0 ? Number(tray.tray_weight) : null;
  const colorHex = normHex(tray.tray_color);
  const u = Number(unitId);
  return {
    ...view,
    type: String(tray.tray_type || ''),
    name: String(tray.tray_sub_brands || '') || materialForFilamentId(tray.tray_info_idx) || String(tray.tray_type || ''),
    filamentId: String(tray.tray_info_idx || ''),
    colorHex,
    colorName: colorNameFor(colorHex),
    colors: (Array.isArray(tray.cols) ? tray.cols : []).map(normHex).filter(Boolean),
    remainPct,
    totalWeight,
    estimatedNet: remainPct !== null && totalWeight ? Math.round((totalWeight * remainPct) / 100) : null,
    rfid,
    active: u < 128 && state.trayNow !== '' && state.trayNow === String(u * 4 + trayId),
  };
}

export function stateView(state) {
  const units = Object.values(state.ams)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((u) => ({
      id: u.id,
      label: Number(u.id) >= 128 ? 'AMS HT ' + (Number(u.id) - 127) : 'AMS ' + String.fromCharCode(65 + Number(u.id)),
      humidity: u.humidity_raw !== undefined && Number(u.humidity_raw) > 0 ? Number(u.humidity_raw) : null,
      temp: Number(u.temp) > 0 ? Number(u.temp) : null,
      slots: Object.values(u.trays).sort((a, b) => Number(a.id) - Number(b.id)).map((t) => trayView(t, u.id, state)),
    }));
  const external = Object.values(state.external)
    .map((t) => trayView(t, t.id, state))
    .filter((t) => !t.empty);
  return { units, external, gcodeState: state.gcodeState, progress: state.progress, job: state.job, hasAms: state.hasAms };
}

function friendlyError(err, kind) {
  const msg = String((err && err.message) || err);
  const authFailed = /not authorized|bad user ?name or password|code 5|code 4/i.test(msg);
  if (kind === 'cloud') {
    if (authFailed) return 'Die Bambu Cloud lehnt die Verbindung ab. Bitte unter „Bambu“ neu anmelden.';
    return 'Bambu Cloud nicht erreichbar: ' + msg;
  }
  if (authFailed) return 'Zugangscode falsch (am Drucker unter Einstellungen > WLAN/LAN ablesen).';
  if (/ECONNREFUSED/.test(msg)) return 'Drucker lehnt die Verbindung ab. Ist der LAN-Modus/Entwicklermodus für MQTT freigegeben?';
  if (/EHOSTUNREACH|ETIMEDOUT|ENETUNREACH|timeout/i.test(msg)) return 'Drucker unter dieser IP-Adresse nicht erreichbar.';
  return msg;
}

export class PrinterConnection extends EventEmitter {
  constructor(config, { connect = mqtt.connect } = {}) {
    super();
    this.config = config;
    this.connectFn = connect;
    this.state = emptyPrinterState();
    this.status = 'aus';
    this.error = '';
    this.client = null;
    this.timer = null;
  }

  start() {
    const { host, serial, accessCode, kind, username } = this.config;
    const cloud = kind === 'cloud';
    this.status = 'verbinde';
    this.client = this.connectFn(`mqtts://${host}:8883`, {
      username: cloud ? username : 'bblp',
      password: accessCode, // in der Cloud ist das der Anmelde-Token
      rejectUnauthorized: cloud, // Der Drucker selbst nutzt ein selbst signiertes Zertifikat.
      reconnectPeriod: 15000,
      connectTimeout: 10000,
      clientId: 'filament-lager-' + Math.random().toString(16).slice(2, 10),
    });
    this.client.on('connect', () => {
      this.status = 'verbunden';
      this.error = '';
      this.client.subscribe(`device/${serial}/report`);
      this.requestFullState();
      this.emit('update');
    });
    this.client.on('message', (_topic, payload) => {
      let msg;
      try {
        msg = JSON.parse(payload.toString('utf8'));
      } catch {
        return;
      }
      if (!msg.print) return;
      mergeReport(this.state, msg.print);
      this.state.lastSeen = Date.now();
      this.emit('update');
    });
    this.client.on('error', (err) => {
      this.status = 'fehler';
      this.error = friendlyError(err, kind);
      this.emit('update');
    });
    this.client.on('close', () => {
      if (this.status === 'verbunden') this.status = 'getrennt';
      this.emit('update');
    });
    this.timer = setInterval(() => this.requestFullState(), PUSHALL_INTERVAL_MS);
    this.timer.unref?.();
  }

  requestFullState() {
    if (!this.client || !this.client.connected) return;
    this.client.publish(`device/${this.config.serial}/request`,
      JSON.stringify({ pushing: { sequence_id: String(Date.now() % 100000), command: 'pushall', version: 1, push_target: 1 } }));
  }

  stop() {
    clearInterval(this.timer);
    if (this.client) this.client.end(true);
    this.client = null;
    this.status = 'aus';
  }

  view() {
    return { status: this.status, error: this.error, lastSeen: this.state.lastSeen, ...stateView(this.state) };
  }
}

// Hält je konfiguriertem Drucker eine Verbindung.
export class PrinterManager extends EventEmitter {
  constructor({ connect } = {}) {
    super();
    this.connect = connect;
    this.conns = new Map();
  }

  sync(configs) {
    const wanted = new Map(configs.filter((c) => c.enabled !== false && c.host && c.serial && c.accessCode).map((c) => [c.id, c]));
    const same = (a, b) => ['kind', 'host', 'serial', 'username', 'accessCode'].every((k) => a[k] === b[k]);
    for (const [id, conn] of this.conns) {
      const cfg = wanted.get(id);
      if (!cfg || !same(cfg, conn.config)) {
        conn.stop();
        this.conns.delete(id);
      }
    }
    for (const [id, cfg] of wanted) {
      if (this.conns.has(id)) continue;
      const conn = new PrinterConnection(cfg, this.connect ? { connect: this.connect } : {});
      conn.on('update', () => this.emit('update', id));
      this.conns.set(id, conn);
      conn.start();
    }
  }

  // Für den Abgleich: nur Drucker, deren AMS-Stand schon bekannt ist.
  liveSlots() {
    const out = [];
    for (const [id, conn] of this.conns) {
      if (conn.status !== 'verbunden' || !conn.state.hasAms) continue;
      const v = stateView(conn.state);
      out.push({ printerId: id, slots: [...v.units.flatMap((u) => u.slots), ...v.external] });
    }
    return out;
  }

  // Druckstatus eines Druckers für die Benachrichtigungen.
  status(printerId) {
    const conn = this.conns.get(printerId);
    if (!conn) return null;
    const { gcodeState, progress, job } = conn.state;
    return { gcodeState, progress, job };
  }

  findSlot(printerId, slot) {
    const conn = this.conns.get(printerId);
    if (!conn) return null;
    const v = stateView(conn.state);
    return [...v.units.flatMap((u) => u.slots), ...v.external].find((s) => s.slot === slot) || null;
  }

  view(configs) {
    return configs.map((c) => {
      const conn = this.conns.get(c.id);
      const base = { id: c.id, name: c.name, kind: c.kind || 'lan', host: c.host, serial: c.serial, enabled: c.enabled !== false };
      if (!conn) return { ...base, status: 'aus', error: '', units: [], external: [] };
      return { ...base, ...conn.view() };
    });
  }

  stopAll() {
    for (const conn of this.conns.values()) conn.stop();
    this.conns.clear();
  }
}
