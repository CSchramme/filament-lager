// HTTP-Schnittstelle des Filament-Lagers und Auslieferung der Weboberfläche.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import {
  applyPriceChanges, applyStockSale, archiveSpool, colorNameFor, openPower, mergeStock, newId, normalizeCustomer, normalizeExpense, nextOfferNr, nextReceiptNr, normalizeOffer, normalizePowerPayment, normalizeSale,
  normalizeSettings, normalizeSpool, normalizeStockItem, normalizeTracking, planMove, planPlaces, priceListChanges, saleFromOffer, salesSummary,
  validTrackingNumber, ORDER_STEPS, advanceOrder, newToken, normalizeDelivery, normalizeOrder, setOrderStatus, spoolsFromDelivery, trackingUrl,
} from '../public/js/domain.js';
import { seedSpools } from '../public/js/seed.js';
import {
  accountFromToken, BambuCloud, CloudError, mqttHost,
} from './bambu/cloud.js';
import { reconcileAms } from './bambu/ams.js';
import { applyPull, applyPush, pullPreview, pushPreview } from './bambu/sync.js';
import { mergeTasks, taskSummary } from './bambu/tasks.js';
import {
  bookTask, canBookAgain, dueTasks, normalizeAutoBook, undoBooking,
} from './bambu/autobook.js';
import { createAuth } from './auth.js';
import { createPublicApi, newApiKey } from './api-v1.js';
import {
  EVENTS, newTopic, normalizeNotify, Notifier, validateNotify,
} from './notify.js';
import { Tracker } from './dhl.js';
import { Backups, withoutSecrets } from './backup.js';
import { Router } from './route.js';

