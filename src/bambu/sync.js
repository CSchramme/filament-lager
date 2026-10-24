// Abgleich zwischen dem Lager und dem Bambu Filament Manager (Cloud).
//
// Zuordnung einer Lagerspule zu einer Cloud-Spule, in dieser Reihenfolge:
//   1. gespeicherte Cloud-ID
//   2. RFID-Kennung (tray_uuid der Bambu-Spule)
//   3. gleicher Hersteller, Material und Kaufgewicht und ähnliche Farbe (für
//      Spulen aus der Excel-Liste, die schon im Filament Manager stehen)
//
// Restgewicht beim Holen: Hat sich seit dem letzten Abgleich nur Bambu
// geändert, gilt Bambus Wert; hat sich nur das Lager geändert (gewogen),
// bleibt der Lagerwert. Haben sich beide geändert, gilt der kleinere Wert,
// denn Filament wird nur weniger.
import {
  bambuFilamentId, colorDistance, colorNameFor, filamentTypeOf, normHex, normalizeSpool,
} from '../../public/js/domain.js';

const MAX_COLOR_DISTANCE = 40;

const FIELD_LABELS = {
  netWeight: 'Restgewicht',
  purchaseWeight: 'Kaufgewicht',
  inAms: 'im AMS',
  material: 'Material',
  brand: 'Hersteller',
  colorHex: 'Farbe',
  note: 'Notiz',
};

