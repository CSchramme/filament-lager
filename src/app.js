// HTTP-Schnittstelle des Filament-Lagers und Auslieferung der Weboberfläche.
import express from 'express';
import {
  colorNameFor, newId, nextReceiptNr, normalizePowerPayment, normalizeSale, normalizeSettings, normalizeSpool, planMove,
  planPlaces, salesSummary,
} from '../public/js/domain.js';
import { seedSpools } from '../public/js/seed.js';
import {
  accountFromToken, BambuCloud, CloudError, mqttHost,
} from './bambu/cloud.js';
import { reconcileAms } from './bambu/ams.js';
import { applyPull, applyPush, pullPreview, pushPreview } from './bambu/sync.js';
import { mergeTasks, taskSummary } from './bambu/tasks.js';
import { createAuth } from './auth.js';
import { createPublicApi, newApiKey } from './api-v1.js';

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
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '5mb' }));
  // Die Oberfläche selbst enthält keine Lagerdaten und ist ohne Anmeldung abrufbar.
  app.use(express.static(publicDir));

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

  if (printers) {
    printers.on('update', () => {
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
    if (save) await store.save();
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
    store.spools.splice(idx, 1);
    await store.save();
    res.json({ ok: true });
  });

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

  const tasksView = () => ({ connected: Boolean(cloudCfg().token), lastSync: cloudCfg().lastTasksAt || '', tasks: store.data.tasks || [] });

  app.get('/api/drucke', (req, res) => res.json(tasksView()));

  app.post('/api/drucke/aktualisieren', async (req, res) => {
    await refreshTasks();
    res.json(tasksView());
  });

  const salesView = () => ({ sales: store.data.sales, summary: salesSummary(store.data.sales) });

  app.get('/api/verkaeufe', (req, res) => res.json(salesView()));

  app.post('/api/verkaeufe', async (req, res) => {
    const sale = normalizeSale({ ...(req.body || {}), id: undefined, createdAt: undefined });
    sale.nr = nextReceiptNr(store.data, sale.date);
    store.data.sales.unshift(sale);
    await store.save();
    res.status(201).json({ sale, ...salesView() });
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
    store.data.sales = store.data.sales.filter((x) => x.id !== req.params.id);
    await store.save();
    res.json(salesView());
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
    for (const k of ['autoAms', 'amsWeights', 'autoSync', 'cloudAms']) if (typeof o[k] === 'boolean') store.bambu.options[k] = o[k];
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
