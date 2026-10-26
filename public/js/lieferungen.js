// Filament unterwegs: bestellte Rollen mit DHL-Sendungsnummer im Reiter
// "Lager". Den Stand fragt der Server bei DHL ab (mit API-Schlüssel); beim
// Ankommen werden aus der Lieferung Rollen mit Kaufpreis und Kaufdatum.
import {
  COLOR_PRESETS, PURCHASE_WEIGHTS, deliveryItemsFromShopping, filamentTypes, listPrice, listPriceForWeight, normHex, shoppingList,
  trackingUrl, validTrackingNumber,
} from './domain.js';
import { openLabels } from './labels.js';
import { trackingHtml, trackShort } from './track.js';
import {
  dateDe, esc, fmt, fmtEur, icons, localDay, openDialog, parseNum, plural, toast,
} from './ui.js';

const SHOPS = ['Bambu Lab Store', 'Amazon', '3DJake', 'Prusa', 'Elegoo'];
const kg = (g) => (g >= 1000 ? `${String(g / 1000).replace('.', ',')} kg` : `${fmt(g)} g`);
const itemName = (i) => [i.material, i.colorName].filter(Boolean).join(' ');

export function itemsText(items) {
  if (!items.length) return 'Inhalt nicht eingetragen';
  const n = items.reduce((a, i) => a + i.qty, 0);
  return `${plural(n, 'Rolle', 'Rollen')}: ${items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ''}${itemName(i)}`).join(', ')}`;
}

// Panel "Filament unterwegs" (nur offene Lieferungen)
export function deliveriesHtml(list) {
  const open = list.filter((d) => !d.receivedAt);
  if (!open.length) return '';
  return `<div class="panel-head"><h2>Filament unterwegs</h2><p>${plural(open.length, 'Paket', 'Pakete')}</p></div>
    <div class="sale-list">${open.map((d) => `<div class="delivery-row" data-id="${esc(d.id)}">
        <div class="sale-main">
          <button type="button" class="sale-title" data-dl="edit"><strong>${esc(d.shop || 'Filament-Paket')}</strong><span class="small muted"> · bestellt ${dateDe(d.orderedAt)}${d.expectedAt ? `, erwartet ${dateDe(d.expectedAt)}` : ''}</span></button>
          <span class="small muted">${esc(itemsText(d.items))}</span>
          ${d.tracking ? `<button type="button" class="pill track ${esc(d.tracking.status || 'none')}" data-dl="edit">${icons.truck}${esc(trackShort(d.tracking))}</button>` : '<button type="button" class="link small" data-dl="edit">Sendungsnummer eintragen</button>'}
        </div>
        <button type="button" class="btn small primary" data-dl="receive">Ins Lager</button>
      </div>`).join('')}</div>`;
}

function itemRow(i) {
  return `<div class="dl-item">
    <input name="material" list="dl-types" value="${esc(i.material)}" placeholder="Filamentart" aria-label="Filamentart">
    <input name="colorName" list="dl-colors" value="${esc(i.colorName)}" placeholder="Farbe" aria-label="Farbe">
    <input name="colorHex" type="color" value="${esc(i.colorHex)}" aria-label="Farbton">
    <select name="purchaseWeight" aria-label="Gewicht">${PURCHASE_WEIGHTS.map((w) => `<option value="${w}" ${w === i.purchaseWeight ? 'selected' : ''}>${kg(w)}</option>`).join('')}</select>
    <input name="price" inputmode="decimal" value="${i.price ? esc(i.price.toFixed(2).replace('.', ',')) : ''}" placeholder="Preis" aria-label="Preis pro Rolle in €">
    <input name="qty" type="number" min="1" max="50" step="1" inputmode="numeric" value="${i.qty}" aria-label="Anzahl">
    <button type="button" class="icon-btn" data-dl="remove-item" aria-label="Rolle entfernen">${icons.trash}</button>
  </div>`;
}

function readItems(form) {
  return [...form.querySelectorAll('.dl-item')].map((r) => {
    const v = (n) => r.querySelector(`[name="${n}"]`).value;
    return {
      material: v('material').trim(), colorName: v('colorName').trim(), colorHex: v('colorHex'), purchaseWeight: Number(v('purchaseWeight')),
      price: parseNum(v('price')) || 0, qty: Math.max(1, Math.round(Number(v('qty'))) || 1),
    };
  }).filter((i) => i.material);
}

const EMPTY_ITEM = {
  material: 'PLA Basic', colorName: '', colorHex: '#9AA0A6', purchaseWeight: 1000, price: 0, qty: 1,
};

// Lieferung anlegen oder bearbeiten. items: Vorschlag, z. B. aus der Einkaufsliste.
export function deliveryDialog(app, delivery = null, { items = null, onDone } = {}) {
  const d = delivery || {
    shop: 'Bambu Lab Store', orderedAt: localDay(), expectedAt: '', note: '', tracking: null, items: items || [],
  };
  const list = d.items.length ? d.items : [{ ...EMPTY_ITEM, price: (listPrice('PLA Basic', app.settings) || { price: 0 }).price }];
  let hasKey = false;
  const dlg = openDialog({
    title: delivery ? `Paket${d.shop ? ` von ${esc(d.shop)}` : ''}` : 'Filament-Paket eintragen',
    body: `<div class="fields">
        <label class="field"><span>Shop</span><input name="shop" list="dl-shops" value="${esc(d.shop)}" placeholder="z. B. Bambu Lab Store"></label>
        <label class="field"><span>Bestellt am</span><input name="orderedAt" type="date" value="${esc(d.orderedAt)}"></label>
        <label class="field full"><span>DHL-Sendungsnummer</span><input name="number" value="${esc(d.tracking ? d.tracking.number : '')}" autocomplete="off" placeholder="aus der Versandmail, z. B. 00340434161234567890"></label>
        <label class="field"><span>Voraussichtlich da</span><input name="expectedAt" type="date" value="${esc(d.expectedAt)}"></label>
        <label class="field"><span>Notiz (optional)</span><input name="note" value="${esc(d.note)}" placeholder="z. B. Bestellnummer"></label>
      </div>
      ${d.tracking ? `<div data-track>${trackingHtml(d.tracking)}</div>
        <div class="actions"><a class="btn small" href="${esc(trackingUrl(d.tracking))}" target="_blank" rel="noopener">Auf dhl.de verfolgen</a>
          <button type="button" class="btn small" data-dl="check" hidden>Jetzt bei DHL nachsehen</button></div>` : ''}
      <h3>Rollen im Paket</h3>
      <div class="dl-items">${list.map(itemRow).join('')}</div>
      <div class="actions"><button type="button" class="btn small" data-dl="add-item">${icons.plus}Rolle</button>
        <button type="button" class="btn small" data-dl="from-shopping">${icons.cart}Aus der Einkaufsliste</button></div>
      <p class="small muted">Preis pro Rolle. Mit „Ins Lager“ werden daraus volle Rollen mit Kaufpreis und Kaufdatum (für die Jahresübersicht).
        Den Stand des Pakets fragt das Lager mit dem DHL-Schlüssel selbst ab und meldet, wenn es da ist.</p>
      <datalist id="dl-shops">${SHOPS.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
      <datalist id="dl-types">${filamentTypes(app.spools, app.settings).map((t) => `<option value="${esc(t.material)}"></option>`).join('')}</datalist>
      <datalist id="dl-colors">${COLOR_PRESETS.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>`,
    foot: `${delivery ? '<button type="button" class="btn danger" data-dl="delete">Löschen</button>' : ''}<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`,
    async onSubmit(form) {
      const f = form.elements;
      const number = f.number.value.replace(/\s+/g, '').toUpperCase();
      if (number && !validTrackingNumber(number)) throw new Error('Die Sendungsnummer sieht nicht richtig aus: nur Buchstaben und Ziffern, 8 bis 35 Zeichen.');
      const body = {
        shop: f.shop.value.trim(), orderedAt: f.orderedAt.value || localDay(), expectedAt: f.expectedAt.value, note: f.note.value.trim(), number, items: readItems(form),
      };
      const res = delivery ? await app.backend.updateDelivery(delivery.id, body) : await app.backend.addDelivery(body);
      app.deliveries = res.deliveries;
      const t = res.item.tracking;
      toast(t && t.status ? `Paket ${t.status === 'delivered' ? 'zugestellt' : 'gespeichert'}: ${trackShort(t)}` : delivery ? 'Paket gespeichert' : 'Paket eingetragen');
      if (onDone) onDone(res);
    },
  });
  const form = dlg.querySelector('form');
  if (app.backend.mode === 'server' && delivery && delivery.tracking) {
    app.backend.dhlSettings().then((x) => {
      hasKey = x.hasKey;
      const b = dlg.querySelector('[data-dl="check"]');
      if (b) b.hidden = !hasKey;
    }).catch(() => {});
  }
  // Farbe aus der Liste: Farbton dazu; Filamentart: Preis aus der Preisliste
  form.addEventListener('change', (e) => {
    const row = e.target.closest('.dl-item');
    if (!row) return;
    if (e.target.name === 'colorName') {
      const p = COLOR_PRESETS.find((c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
      if (p) row.querySelector('[name="colorHex"]').value = normHex(p.hex);
    }
    if (e.target.name === 'material' || e.target.name === 'purchaseWeight') {
      const entry = listPrice(row.querySelector('[name="material"]').value, app.settings);
      const price = row.querySelector('[name="price"]');
      if (entry && (!price.value.trim() || e.target.name === 'purchaseWeight')) {
        price.value = listPriceForWeight(entry, Number(row.querySelector('[name="purchaseWeight"]').value)).toFixed(2).replace('.', ',');
      }
    }
  });
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dl]');
    if (!b) return;
    const box = dlg.querySelector('.dl-items');
    if (b.dataset.dl === 'add-item') {
      const last = readItems(form).pop();
      box.insertAdjacentHTML('beforeend', itemRow(last ? { ...last, colorName: '', colorHex: '#9AA0A6', qty: 1 } : EMPTY_ITEM));
      box.lastElementChild.querySelector('[name="colorName"]').focus();
    }
    if (b.dataset.dl === 'remove-item') b.closest('.dl-item').remove();
    if (b.dataset.dl === 'from-shopping') {
      const fromList = deliveryItemsFromShopping(shoppingList(app.spools, app.settings));
      if (!fromList.length) {
        toast('Auf der Einkaufsliste steht gerade nichts.');
        return;
      }
      // leere Standardzeile ersetzen
      if (readItems(form).every((i) => !i.colorName)) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', fromList.map(itemRow).join(''));
      toast(`${plural(fromList.length, 'Sorte', 'Sorten')} aus der Einkaufsliste übernommen`);
    }
    if (b.dataset.dl === 'check') {
      b.disabled = true;
      try {
        const res = await app.backend.checkDelivery(delivery.id);
        app.deliveries = res.deliveries;
        dlg.querySelector('[data-track]').innerHTML = trackingHtml(res.item.tracking);
        if (onDone) onDone(res);
      } catch (err) {
        toast(err.message, 'error');
      }
      b.disabled = false;
    }
    if (b.dataset.dl === 'delete') {
      try {
        const res = await app.backend.deleteDelivery(delivery.id);
        app.deliveries = res.deliveries;
        dlg.close();
        toast('Paket gelöscht');
        if (onDone) onDone(res);
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  return dlg;
}

// Paket ist da: Rollen anlegen und auf Wunsch Etiketten drucken
export function receiveDialog(app, d, { onDone } = {}) {
  const n = d.items.reduce((a, i) => a + i.qty, 0);
  const places = [...new Set(app.spools.map((s) => s.location).filter(Boolean))].sort();
  openDialog({
    title: `Paket${d.shop ? ` von ${esc(d.shop)}` : ''} ist da`,
    body: n ? `<p>Diese Rollen kommen voll und ungeöffnet ins Lager, mit Kaufpreis und Kaufdatum ${dateDe(d.orderedAt)}:</p>
        <ul class="dl-receive">${d.items.map((i) => `<li><span class="dot-color" style="background:${esc(i.colorHex)}"></span>${i.qty} × ${esc(itemName(i))}${i.brand ? ` <span class="muted">${esc(i.brand)}</span>` : ''}, ${kg(i.purchaseWeight)}${i.price ? `, ${fmtEur(i.price)}` : ''}</li>`).join('')}</ul>
        <label class="field"><span>Lagerort / Paket (optional)</span><input name="location" list="dl-receive-loc" placeholder="z. B. 3 oder Kiste"></label>
        <datalist id="dl-receive-loc">${places.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>`
      : '<p>Im Paket sind keine Rollen eingetragen. Es wird nur als angekommen markiert; Rollen legst du wie gewohnt mit „Spule“ an.</p>',
    foot: `<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">${n ? `${plural(n, 'Rolle', 'Rollen')} ins Lager` : 'Angekommen'}</button>`,
    async onSubmit(form) {
      const res = await app.backend.receiveDelivery(d.id, { location: form.elements.location ? form.elements.location.value : '' });
      app.deliveries = res.deliveries;
      app.spools = res.spools;
      if (onDone) onDone(res);
      if (!res.created.length) {
        toast('Paket als angekommen markiert');
        return;
      }
      const nrs = res.created.map((s) => `#${s.nr}`).join(', ');
      openDialog({
        title: 'Im Lager',
        body: `<p>${plural(res.created.length, 'Rolle', 'Rollen')} angelegt: <strong>${esc(nrs)}</strong>.</p>
          <p class="small muted">Etiketten mit QR-Code helfen beim Wiegen und Finden.</p>`,
        foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Fertig</button><button type="button" class="btn primary" data-labels>Etiketten drucken</button>',
        onReady(dlg2) {
          dlg2.querySelector('[data-labels]').addEventListener('click', () => {
            openLabels(res.created, app.settings);
            dlg2.close();
          });
        },
      });
    },
  });
}