function str(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function int(v, fallback = null) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

export function validRfid(v) {
  const s = str(v);
  return s !== '' && !/^0+$/.test(s);
}

export function cloudColor(c) {
  return normHex(c.color) || normHex((c.colors || [])[0]) || '';
}

function cloudInPrinter(c) {
  if (typeof c.inPrinter === 'boolean') return c.inPrinter;
  if (c.ams && typeof c.ams.inPrinter === 'boolean') return c.ams.inPrinter;
  return null;
}

// Felder einer Lagerspule, wie sie sich aus einem Cloud-Datensatz ergeben.
export function fieldsFromCloud(c) {
  const hex = cloudColor(c);
  const purchaseWeight = int(c.totalNetWeight, 0) || 1000;
  return {
    material: str(c.filamentName) || str(c.filamentType) || 'PLA',
    brand: str(c.filamentVendor),
    colorHex: hex,
    colorName: colorNameFor(hex) || hex,
    purchaseWeight,
    netWeight: Math.max(0, int(c.netWeight, purchaseWeight)),
    note: str(c.note),
    inAms: cloudInPrinter(c),
    rfid: validRfid(c.RFID) ? str(c.RFID).toUpperCase() : '',
  };
}

// Neuer Datensatz für POST .../my/filament/v2
export function cloudBodyFromLocal(s) {
  return {
    createType: 'manual',
    filamentVendor: s.brand || 'Generic',
    filamentType: filamentTypeOf(s.material),
    filamentName: s.material,
    filamentId: bambuFilamentId(s.material, s.brand),
    isSupport: /support|pva|bvoh/i.test(s.material),
    color: s.colorHex,
    colorType: 0,
    totalNetWeight: s.purchaseWeight,
    netWeight: s.netWeight,
    rolls: 1,
    note: s.note,
  };
}

function softKey(brand, material, weight) {
  return [str(brand).toLowerCase(), str(material).toLowerCase(), int(weight, 0)].join('|');
}

export function pairSpools(localSpools, cloudSpools) {
  const cloudById = new Map(cloudSpools.map((c) => [String(c.id), c]));
  const cloudByRfid = new Map(cloudSpools.filter((c) => validRfid(c.RFID)).map((c) => [str(c.RFID).toUpperCase(), c]));
  const usedCloud = new Set();
  const pairs = [];
  const unpaired = [];

  for (const s of localSpools) {
    let c = s.bambu.cloudId ? cloudById.get(String(s.bambu.cloudId)) : null;
    let how = 'id';
    if (!c && s.bambu.rfid) {
      c = cloudByRfid.get(s.bambu.rfid);
      how = 'rfid';
    }
    if (c && !usedCloud.has(String(c.id))) {
      usedCloud.add(String(c.id));
      pairs.push({ local: s, cloud: c, how });
    } else {
      unpaired.push(s);
    }
  }

  const localOnly = [];
  for (const s of unpaired) {
    const key = softKey(s.brand, s.material, s.purchaseWeight);
    // Ähnlichste Farbe zuerst, bei gleicher Farbe das nächstliegende Restgewicht.
    const score = (c) => colorDistance(cloudColor(c), s.colorHex) * 10000 + Math.abs(int(c.netWeight, 0) - s.netWeight);
    let best = null;
    for (const c of cloudSpools) {
      if (usedCloud.has(String(c.id))) continue;
      if (softKey(c.filamentVendor, c.filamentName || c.filamentType, c.totalNetWeight) !== key) continue;
      if (colorDistance(cloudColor(c), s.colorHex) > MAX_COLOR_DISTANCE) continue;
      if (!best || score(c) < score(best)) best = c;
    }
    if (best) {
      usedCloud.add(String(best.id));
      pairs.push({ local: s, cloud: best, how: 'soft' });
    } else {
      localOnly.push(s);
    }
  }
  const cloudOnly = cloudSpools.filter((c) => !usedCloud.has(String(c.id)));
  return { pairs, localOnly, cloudOnly };
}

function change(field, from, to) {
  return { field, label: FIELD_LABELS[field] || field, from, to };
}

function describeLocal(s) {
  return { id: s.id, material: s.material, colorName: s.colorName, colorHex: s.colorHex, netWeight: s.netWeight, location: s.location };
}

function describeCloud(c) {
  const f = fieldsFromCloud(c);
  return { id: c.id, material: f.material, brand: f.brand, colorName: f.colorName, colorHex: f.colorHex, netWeight: f.netWeight };
}

export function mergedNet(local, cloudNet, linked) {
  const synced = linked ? local.bambu.syncedNet : null;
  if (synced === null || synced === undefined) return Math.min(local.netWeight, cloudNet);
  if (local.netWeight === synced) return cloudNet;
  if (cloudNet === synced) return local.netWeight;
  return Math.min(local.netWeight, cloudNet);
}

// Vorschau "Von Bambu übernehmen". withAms: auch "im AMS" aus dem Filament
// Manager übernehmen (beim automatischen Abgleich nicht, dort gilt das AMS selbst).
export function pullPreview(localSpools, cloudSpools, { withAms = true } = {}) {
  const { pairs, cloudOnly } = pairSpools(localSpools, cloudSpools);
  const items = [];
  for (const { local, cloud, how } of pairs) {
    const f = fieldsFromCloud(cloud);
    const linked = local.bambu.cloudId === cloud.id;
    const changes = [];
    const net = mergedNet(local, f.netWeight, linked);
    if (net !== local.netWeight) changes.push(change('netWeight', local.netWeight, net));
    if (f.purchaseWeight !== local.purchaseWeight) changes.push(change('purchaseWeight', local.purchaseWeight, f.purchaseWeight));
    if (withAms && f.inAms !== null && f.inAms !== local.inAms) changes.push(change('inAms', local.inAms, f.inAms));
    if (!changes.length && linked) continue;
    items.push({
      key: 'cloud:' + cloud.id,
      kind: linked ? 'update' : 'link',
      how,
      local: describeLocal(local),
      cloud: describeCloud(cloud),
      changes,
    });
  }
  for (const cloud of cloudOnly) {
    items.push({ key: 'cloud:' + cloud.id, kind: 'new', how: '', local: null, cloud: describeCloud(cloud), changes: [] });
  }
  return items;
}

// Vorschau "Nach Bambu senden"
export function pushPreview(localSpools, cloudSpools) {
  const { pairs, localOnly } = pairSpools(localSpools, cloudSpools);
  const items = [];
  for (const { local, cloud, how } of pairs) {
    const f = fieldsFromCloud(cloud);
    const body = {};
    const changes = [];
    if (local.netWeight !== f.netWeight) {
      body.netWeight = local.netWeight;
      changes.push(change('netWeight', f.netWeight, local.netWeight));
    }
    if (local.purchaseWeight !== f.purchaseWeight) {
      body.totalNetWeight = local.purchaseWeight;
      changes.push(change('purchaseWeight', f.purchaseWeight, local.purchaseWeight));
    }
    if (local.material !== f.material) {
      body.filamentType = filamentTypeOf(local.material);
      changes.push(change('material', f.material, local.material));
    }
    if (local.brand && local.brand !== f.brand) {
      body.filamentVendor = local.brand;
      changes.push(change('brand', f.brand, local.brand));
    }
    if (local.colorHex !== f.colorHex) {
      body.color = local.colorHex;
      changes.push(change('colorHex', f.colorHex, local.colorHex));
    }
    if (local.note !== f.note) {
      body.note = local.note;
      changes.push(change('note', f.note, local.note));
    }
    const linked = local.bambu.cloudId === cloud.id;
    if (!changes.length && linked) continue;
    items.push({
      key: 'local:' + local.id,
      kind: linked ? 'update' : 'link',
      how,
      local: describeLocal(local),
      cloud: describeCloud(cloud),
      changes,
      body: changes.length ? { id: cloud.id, filamentName: local.material, ...body } : null,
    });
  }
  for (const local of localOnly) {
    items.push({
      key: 'local:' + local.id, kind: 'create', how: '', local: describeLocal(local), cloud: null, changes: [],
      body: cloudBodyFromLocal(local),
    });
  }
  return items;
}

function guessSpoolType(purchaseWeight, settings) {
  const pappe = settings.spoolTypes.find((t) => t.id === 'pappe');
  return purchaseWeight <= 250 && pappe ? pappe.id : settings.spoolTypes[0].id;
}

// Wendet die ausgewählten Punkte der Pull-Vorschau auf den Store an.
export function applyPull(store, cloudSpools, keys, { now = new Date().toISOString(), kinds = null, withAms = true } = {}) {
  const wanted = keys === 'alle' ? null : new Set(keys);
  const byKey = new Map(cloudSpools.map((c) => ['cloud:' + c.id, c]));
  const result = { created: 0, updated: 0 };
  for (const item of pullPreview(store.spools, cloudSpools, { withAms })) {
    if ((wanted && !wanted.has(item.key)) || (kinds && !kinds.includes(item.kind))) continue;
    const cloud = byKey.get(item.key);
    const f = fieldsFromCloud(cloud);
    const link = { cloudId: cloud.id, rfid: f.rfid, syncedNet: f.netWeight, syncedAt: now };
    if (item.kind === 'new') {
      store.spools.push(normalizeSpool({
        material: f.material,
        brand: f.brand,
        colorName: f.colorName,
        colorHex: f.colorHex,
        purchaseWeight: f.purchaseWeight,
        netWeight: f.netWeight,
        spoolTypeId: guessSpoolType(f.purchaseWeight, store.settings),
        opened: f.netWeight < f.purchaseWeight,
        inAms: f.inAms === true,
        note: f.note,
        bambu: link,
      }, { now }));
      result.created += 1;
      continue;
    }
    const idx = store.spools.findIndex((s) => s.id === item.local.id);
    const base = store.spools[idx];
    const patch = { bambu: { ...link, rfid: f.rfid || base.bambu.rfid } };
    for (const ch of item.changes) patch[ch.field] = ch.to;
    if ((patch.netWeight ?? base.netWeight) < (patch.purchaseWeight ?? base.purchaseWeight)) patch.opened = true;
    store.spools[idx] = normalizeSpool(patch, { base, now });
    result.updated += 1;
  }
  return result;
}

function createdId(resp) {
  const r = resp || {};
  const cand = [r.filamentV2 && r.filamentV2.id, r.data && r.data.id, r.id, r.hit && r.hit.id, Array.isArray(r.ids) && r.ids[0]];
  const id = cand.map((v) => int(v, 0)).find((v) => v > 0);
  return id || null;
}

// Sendet die ausgewählten Punkte der Push-Vorschau an die Cloud.
export async function applyPush(store, cloud, cloudSpools, keys, { now = new Date().toISOString() } = {}) {
  const wanted = new Set(keys);
  const result = { created: 0, updated: 0, errors: [] };
  const missingIds = [];
  for (const item of pushPreview(store.spools, cloudSpools)) {
    if (!wanted.has(item.key)) continue;
    const idx = store.spools.findIndex((s) => s.id === item.local.id);
    const base = store.spools[idx];
    try {
      if (item.kind === 'create') {
        const resp = await cloud.createSpool(item.body);
        const id = createdId(resp);
        if (id) {
          store.spools[idx] = normalizeSpool({ bambu: { cloudId: id, syncedNet: base.netWeight, syncedAt: now } }, { base, now });
        } else {
          missingIds.push(base.id);
        }
        result.created += 1;
      } else {
        if (item.body) await cloud.updateSpool(item.body);
        store.spools[idx] = normalizeSpool({ bambu: { cloudId: item.cloud.id, syncedNet: base.netWeight, syncedAt: now } }, { base, now });
        result.updated += 1;
      }
    } catch (err) {
      result.errors.push(`${item.local.material} ${item.local.colorName}: ${err.message}`);
    }
  }
  // Manche Antworten enthalten die neue ID nicht. Dann über die Liste zuordnen.
  if (missingIds.length) {
    const fresh = await cloud.listSpools();
    const { pairs } = pairSpools(store.spools.filter((s) => missingIds.includes(s.id)),
      fresh.filter((c) => !store.spools.some((s) => s.bambu.cloudId === c.id)));
    for (const { local, cloud: c } of pairs) {
      const idx = store.spools.findIndex((s) => s.id === local.id);
      store.spools[idx] = normalizeSpool({ bambu: { cloudId: c.id, syncedNet: local.netWeight, syncedAt: now } }, { base: local, now });
    }
  }
  return result;
}
