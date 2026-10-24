// HTTP-Schnittstelle des Filament-Lagers und Auslieferung der Weboberfläche.
import crypto from 'node:crypto';
import express from 'express';
import {
  colorNameFor, newId, normalizeSettings, normalizeSpool, planMove, planPlaces,
} from '../public/js/domain.js';
import { seedSpools } from '../public/js/seed.js';
import { accountFromToken, BambuCloud, CloudError } from './bambu/cloud.js';
import { reconcileAms } from './bambu/ams.js';
import { applyPull, applyPush, pullPreview, pushPreview } from './bambu/sync.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function basicAuth(password) {
  const expected = Buffer.from(password);
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const given = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString().split(':').slice(1).join(':') : '';
    const buf = Buffer.from(given);
    if (buf.length === expected.length && crypto.timingSafeEqual(buf, expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Filament-Lager", charset="UTF-8"').status(401).send('Passwort erforderlich');
  };
}

export function createApp({ store, printers, publicDir, password = '', cloudFactory = (opts) => new BambuCloud(opts) }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));
  if (password) app.use(basicAuth(password));
  app.use(express.static(publicDir));

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
        if (err.code === 'auth') cloudCfg().token = '';
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
        pending: pendingLogin ? { status: pendingLogin.status, account: pendingLogin.account } : null,
      },
      options: store.bambu.options,
      printers: printers ? printers.view(store.bambu.printers) : [],
    };
  }

  async function finishLogin(result, account, region) {
    Object.assign(cloudCfg(), {
      token: result.token,
      region,
      account: accountFromToken(result.token) || account,
      connectedAt: new Date().toISOString(),
      lastError: '',
    });
    pendingLogin = null;
    await store.save();
  }

  // -- Lager --------------------------------------------------------------

  app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'server' }));

  app.get('/api/state', (req, res) => res.json({ spools: store.spools, settings: store.settings }));

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
    const { id, createdAt, ...patch } = req.body || {};
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
    Object.assign(cloudCfg(), { token: '', account: '', connectedAt: '', lastError: '' });
    pendingLogin = null;
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
    for (const k of ['autoAms', 'amsWeights', 'autoPull']) if (typeof o[k] === 'boolean') store.bambu.options[k] = o[k];
    applyAmsChanges();
    await store.save();
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
    printers?.sync(store.bambu.printers);
    res.status(201).json(bambuView());
  });

  app.put('/api/bambu/printers/:id', async (req, res) => {
    const idx = store.bambu.printers.findIndex((p) => p.id === req.params.id);
    if (idx < 0) throw new HttpError(404, 'Drucker nicht gefunden.');
    store.bambu.printers[idx] = printerFromBody(req.body || {}, store.bambu.printers[idx]);
    await store.save();
    printers?.sync(store.bambu.printers);
    res.json(bambuView());
  });

  app.delete('/api/bambu/printers/:id', async (req, res) => {
    store.bambu.printers = store.bambu.printers.filter((p) => p.id !== req.params.id);
    await store.save();
    printers?.sync(store.bambu.printers);
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

  // Regelmäßiger Abgleich der Restgewichte bereits verknüpfter Spulen.
  app.locals.autoPull = async () => {
    if (!store.bambu.options.autoPull || !cloudCfg().token) return null;
    const cloudSpools = await withCloud((c) => c.listSpools());
    const keys = pullPreview(store.spools, cloudSpools).filter((i) => i.kind === 'update').map((i) => i.key);
    const result = applyPull(store, cloudSpools, keys, { kinds: ['update'] });
    cloudCfg().lastPullAt = new Date().toISOString();
    await store.save();
    return result;
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