// Versionskennung der Oberfläche aus Name, Größe und Änderungszeit der Module
// und Stylesheets. index.html lädt damit "app.js?v=…", sodass der Browser nach
// einem Update nie alte Dateien aus seinem Cache mit neuen mischt.
export async function assetVersion(publicDir) {
  const files = [];
  for (const dir of ['js', 'css']) {
    const names = await fs.readdir(path.join(publicDir, dir)).catch(() => []);
    for (const name of names.filter((n) => /\.(js|css)$/.test(n)).sort()) {
      const st = await fs.stat(path.join(publicDir, dir, name));
      files.push({ file: `${dir}/${name}`, sig: `${st.size}:${Math.round(st.mtimeMs)}` });
    }
  }
  const v = crypto.createHash('sha1').update(files.map((f) => `${f.file}:${f.sig}`).join('\n')).digest('hex').slice(0, 10);
  return { v, modules: files.filter((f) => f.file.endsWith('.js')).map((f) => f.file) };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// requirePassword: auf einem Webserver (Plesk) ohne gesetztes Passwort
// bleibt die Schnittstelle gesperrt, damit niemand den Bestand ändern kann.
export function createApp({
  store, printers, publicDir, password = '', requirePassword = false, cloudFactory = (opts) => new BambuCloud(opts),
  notifyFetch = (...a) => fetch(...a), dhlFetch = (...a) => fetch(...a), mapFetch = (...a) => fetch(...a), backupDir = path.join(path.dirname(store.file), 'backups'),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  const json = express.json({ limit: '5mb' });
  const RESTORE = '/api/sicherungen/zurueckholen';
  app.use((req, res, next) => (req.path === RESTORE ? next() : json(req, res, next)));
  // Die Oberfläche selbst enthält keine Lagerdaten und ist ohne Anmeldung abrufbar.
  // version.json gibt es nicht als Datei; auch auf Plesk, wo der Webserver die
  // übrigen Dateien selbst ausliefert, beantwortet sie deshalb immer die App.
  app.get('/version.json', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await assetVersion(publicDir));
  });
  app.use(express.static(publicDir, {
    // immer beim Server nachfragen (Antwort 304, wenn unverändert)
    setHeaders: (res, file) => {
      if (/\.(html|js|css)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  const auth = createAuth(password);
  const authState = (req) => {
    if (!password) return requirePassword ? 'missing' : 'none';
    return auth.isLoggedIn(req) ? 'ok' : 'required';
  };

  app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'server', auth: authState(req) }));

  app.post('/api/login', (req, res) => {
    if (!password) throw new HttpError(400, 'Für dieses Lager ist kein Passwort eingerichtet.');
    const result = auth.login(req, res, String((req.body || {}).password || ''));
    if (result === 'gesperrt') throw new HttpError(429, 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.');
    if (result === 'falsch') throw new HttpError(401, 'Das Passwort ist falsch.');
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    auth.logout(req, res);
    res.json({ ok: true });
  });

  // Lese-API für andere Programme, eigener Schlüssel statt Anmeldung.
  app.use('/api/v1', createPublicApi({
    store,
    apiKey: () => store.data.apiKey || '',
    isLoggedIn: (req) => ['ok', 'none'].includes(authState(req)),
  }));

  // Nur-Lese-Ansicht der Stromabrechnung (z. B. für Papa) über einen geheimen
  // Link: strom.html#t=… schickt den Schlüssel im Header, damit er nicht in
  // Server-Protokollen landet. Zeigt nur Strom, keine Kunden oder Belege.
  const shareOk = (token) => {
    const want = store.data.share && store.data.share.token;
    if (!want || !token) return false;
    const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
    return crypto.timingSafeEqual(h(token), h(want));
  };

  app.get('/api/strom-ansicht', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!shareOk(req.get('x-zugang'))) throw new HttpError(403, 'Dieser Link gilt nicht mehr. Bitte nach einem neuen fragen.');
    // Verlauf auffrischen, wenn er älter als 10 Minuten ist (höchstens 8 Sekunden warten)
    const c = cloudCfg();
    if (c.token && Date.now() - (Date.parse(c.lastTasksAt) || 0) > 10 * 60 * 1000) {
      await Promise.race([refreshTasks().catch(() => {}), new Promise((r) => { setTimeout(r, 8000).unref(); })]);
    }
    const { settings } = store.data;
    const power = openPower({
      tasks: store.data.tasks || [], sales: store.data.sales, payments: store.data.powerPayments, settings,
    });
    const printing = printers && typeof printers.status === 'function'
      ? printerConfigs().map((p) => ({ name: p.name, ...(printers.status(p.id) || {}) })).filter((p) => p.gcodeState) : [];
    res.json({
      payee: settings.powerPayee,
      seller: settings.sellerName,
      energyPrice: settings.energyPrice,
      printerWatts: settings.printerWatts,
      power,
      payments: store.data.powerPayments,
      printing: printing.map((p) => ({
        name: p.name, gcodeState: p.gcodeState, job: p.job || '', progress: Number.isFinite(p.progress) ? p.progress : null,
      })),
      lastSync: c.lastTasksAt || '',
      generatedAt: new Date().toISOString(),
    });
  });

  // Bestellstatus für den Kunden: bestellung.html#t=… schickt den Schlüssel der
  // Bestellung im Header. Zeigt nur diese Bestellung, ohne Kosten und Adresse.
  const LIVE = ['RUNNING', 'PREPARE', 'PAUSE'];
  const findOrder = (token) => {
    if (!token || token.length > 64) return null;
    const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
    const want = h(token);
    return store.data.sales.find((s) => s.order && s.order.token && crypto.timingSafeEqual(h(s.order.token), want)) || null;
  };

  function publicOrder(sale) {
    const { settings } = store.data;
    const o = sale.order;
    const t = sale.tracking;
    let live = null;
    if (o.status === 'druck' && o.printJob && printers && typeof printers.status === 'function') {
      const st = printers.status(o.printJob.printerId);
      if (st && st.job === o.printJob.job && LIVE.includes(st.gcodeState)) {
        live = {
          state: st.gcodeState, progress: st.progress ?? null, remaining: st.remaining ?? null, layer: st.layer ?? null, layers: st.layers ?? null,
        };
      }
    }
    return {
      nr: sale.nr,
      date: sale.date,
      seller: settings.sellerName,
      contact: settings.sellerAddress,
      customer: sale.customer.split('\n')[0].trim(),
      items: sale.items.filter((i) => i.kind !== 'versand').map((i) => ({
        title: i.title, qty: i.qty, material: i.material, colorName: i.colorName, colorHex: i.colorHex,
      })),
      price: sale.price,
      order: {
        status: o.status, delivery: o.delivery, history: o.history, expectedAt: o.expectedAt, note: o.note,
      },
      live,
      tracking: t ? {
        number: t.number, status: t.status, statusText: t.statusText, place: t.place, updatedAt: t.updatedAt, deliveredAt: t.deliveredAt, events: t.events, url: trackingUrl(t),
      } : null,
    };
  }

  app.get('/api/bestellung', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let sale = findOrder(req.get('x-zugang'));
    if (!sale) throw new HttpError(404, 'Diese Bestellung gibt es nicht oder der Link gilt nicht mehr. Bitte nach einem neuen Link fragen.');
    // DHL-Stand auffrischen, wenn älter als 30 Minuten (höchstens 8 Sekunden warten)
    const t = sale.tracking;
    if (t && t.status !== 'delivered' && tracker.config.apiKey && Date.now() - (Date.parse(t.checkedAt) || 0) > 30 * 60 * 1000) {
      await Promise.race([tracker.check(sale.id).catch(() => {}), new Promise((r) => { setTimeout(r, 8000).unref(); })]);
      sale = store.data.sales.find((x) => x.id === sale.id) || sale;
    }
    res.json(publicOrder(sale));
  });

  app.use('/api', (req, res, next) => {
    const state = authState(req);
    if (state === 'missing') {
      throw new HttpError(503, 'Das Lager ist gesperrt, weil kein Passwort gesetzt ist. In Plesk unter Node.js die Umgebungsvariable LAGER_PASSWORT eintragen und die App neu starten.');
    }
    if (state === 'required') return res.status(401).json({ error: 'Bitte anmelden.', login: true });
    next();
  });

  let pendingLogin = null; // { account, region, status: 'code'|'tfa', tfaKey }
  const cloudCfg = () => store.bambu.cloud;
  const cloud = () => cloudFactory({ region: cloudCfg().region, token: cloudCfg().token });

  // Bei abgelaufener Anmeldung den Token verwerfen, damit die Oberfläche
  // wieder das Anmeldeformular zeigt.
  async function withCloud(fn) {
    if (!cloudCfg().token) throw new HttpError(409, 'Nicht mit Bambu verbunden. Bitte zuerst anmelden.');
    try {
      const result = await fn(cloud());
      cloudCfg().lastError = '';
      return result;
    } catch (err) {
      if (err instanceof CloudError) {
        cloudCfg().lastError = err.message;
        if (err.code === 'auth') {
          cloudCfg().token = '';
          syncPrinters();
        }
        await store.save();
        throw new HttpError(err.code === 'auth' ? 401 : 502, err.message);
      }
      throw err;
    }
  }

  function applyAmsChanges() {
    if (!printers || !store.bambu.options.autoAms) return false;
    const changes = reconcileAms(store.spools, printers.liveSlots(), { amsWeights: store.bambu.options.amsWeights });
    applyChanges(changes);
    return changes.length > 0;
  }

  function applyChanges(changes) {
    for (const { id, patch } of changes) {
      const idx = store.spools.findIndex((s) => s.id === id);
      if (idx >= 0) store.spools[idx] = normalizeSpool(patch, { base: store.spools[idx] });
    }
  }

  // Benachrichtigungen: knappe Rollen bei jedem Speichern, Druckstatus bei jeder Meldung.
  const notifier = new Notifier({ store, fetchFn: notifyFetch });
  store.beforeSave = () => notifier.checkStock();
  const tracker = new Tracker({ store, notifier, fetchFn: dhlFetch });

  if (printers) {
    const lastState = new Map(); // Drucker-ID -> gcode_state, für "Druck fertig"
    printers.on('update', (id) => {
      if (id && typeof printers.status === 'function') {
        const cfg = printerConfigs().find((c) => c.id === id);
        const st = printers.status(id) || {};
        notifier.printerUpdate(id, cfg ? cfg.name : '', st);
        const prev = lastState.get(id);
        lastState.set(id, st.gcodeState);
        // Bestellungen, die mit diesem Druck verbunden sind, sind jetzt fertig
        if (st.gcodeState === 'FINISH' && prev && prev !== 'FINISH') {
          let changed = false;
          for (const s of store.data.sales) {
            const pj = s.order && s.order.status === 'druck' ? s.order.printJob : null;
            if (pj && pj.printerId === id && pj.job === st.job) changed = advanceOrder(s.order, 'fertig') || changed;
          }
          if (changed) store.save().catch((err) => console.error('Speichern fehlgeschlagen:', err.message));
        }
        // Druck fertig: Bambu trägt ihn nach kurzer Zeit in den Verlauf ein,
        // dann holen und abbuchen (zweiter Versuch, falls es länger dauert).
        if (st.gcodeState === 'FINISH' && prev && prev !== 'FINISH' && store.bambu.options.autoBook) {
          for (const ms of [90 * 1000, 5 * 60 * 1000]) {
            setTimeout(() => {
              if (cloudCfg().token) refreshTasks().catch((err) => console.error('Druckverlauf nicht abrufbar:', err.message));
            }, ms).unref();
          }
        }
      }
      if (applyAmsChanges()) store.save().catch((err) => console.error('Speichern fehlgeschlagen:', err.message));
    });
  }

  // Drucker aus dem Bambu-Konto werden über die Cloud verbunden, außer es ist
  // derselbe Drucker schon im Heimnetz eingetragen.
  function cloudPrinterConfigs() {
    const c = cloudCfg();
    if (!c.token || !c.mqttUser || !store.bambu.options.cloudAms) return [];
    const lan = new Set(store.bambu.printers.map((p) => p.serial));
    return (c.devices || []).filter((d) => !lan.has(d.serial)).map((d) => ({
      id: 'cloud:' + d.serial,
      name: d.name,
      kind: 'cloud',
      host: mqttHost(c.region),
      serial: d.serial,
      username: c.mqttUser,
      accessCode: c.token,
    }));
  }

  const printerConfigs = () => [...store.bambu.printers, ...cloudPrinterConfigs()];

  function syncPrinters() {
    if (printers) printers.sync(printerConfigs());
  }

  // Holt die Drucker des Bambu-Kontos und die Kennung für die Cloud-Verbindung.
  async function refreshCloudDevices() {
    const { devices, mqttUser } = await withCloud(async (c) => ({ devices: await c.listDevices(), mqttUser: await c.mqttUsername() }));
    cloudCfg().devices = devices.filter((d) => d.dev_id).map((d) => ({
      serial: String(d.dev_id),
      name: String(d.name || d.dev_product_name || d.dev_id),
      model: String(d.dev_product_name || ''),
    }));
    cloudCfg().mqttUser = mqttUser;
    await store.save();
    syncPrinters();
  }

  // Druckverlauf holen und mit dem gespeicherten zusammenführen.
  async function refreshTasks(save = true) {
    const raw = await withCloud((c) => c.listTasks({ limit: 50 }));
    store.data.tasks = mergeTasks(store.data.tasks || [], raw.map(taskSummary));
    cloudCfg().lastTasksAt = new Date().toISOString();
    autoBookDue();
    if (save) await store.save();
  }

  // Fertige Drucke abbuchen (wenn eingeschaltet). Speichern macht der Aufrufer.
  const bookState = () => {
    if (!store.data.autoBook) store.data.autoBook = normalizeAutoBook();
    return store.data.autoBook;
  };
  const bookOptions = () => ({ autoSync: store.bambu.options.autoSync, amsWeights: store.bambu.options.amsWeights });
  function autoBookDue() {
    if (!store.bambu.options.autoBook) return [];
    const state = bookState();
    return dueTasks(state, store.data.tasks || []).map((t) => bookTask(state, t, store.spools, bookOptions())).filter(Boolean);
  }

  // Automatischer Abgleich mit dem Filament Manager: neue Spulen, Zuordnungen
  // und Restgewichte. "Im AMS" kommt dabei vom Drucker, nicht aus der Liste.
  let syncRunning = null;
  function autoSync() {
    if (!store.bambu.options.autoSync || !cloudCfg().token) return Promise.resolve(null);
    if (!syncRunning) {
      syncRunning = (async () => {
        const cloudSpools = await withCloud((c) => c.listSpools());
        const result = applyPull(store, cloudSpools, 'alle', { withAms: false });
        cloudCfg().lastPullAt = new Date().toISOString();
        applyAmsChanges();
        await refreshTasks(false).catch((err) => console.error('Druckverlauf nicht abrufbar:', err.message));
        await store.save();
        return result;
      })().finally(() => {
        syncRunning = null;
      });
    }
    return syncRunning;
  }

  // Auch fehlgeschlagene Versuche zählen, sonst würde jede Abfrage erneut anfragen.
  let lastAttempt = 0;
  function autoSyncInBackground(maxAgeMs = 0) {
    const last = Math.max(Date.parse(cloudCfg().lastPullAt || '') || 0, lastAttempt);
    if (Date.now() - last < maxAgeMs) return;
    lastAttempt = Date.now();
    autoSync().catch((err) => console.error('Automatischer Bambu-Abgleich fehlgeschlagen:', err.message));
  }

  function bambuView() {
    const c = cloudCfg();
    return {
      cloud: {
        connected: Boolean(c.token),
        account: c.account,
        region: c.region,
        connectedAt: c.connectedAt,
        lastPullAt: c.lastPullAt,
        lastPushAt: c.lastPushAt,
        lastError: c.lastError,
        devices: (c.devices || []).length,
        pending: pendingLogin ? { status: pendingLogin.status, account: pendingLogin.account } : null,
      },
      options: store.bambu.options,
      printers: printers ? printers.view(printerConfigs()) : [],
    };
  }

  async function finishLogin(result, account, region) {
    Object.assign(cloudCfg(), {
      token: result.token,
      region,
      account: account || accountFromToken(result.token),
      connectedAt: new Date().toISOString(),
      lastError: '',
    });
    pendingLogin = null;
    await store.save();
    // Drucker suchen und gleich abgleichen, ohne die Antwort aufzuhalten.
    refreshCloudDevices()
      .catch((err) => console.error('Drucker aus dem Bambu-Konto nicht abrufbar:', err.message))
      .then(() => autoSyncInBackground());
  }

  // -- Lager --------------------------------------------------------------

  app.get('/api/state', (req, res) => {
    // Beim Öffnen der Seite auffrischen, wenn der letzte Abgleich etwas her ist.
    autoSyncInBackground(2 * 60 * 1000);
    res.json({ spools: store.spools, settings: store.settings });
  });

  app.post('/api/spools', async (req, res) => {
    const body = req.body || {};
    const list = Array.isArray(body.spools) ? body.spools : [body];
    const created = list.map((s) => normalizeSpool({ ...s, id: newId(), bambu: {} }));
    store.spools.push(...created);
    await store.save();
    res.status(201).json({ spools: created });
  });

  app.put('/api/spools/:id', async (req, res) => {
    const idx = store.spools.findIndex((s) => s.id === req.params.id);
    if (idx < 0) throw new HttpError(404, 'Spule nicht gefunden.');
    const { id, nr, createdAt, ...patch } = req.body || {};
    store.spools[idx] = normalizeSpool(patch, { base: store.spools[idx] });
    await store.save();
    res.json({ spool: store.spools[idx] });
  });

  app.delete('/api/spools/:id', async (req, res) => {
    const idx = store.spools.findIndex((s) => s.id === req.params.id);
    if (idx < 0) throw new HttpError(404, 'Spule nicht gefunden.');
    store.data.spoolArchive = archiveSpool(store.data.spoolArchive || [], store.spools[idx], new Date().toISOString());
    store.spools.splice(idx, 1);
    await store.save();
    res.json({ ok: true });
  });

  // Sicherungen: täglich automatisch (server.js), von Hand, herunterladen, zurückholen
  const backups = new Backups({ store, dir: backupDir });
  const backupsView = async () => ({ backups: await backups.list() });
  const sendBackup = (res, name, data) => {
    res.set('Content-Disposition', `attachment; filename="${name}"`);
    res.type('application/json').send(JSON.stringify(withoutSecrets(data), null, 2));
  };
  app.get('/api/sicherungen', async (req, res) => res.json(await backupsView()));
  app.post('/api/sicherungen', async (req, res) => {
    const name = await backups.create('manuell');
    res.status(201).json({ name, ...(await backupsView()) });
  });
  app.get('/api/sicherungen/aktuell', (req, res) => {
    const d = new Date();
    sendBackup(res, `filament-lager-${d.toISOString().slice(0, 10)}.json`, store.data);
  });
  app.get('/api/sicherungen/:name', async (req, res) => {
    try {
      sendBackup(res, req.params.name, await backups.read(req.params.name));
    } catch (err) {
      throw new HttpError(err.status || 500, err.message);
    }
  });
  app.post(RESTORE, express.json({ limit: '50mb' }), async (req, res) => {
    const body = req.body || {};
    let before;
    try {
      const raw = body.name ? await backups.read(String(body.name)) : body.data;
      before = await backups.restore(raw);
    } catch (err) {
      throw new HttpError(err.status || 400, err.message);
    }
    res.json({ ok: true, before, ...(await backupsView()) });
  });

  // Link zur Strom-Ansicht erstellen, ansehen oder zurückziehen
  const shareView = () => ({ token: (store.data.share && store.data.share.token) || '', createdAt: (store.data.share && store.data.share.createdAt) || '' });
  app.get('/api/teilen', (req, res) => res.json(shareView()));
  app.post('/api/teilen', async (req, res) => {
    store.data.share = { token: crypto.randomBytes(18).toString('base64url'), createdAt: new Date().toISOString() };
    await store.save();
    res.json(shareView());
  });
  app.delete('/api/teilen', async (req, res) => {
    store.data.share = { token: '', createdAt: '' };
    await store.save();
    res.json(shareView());
  });

  // Filament-Lieferungen: bestellte Rollen mit DHL-Sendungsnummer. Beim
  // Ankommen werden daraus Rollen im Lager mit Kaufpreis und Kaufdatum.
  const deliveriesView = () => ({ deliveries: store.data.deliveries });
  const findDelivery = (id) => {
    const d = store.data.deliveries.find((x) => x.id === id);
    if (!d) throw new HttpError(404, 'Lieferung nicht gefunden.');
    return d;
  };
  function deliveryFromBody(body, old = null) {
    const {
      number: raw, tracking, id, createdAt, receivedAt, spoolIds, ...rest
    } = body;
    const number = raw === undefined ? (old && old.tracking ? old.tracking.number : '') : String(raw || '').replace(/\s+/g, '').toUpperCase();
    if (number && !validTrackingNumber(number)) throw new HttpError(400, 'Die Sendungsnummer sieht nicht richtig aus: nur Buchstaben und Ziffern, 8 bis 35 Zeichen.');
    const keep = old && old.tracking && old.tracking.number === number ? old.tracking : number ? { number } : null;
    return normalizeDelivery({ ...(old || {}), ...rest, tracking: keep, id: old ? old.id : undefined, createdAt: old ? old.createdAt : undefined });
  }
  app.get('/api/lieferungen', (req, res) => {
    res.json(deliveriesView());
    tracker.checkDue();
  });
  app.post('/api/lieferungen', async (req, res) => {
    const d = deliveryFromBody(req.body || {});
    store.data.deliveries.unshift(d);
    await store.save();
    const fresh = d.tracking ? await tracker.check(d.id) : d;
    res.status(201).json({ item: fresh, ...deliveriesView() });
  });
  app.put('/api/lieferungen/:id', async (req, res) => {
    const old = findDelivery(req.params.id);
    const d = deliveryFromBody(req.body || {}, old);
    store.data.deliveries = store.data.deliveries.map((x) => (x.id === d.id ? d : x));
    await store.save();
    const changed = d.tracking && (!old.tracking || old.tracking.number !== d.tracking.number);
    const fresh = changed ? await tracker.check(d.id) : d;
    res.json({ item: fresh, ...deliveriesView() });
  });
  app.delete('/api/lieferungen/:id', async (req, res) => {
    store.data.deliveries = store.data.deliveries.filter((x) => x.id !== req.params.id);
    await store.save();
    res.json(deliveriesView());
  });
  app.post('/api/lieferungen/:id/pruefen', async (req, res) => {
    const d = findDelivery(req.params.id);
    if (!d.tracking) throw new HttpError(404, 'Keine Sendungsnummer an dieser Lieferung.');
    if (!tracker.config.apiKey) throw new HttpError(409, 'Für die Abfrage bei DHL fehlt der API-Schlüssel (Einstellungen).');
    res.json({ item: await tracker.check(d.id), ...deliveriesView(), dhl: tracker.view() });
  });
  app.post('/api/lieferungen/:id/angekommen', async (req, res) => {
    const d = findDelivery(req.params.id);
    if (d.receivedAt) throw new HttpError(409, 'Diese Lieferung ist schon im Lager.');
    const b = req.body || {};
    const created = b.createSpools === false ? []
      : spoolsFromDelivery(d, { location: String(b.location || '').trim() }).map((s) => normalizeSpool({ ...s, id: newId(), bambu: {} }));
    store.spools.push(...created);
    d.receivedAt = new Date().toISOString();
    d.spoolIds = created.map((s) => s.id);
    await store.save(); // vergibt die Rollennummern
    res.json({ item: d, created, spools: store.spools, ...deliveriesView() });
  });

  // Entfernung von deiner Adresse zum Kunden (Lieferung ohne Post)
  const router = new Router({ store, fetchFn: mapFetch });
  app.post('/api/entfernung', async (req, res) => {
    const to = String((req.body || {}).to || '').trim();
    const home = store.settings.homeAddress;
    if (!home) throw new HttpError(400, 'Deine Adresse fehlt: Einstellungen → Versandarten → „Deine Adresse“.');
    if (!to) throw new HttpError(400, 'Bitte die Adresse des Kunden eintragen.');
    try {
      res.json(await router.distance(home, to));
    } catch (err) {
      throw new HttpError(502, err.message);
    }
  });

  // Gelöschte Rollen mit Kaufpreis (für die Jahresübersicht)
  app.get('/api/rollen-archiv', (req, res) => res.json({ archive: store.data.spoolArchive || [] }));

  app.put('/api/settings', async (req, res) => {
    store.data.settings = normalizeSettings(req.body);
    await store.save();
    res.json({ settings: store.settings });
  });

  // mode: "replace" ersetzt den Bestand, "append" hängt an, "seed" lädt die Startdaten.
  app.post('/api/import', async (req, res) => {
    const { mode = 'append', spools = [], settings } = req.body || {};
    if (settings) store.data.settings = normalizeSettings(settings);
    else if (mode !== 'append') store.data.settings.places = [];
    if (mode !== 'append') store.data.nextNr = 1; // Nummerierung beginnt neu
    if (mode === 'seed') {
      store.data.spools = seedSpools();
    } else {
      if (!Array.isArray(spools)) throw new HttpError(400, 'Keine Spulen im Import gefunden.');
      const ids = new Set(mode === 'replace' ? [] : store.spools.map((s) => s.id));
      const incoming = spools.map((s) => normalizeSpool(ids.has(s.id) ? { ...s, id: newId() } : s, { keepTimestamps: true }));
      store.data.spools = mode === 'replace' ? incoming : [...store.spools, ...incoming];
    }
    await store.save();
    res.json({ spools: store.spools, settings: store.settings });
  });

  // Legt Spulen in ein Paket, einen AMS-Slot, "AMS ohne Slot" oder "ohne Platz".
  app.post('/api/spools/move', async (req, res) => {
    const { ids = [], target } = req.body || {};
    let changes;
    try {
      changes = planMove(store.spools, Array.isArray(ids) ? ids : [], target);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    applyChanges(changes);
    await store.save();
    res.json({ spools: store.spools, swapped: changes.filter((c) => c.swapped).map((c) => c.id) });
  });

  // Pakete anlegen, umbenennen oder entfernen.
  app.post('/api/places', async (req, res) => {
    let plan;
    try {
      plan = planPlaces(store.settings, store.spools, req.body || {});
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    store.data.settings = normalizeSettings({ ...store.settings, places: plan.places });
    applyChanges(plan.changes);
    await store.save();
    res.json({ spools: store.spools, settings: store.settings });
  });

  // API-Schlüssel anzeigen und neu erzeugen (der alte wird dabei ungültig).
  app.get('/api/schluessel', (req, res) => res.json({ key: store.data.apiKey || '' }));
  app.post('/api/schluessel', async (req, res) => {
    store.data.apiKey = newApiKey();
    await store.save();
    res.json({ key: store.data.apiKey });
  });

  // -- Druckverlauf und Verkäufe ---------------------------------------------

  // bookings: Abbuchungen je Druck; spools nur, wenn sich Gewichte geändert haben können
  const tasksView = () => ({
    connected: Boolean(cloudCfg().token),
    lastSync: cloudCfg().lastTasksAt || '',
    tasks: store.data.tasks || [],
    autoBook: Boolean(store.bambu.options.autoBook),
    bookings: Object.fromEntries(bookState().log.map((e) => [e.taskId, e])),
  });

  app.get('/api/drucke', (req, res) => res.json(tasksView()));

  app.post('/api/drucke/aktualisieren', async (req, res) => {
    await refreshTasks();
    res.json({ ...tasksView(), spools: store.spools });
  });

  // Einen Druck von Hand abbuchen (auch ohne automatisches Abbuchen)
  app.post('/api/drucke/:id/abbuchen', async (req, res) => {
    const task = (store.data.tasks || []).find((t) => t.id === req.params.id);
    if (!task) throw new HttpError(404, 'Druck nicht gefunden.');
    const state = bookState();
    if (!canBookAgain(state, task.id)) throw new HttpError(409, 'Dieser Druck ist schon abgebucht.');
    delete state.booked[task.id];
    const entry = bookTask(state, task, store.spools, bookOptions());
    await store.save();
    res.json({ entry, ...tasksView(), spools: store.spools });
  });

  app.post('/api/drucke/:id/rueckgaengig', async (req, res) => {
    const entry = undoBooking(bookState(), req.params.id, store.spools);
    if (!entry) throw new HttpError(409, 'Für diesen Druck gibt es keine Abbuchung zum Zurücknehmen.');
    await store.save();
    res.json({ entry, ...tasksView(), spools: store.spools });
  });

  const salesView = () => ({ sales: store.data.sales, summary: salesSummary(store.data.sales), stock: store.data.stock });

  app.get('/api/verkaeufe', (req, res) => {
    res.json(salesView());
    tracker.checkDue(); // Plesk hält die App im Leerlauf an, deshalb auch beim Öffnen
  });

  // Teile aus dem Vorrat abbuchen; reicht der Vorrat nicht, wird nichts gespeichert.
  function takeFromStock(sale) {
    try {
      applyStockSale(store.data.stock, sale, -1);
    } catch (err) {
      throw new HttpError(409, err.message);
    }
  }

  function checkTracking(sale) {
    if (sale.tracking && !validTrackingNumber(sale.tracking.number)) {
      throw new HttpError(400, 'Die Sendungsnummer sieht nicht richtig aus: nur Buchstaben und Ziffern, 8 bis 35 Zeichen.');
    }
  }

  app.post('/api/verkaeufe', async (req, res) => {
    const sale = normalizeSale({ ...(req.body || {}), id: undefined, createdAt: undefined });
    checkTracking(sale);
    takeFromStock(sale);
    sale.nr = nextReceiptNr(store.data, sale.date);
    store.data.sales.unshift(sale);
    await store.save();
    res.status(201).json({ sale, ...salesView() });
    if (sale.tracking) tracker.check(sale.id).catch(() => {});
  });

  // DHL-Sendungsnummer eintragen, ändern oder entfernen (leer). Mit
  // API-Schlüssel wird der Stand gleich bei DHL abgefragt.
  app.put('/api/verkaeufe/:id/sendung', async (req, res) => {
    const sale = store.data.sales.find((x) => x.id === req.params.id);
    if (!sale) throw new HttpError(404, 'Beleg nicht gefunden.');
    const number = String((req.body || {}).number || '').replace(/\s+/g, '').toUpperCase();
    if (number && !validTrackingNumber(number)) throw new HttpError(400, 'Die Sendungsnummer sieht nicht richtig aus: nur Buchstaben und Ziffern, 8 bis 35 Zeichen.');
    if (!number) sale.tracking = null;
    else if (!sale.tracking || sale.tracking.number !== number) sale.tracking = normalizeTracking({ number });
    if (number) {
      // Mit Sendungsnummer ist die Bestellung unterwegs
      sale.order.delivery = 'versand';
      advanceOrder(sale.order, 'versendet');
    }
    await store.save();
    const fresh = number ? await tracker.check(sale.id) : sale;
    res.json({ sale: fresh, ...salesView() });
  });

  // Druck, der gerade läuft (für den Fortschritt auf der Kundenseite)
  function runningJob() {
    if (!printers || typeof printers.status !== 'function') return null;
    for (const c of printerConfigs()) {
      const st = printers.status(c.id);
      if (st && st.job && LIVE.includes(st.gcodeState)) return { printerId: c.id, job: st.job };
    }
    return null;
  }

  // Bestellstatus ändern, Lieferart, voraussichtliches Datum, Hinweis für den
  // Kunden, Link erstellen (link: 'neu') oder zurückziehen (link: 'weg').
  app.put('/api/verkaeufe/:id/bestellung', async (req, res) => {
    const sale = store.data.sales.find((x) => x.id === req.params.id);
    if (!sale) throw new HttpError(404, 'Beleg nicht gefunden.');
    const b = req.body || {};
    const o = sale.order;
    if (b.status !== undefined) {
      if (b.status === '') Object.assign(o, { status: '', history: [], token: '', printJob: null });
      else if (!ORDER_STEPS.includes(b.status)) throw new HttpError(400, 'Unbekannter Status.');
      else {
        setOrderStatus(o, b.status);
        if (b.status === 'druck' && !o.printJob) o.printJob = runningJob();
      }
    }
    if (b.delivery !== undefined) o.delivery = b.delivery;
    if (b.expectedAt !== undefined) o.expectedAt = b.expectedAt;
    if (b.note !== undefined) o.note = b.note;
    if (b.link === 'neu') {
      o.token = newToken();
      if (!o.status) setOrderStatus(o, 'bestellt', sale.createdAt);
    }
    if (b.link === 'weg') o.token = '';
    sale.order = normalizeOrder(o);
    await store.save();
    res.json({ sale, ...salesView() });
  });

  app.post('/api/verkaeufe/:id/sendung/pruefen', async (req, res) => {
    const sale = store.data.sales.find((x) => x.id === req.params.id);
    if (!sale || !sale.tracking) throw new HttpError(404, 'Keine Sendungsnummer an diesem Beleg.');
    if (!tracker.config.apiKey) throw new HttpError(409, 'Für die Abfrage bei DHL fehlt der API-Schlüssel (Einstellungen).');
    res.json({ sale: await tracker.check(sale.id), ...salesView(), dhl: tracker.view() });
  });

  app.get('/api/dhl', (req, res) => res.json(tracker.view()));

  app.put('/api/dhl', async (req, res) => {
    const body = req.body || {};
    const key = String(body.apiKey || '').trim();
    if (body.remove) tracker.config.apiKey = '';
    else if (key) {
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new HttpError(400, 'Der API-Schlüssel sieht nicht richtig aus.');
      tracker.config.apiKey = key;
    }
    tracker.config.lastError = '';
    await store.save();
    res.json(tracker.view());
    tracker.checkDue();
  });

  app.put('/api/verkaeufe/:id', async (req, res) => {
    const idx = store.data.sales.findIndex((x) => x.id === req.params.id);
    if (idx < 0) throw new HttpError(404, 'Verkauf nicht gefunden.');
    const old = store.data.sales[idx];
    store.data.sales[idx] = normalizeSale({ ...old, ...(req.body || {}), id: old.id, nr: old.nr, createdAt: old.createdAt });
    await store.save();
    res.json(salesView());
  });

  app.delete('/api/verkaeufe/:id', async (req, res) => {
    const sale = store.data.sales.find((x) => x.id === req.params.id);
    if (sale) applyStockSale(store.data.stock, sale, +1); // Teile zurück in den Vorrat
    store.data.sales = store.data.sales.filter((x) => x.id !== req.params.id);
    await store.save();
    res.json(salesView());
  });

  // Benachrichtigungen über ntfy
  app.get('/api/benachrichtigungen', async (req, res) => {
    if (!notifier.config.topic) {
      notifier.config.topic = newTopic();
      await store.save();
    }
    res.json(notifier.view());
  });

  app.put('/api/benachrichtigungen', async (req, res) => {
    const b = req.body || {};
    const cur = notifier.config;
    const next = normalizeNotify({
      ...cur,
      enabled: b.enabled === true,
      server: b.server ?? cur.server,
      topic: b.topic ?? cur.topic,
      token: b.token === undefined ? cur.token : String(b.token), // leer lassen = Token behalten, "-" = löschen
      appUrl: typeof b.appUrl === 'string' && /^https?:\/\//.test(b.appUrl) ? b.appUrl : cur.appUrl,
      events: { ...cur.events, ...(b.events && typeof b.events === 'object' ? Object.fromEntries(EVENTS.filter((k) => k in b.events).map((k) => [k, b.events[k] === true])) : {}) },
    });
    if (b.token === '') next.token = cur.token;
    if (b.token === '-') next.token = '';
    try {
      validateNotify(next);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    const switchedOn = next.enabled && !cur.enabled;
    store.data.notify = next;
    if (switchedOn) notifier.markCurrentStock();
    await store.save();
    res.json(notifier.view());
  });

  app.post('/api/benachrichtigungen/test', async (req, res) => {
    try {
      await notifier.send({
        title: 'Filament-Lager', message: 'Test: Benachrichtigungen kommen an.', tags: ['tada'], view: 'lager',
      });
    } catch (err) {
      await store.save();
      throw new HttpError(502, err.message);
    }
    await store.save();
    res.json(notifier.view());
  });

  // Angebote: wie ein Beleg, mit eigener Nummer; angenommen wird daraus ein Beleg.
  const offersView = () => ({ offers: store.data.offers });

  app.get('/api/angebote', (req, res) => res.json(offersView()));

  app.post('/api/angebote', async (req, res) => {
    const offer = normalizeOffer({ ...(req.body || {}), id: undefined, createdAt: undefined, saleId: '', saleNr: '', acceptedAt: '' }, { days: store.settings.offerDays });
    offer.nr = nextOfferNr(store.data, offer.date);
    store.data.offers.unshift(offer);
    await store.save();
    res.status(201).json({ offer, ...offersView() });
  });

  app.post('/api/angebote/:id/beleg', async (req, res) => {
    const offer = store.data.offers.find((x) => x.id === req.params.id);
    if (!offer) throw new HttpError(404, 'Angebot nicht gefunden.');
    if (offer.saleNr) throw new HttpError(409, `Aus diesem Angebot wurde schon Beleg ${offer.saleNr}.`);
    const sale = normalizeSale(saleFromOffer(offer, { date: (req.body && req.body.date) || '' }));
    takeFromStock(sale);
    sale.nr = nextReceiptNr(store.data, sale.date);
    store.data.sales.unshift(sale);
    Object.assign(offer, { saleId: sale.id, saleNr: sale.nr, acceptedAt: new Date().toISOString() });
    await store.save();
    res.status(201).json({
      sale, offer, ...offersView(), ...salesView(),
    });
  });

  app.delete('/api/angebote/:id', async (req, res) => {
    store.data.offers = store.data.offers.filter((x) => x.id !== req.params.id);
    await store.save();
    res.json(offersView());
  });

  // Listen mit Anlegen, Ändern und Löschen: Kunden und eigene Ausgaben.
  function collectionRoutes(url, key, normalize, check = () => {}) {
    const view = () => ({ [key]: store.data[key] });
    app.get(`/api/${url}`, (req, res) => res.json(view()));
    app.post(`/api/${url}`, async (req, res) => {
      const item = normalize({ ...(req.body || {}), id: undefined, createdAt: undefined });
      check(item);
      store.data[key].unshift(item);
      await store.save();
      res.status(201).json({ item, ...view() });
    });
    app.put(`/api/${url}/:id`, async (req, res) => {
      const idx = store.data[key].findIndex((x) => x.id === req.params.id);
      if (idx < 0) throw new HttpError(404, 'Eintrag nicht gefunden.');
      const old = store.data[key][idx];
      const item = normalize({ ...old, ...(req.body || {}), id: old.id, createdAt: old.createdAt });
      check(item);
      store.data[key][idx] = item;
      await store.save();
      res.json({ item, ...view() });
    });
    app.delete(`/api/${url}/:id`, async (req, res) => {
      store.data[key] = store.data[key].filter((x) => x.id !== req.params.id);
      await store.save();
      res.json(view());
    });
  }
  collectionRoutes('kunden', 'customers', normalizeCustomer, (c) => {
    if (!c.name) throw new HttpError(400, 'Bitte einen Namen eingeben.');
  });
  collectionRoutes('ausgaben', 'expenses', normalizeExpense, (x) => {
    if (!x.amount) throw new HttpError(400, 'Bitte einen Betrag eingeben.');
  });

  // Preis aus der Preisliste bei den Rollen einer Filamentart eintragen.
  app.post('/api/preisliste/uebernehmen', async (req, res) => {
    const { material, overwrite } = req.body || {};
    if (!material) throw new HttpError(400, 'Bitte eine Filamentart angeben.');
    const changed = applyPriceChanges(store.spools, priceListChanges(store.spools, store.settings, { material, overwrite: overwrite === true }));
    await store.save();
    res.json({ changed, spools: store.spools });
  });

  // Vorrat: auf Vorrat gedruckte Teile, die einzeln verkauft werden.
  const stockView = () => ({ stock: store.data.stock });

  app.get('/api/vorrat', (req, res) => res.json(stockView()));

  // Gleicher Name wie ein vorhandenes Teil: Stückzahl dazu (merge: false legt neu an).
  app.post('/api/vorrat', async (req, res) => {
    const b = req.body || {};
    const batch = normalizeStockItem({ ...b, id: undefined, sold: 0 });
    if (!batch.made) throw new HttpError(400, 'Bitte angeben, wie viele Teile gedruckt wurden.');
    const idx = b.merge === false ? -1 : store.data.stock.findIndex((x) => x.title.toLowerCase() === batch.title.toLowerCase());
    let item;
    if (idx >= 0) {
      item = mergeStock(store.data.stock[idx], batch);
      store.data.stock[idx] = item;
    } else {
      item = batch;
      store.data.stock.unshift(item);
    }
    await store.save();
    res.status(201).json({ item, merged: idx >= 0, ...stockView() });
  });

  // Ändern: Name, Preis, Bestand (z. B. eins kaputt), nicht die Kosten.
  app.put('/api/vorrat/:id', async (req, res) => {
    const idx = store.data.stock.findIndex((x) => x.id === req.params.id);
    if (idx < 0) throw new HttpError(404, 'Teil nicht im Vorrat.');
    const b = req.body || {};
    const cur = store.data.stock[idx];
    store.data.stock[idx] = normalizeStockItem({
      ...cur, title: b.title ?? cur.title, price: b.price ?? cur.price, onHand: b.onHand ?? cur.onHand,
    });
    await store.save();
    res.json({ item: store.data.stock[idx], ...stockView() });
  });

  app.delete('/api/vorrat/:id', async (req, res) => {
    store.data.stock = store.data.stock.filter((x) => x.id !== req.params.id);
    await store.save();
    res.json(stockView());
  });

  // Stromabrechnungen (wer den Strom bezahlt, bekommt den Betrag).
  app.get('/api/strom', (req, res) => res.json({ payments: store.data.powerPayments }));

  app.post('/api/strom', async (req, res) => {
    const payment = normalizePowerPayment({ ...(req.body || {}), id: undefined });
    store.data.powerPayments.unshift(payment);
    await store.save();
    res.status(201).json({ payment, payments: store.data.powerPayments });
  });

  app.delete('/api/strom/:id', async (req, res) => {
    store.data.powerPayments = store.data.powerPayments.filter((x) => x.id !== req.params.id);
    await store.save();
    res.json({ payments: store.data.powerPayments });
  });

  // -- Bambu Cloud ----------------------------------------------------------

  app.get('/api/bambu', (req, res) => res.json(bambuView()));

  app.post('/api/bambu/cloud/login', async (req, res) => {
    const { account = '', password: pw = '', region = 'global' } = req.body || {};
    if (!String(account).trim()) throw new HttpError(400, 'Bitte die E-Mail-Adresse des Bambu-Kontos eingeben.');
    const client = cloudFactory({ region, token: '' });
    try {
      let result;
      if (pw) {
        result = await client.login(account.trim(), pw);
      } else {
        // Ohne Passwort (z. B. Konto über Google oder Apple) per E-Mail-Code anmelden.
        await client.sendCode(account.trim());
        result = { status: 'code' };
      }
      if (result.status === 'ok') {
        await finishLogin(result, account.trim(), region);
      } else {
        pendingLogin = { account: account.trim(), region, status: result.status, tfaKey: result.tfaKey || '' };
      }
      res.json(bambuView());
    } catch (err) {
      if (err instanceof CloudError) throw new HttpError(err.status === 400 ? 400 : 502, err.message);
      throw err;
    }
  });

  app.post('/api/bambu/cloud/code', async (req, res) => {
    const code = String((req.body || {}).code || '').trim();
    if (!pendingLogin) throw new HttpError(409, 'Keine Anmeldung offen. Bitte zuerst die E-Mail-Adresse eingeben.');
    if (!code) throw new HttpError(400, 'Bitte den Code eingeben.');
    const client = cloudFactory({ region: pendingLogin.region, token: '' });
    try {
      const result = pendingLogin.status === 'tfa'
        ? await client.loginWithTfa(pendingLogin.tfaKey, code)
        : await client.loginWithCode(pendingLogin.account, code);
      await finishLogin(result, pendingLogin.account, pendingLogin.region);
      res.json(bambuView());
    } catch (err) {
      if (err instanceof CloudError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  app.post('/api/bambu/cloud/token', async (req, res) => {
    const { token = '', region = 'global' } = req.body || {};
    if (!String(token).trim()) throw new HttpError(400, 'Bitte einen Token eingeben.');
    const t = String(token).trim().replace(/^Bearer\s+/i, '');
    const client = cloudFactory({ region, token: t });
    try {
      await client.listSpools();
    } catch (err) {
      if (err instanceof CloudError) throw new HttpError(400, 'Token wird nicht akzeptiert: ' + err.message);
      throw err;
    }
    await finishLogin({ token: t }, '', region);
    res.json(bambuView());
  });

  app.post('/api/bambu/cloud/logout', async (req, res) => {
    Object.assign(cloudCfg(), { token: '', account: '', connectedAt: '', lastError: '', devices: [], mqttUser: '' });
    pendingLogin = null;
    syncPrinters();
    await store.save();
    res.json(bambuView());
  });

  app.get('/api/bambu/cloud/pull', async (req, res) => {
    const cloudSpools = await withCloud((c) => c.listSpools());
    res.json({ cloudCount: cloudSpools.length, items: pullPreview(store.spools, cloudSpools) });
  });

  app.post('/api/bambu/cloud/pull', async (req, res) => {
    const keys = Array.isArray((req.body || {}).keys) ? req.body.keys : [];
    const cloudSpools = await withCloud((c) => c.listSpools());
    const result = applyPull(store, cloudSpools, keys);
    cloudCfg().lastPullAt = new Date().toISOString();
    await store.save();
    res.json({ result, spools: store.spools });
  });

  app.get('/api/bambu/cloud/push', async (req, res) => {
    const cloudSpools = await withCloud((c) => c.listSpools());
    res.json({ cloudCount: cloudSpools.length, items: pushPreview(store.spools, cloudSpools) });
  });

  app.post('/api/bambu/cloud/push', async (req, res) => {
    const keys = Array.isArray((req.body || {}).keys) ? req.body.keys : [];
    const result = await withCloud(async (c) => applyPush(store, c, await c.listSpools(), keys));
    cloudCfg().lastPushAt = new Date().toISOString();
    await store.save();
    res.json({ result, spools: store.spools });
  });

  // -- Drucker / AMS ----------------------------------------------------------

  app.put('/api/bambu/options', async (req, res) => {
    const o = req.body || {};
    // Abbuchen gilt ab dem Einschalten, ältere Drucke bleiben unberührt
    if (o.autoBook === true && !store.bambu.options.autoBook) bookState().since = new Date().toISOString();
    for (const k of ['autoAms', 'amsWeights', 'autoSync', 'cloudAms', 'autoBook']) if (typeof o[k] === 'boolean') store.bambu.options[k] = o[k];
    syncPrinters();
    applyAmsChanges();
    await store.save();
    if (o.autoSync === true) autoSyncInBackground();
    res.json(bambuView());
  });

  function printerFromBody(body, base = {}) {
    const p = {
      id: base.id || newId(),
      name: String(body.name ?? base.name ?? '').trim() || 'Drucker',
      host: String(body.host ?? base.host ?? '').trim(),
      serial: String(body.serial ?? base.serial ?? '').trim().toUpperCase(),
      accessCode: String(body.accessCode || base.accessCode || '').trim(),
      enabled: body.enabled ?? base.enabled ?? true,
    };
    if (!p.host || !p.serial || !p.accessCode) throw new HttpError(400, 'Bitte IP-Adresse, Seriennummer und Zugangscode eingeben.');
    return p;
  }

  app.post('/api/bambu/printers', async (req, res) => {
    store.bambu.printers.push(printerFromBody(req.body || {}));
    await store.save();
    syncPrinters();
    res.status(201).json(bambuView());
  });

  app.put('/api/bambu/printers/:id', async (req, res) => {
    const idx = store.bambu.printers.findIndex((p) => p.id === req.params.id);
    if (idx < 0) throw new HttpError(404, 'Drucker nicht gefunden.');
    store.bambu.printers[idx] = printerFromBody(req.body || {}, store.bambu.printers[idx]);
    await store.save();
    syncPrinters();
    res.json(bambuView());
  });

  app.delete('/api/bambu/printers/:id', async (req, res) => {
    store.bambu.printers = store.bambu.printers.filter((p) => p.id !== req.params.id);
    await store.save();
    syncPrinters();
    res.json(bambuView());
  });

  function liveSlot(printerId, slot) {
    const tray = printers && printers.findSlot(printerId, slot);
    if (!tray || tray.empty) throw new HttpError(404, `Slot ${slot} ist leer oder der Drucker ist nicht verbunden.`);
    return tray;
  }

  // Verknüpft einen AMS-Slot mit einer Lagerspule (spoolId leer = lösen).
  app.post('/api/bambu/ams/link', async (req, res) => {
    const { printerId, slot, spoolId } = req.body || {};
    const tray = liveSlot(printerId, slot);
    if (spoolId && !store.findSpool(spoolId)) throw new HttpError(404, 'Spule nicht gefunden.');
    store.data.spools = store.spools.map((s) => {
      const here = s.bambu.printerId === printerId && s.bambu.slot === slot;
      if (s.id === spoolId) {
        return normalizeSpool({
          inAms: true,
          opened: true,
          bambu: { printerId, slot, slotColor: tray.colorHex, rfid: tray.rfid || s.bambu.rfid },
        }, { base: s });
      }
      if (here || (tray.rfid && s.bambu.rfid === tray.rfid)) {
        return normalizeSpool({ inAms: false, bambu: { printerId: '', slot: '', slotColor: '', rfid: tray.rfid && s.bambu.rfid === tray.rfid ? '' : s.bambu.rfid } }, { base: s });
      }
      return s;
    });
    await store.save();
    res.json({ spools: store.spools });
  });

  // Legt aus einem AMS-Slot eine neue Lagerspule an.
  app.post('/api/bambu/ams/create', async (req, res) => {
    const { printerId, slot } = req.body || {};
    const tray = liveSlot(printerId, slot);
    const purchaseWeight = tray.totalWeight || 1000;
    const spool = normalizeSpool({
      material: tray.name || tray.type,
      brand: tray.rfid ? 'Bambu Lab' : '',
      colorHex: tray.colorHex,
      colorName: tray.colorName || colorNameFor(tray.colorHex) || tray.colorHex,
      purchaseWeight,
      netWeight: tray.estimatedNet ?? purchaseWeight,
      spoolTypeId: store.settings.spoolTypes[0].id,
      opened: true,
      inAms: true,
      bambu: { rfid: tray.rfid, printerId, slot, slotColor: tray.colorHex },
    });
    store.spools.push(spool);
    await store.save();
    res.status(201).json({ spool, spools: store.spools });
  });

  // Übernimmt den Füllstand, den das AMS für eine RFID-Spule meldet.
  app.post('/api/bambu/ams/weight', async (req, res) => {
    const { printerId, slot, spoolId } = req.body || {};
    const tray = liveSlot(printerId, slot);
    if (tray.remainPct === null) throw new HttpError(400, 'Das AMS meldet für diese Spule keinen Füllstand (nur bei Bambu-Spulen mit RFID).');
    const idx = store.spools.findIndex((s) => s.id === spoolId);
    if (idx < 0) throw new HttpError(404, 'Spule nicht gefunden.');
    const base = store.spools[idx];
    store.spools[idx] = normalizeSpool({ netWeight: Math.round((base.purchaseWeight * tray.remainPct) / 100), opened: true }, { base });
    await store.save();
    res.json({ spool: store.spools[idx] });
  });

  // Für den Start und den Zeitgeber in server.js.
  app.locals.autoSync = autoSync;
  app.locals.tracker = tracker;
  app.locals.backups = backups;
  app.locals.startBambu = async () => {
    syncPrinters();
    if (!cloudCfg().token) return;
    try {
      await refreshCloudDevices();
    } catch (err) {
      console.error('Drucker aus dem Bambu-Konto nicht abrufbar:', err.message);
    }
    autoSyncInBackground();
  };

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannte Adresse.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500 && !(err instanceof HttpError)) console.error(err);
    res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Interner Fehler: ' + err.message : err.message });
  });

  return app;
}
