// Reiter "Verkauf": offener Beleg, Vorrat, Angebote, erstellte Belege und die
// Kundenliste. Positionen kommen aus dem Rechner, dem Druckverlauf (Reiter
// "Drucke") oder dem Vorrat.
import {
  customerText, offerStatus, orderLabel, orderStepAt, orderSteps, salesSummary, trackingLabel, trackingUrl, validTrackingNumber,
} from './domain.js';
import { openReceipt } from './documents.js';
import { qrSvg } from './qr.js';
import {
  addPosition, draftTotals, loadDraft, positionBreakdown, saleFromDraft, saveDraft,
} from './sales.js';
import { editStockDialog, sellDialog } from './stock.js';
import {
  combobox, dateDe, esc, fmtDuration, fmtEur, fmtNum, icons, localDay, openDialog, parseNum as num, patchText, plural, tile, toast,
} from './ui.js';

let ctx = null; // { root, app, go }
let sales = { sales: [], summary: salesSummary([]) };
let offers = [];
let stock = [];
let customers = [];
let customerQuery = '';
let dhl = { hasKey: false }; // DHL-API-Schlüssel auf dem Server vorhanden?

const today = () => localDay();

export async function renderVerkauf(root, app, { go }) {
  ctx = { root, app, go };
  root.innerHTML = `
    <section class="panel" id="draft"></section>
    <section class="panel" id="stock"></section>
    <section class="panel" id="offers" hidden></section>
    <section class="panel" id="sales"><div class="panel-head"><h2>Belege</h2></div><p class="small muted">Lädt …</p></section>
    <section class="panel" id="customers"><div class="panel-head"><h2>Kunden</h2></div><p class="small muted">Lädt …</p></section>`;
  root.querySelector('#draft').addEventListener('click', onDraftClick);
  root.querySelector('#draft').addEventListener('input', onDraftInput);
  root.querySelector('#draft').addEventListener('change', onDraftChange);
  root.querySelector('#stock').addEventListener('click', onStockClick);
  root.querySelector('#offers').addEventListener('click', onOffersClick);
  root.querySelector('#sales').addEventListener('click', onSalesClick);
  root.querySelector('#customers').addEventListener('click', onCustomersClick);
  root.querySelector('#customers').addEventListener('input', onCustomersInput);
  try {
    const [s, o, st, c, d] = await Promise.all([app.backend.sales(), app.backend.offers(), app.backend.stock(), app.backend.customers(), app.backend.dhlSettings()]);
    sales = s;
    offers = o.offers;
    stock = st.stock;
    customers = c.customers;
    dhl = d;
  } catch (err) {
    toast(err.message, 'error');
  }
  updateDraft();
  updateStock();
  updateOffers();
  updateSales();
  updateCustomers();
}

// Verkaufs- und Angebotsantworten bringen den Vorrat mit.
function takeSales(res) {
  sales = { sales: res.sales, summary: res.summary };
  if (res.stock) stock = res.stock;
  updateStock();
}

// ---------------------------------------------------------------------------
// Offener Beleg

function splitText(b) {
  const costs = [['Filament', b.filament], ['Strom', b.energy], ['Drucker', b.machine], ['Fehldrucke', b.failure], ['Arbeit', b.labor]]
    .filter(([, v]) => v).map(([l, v]) => `${l} ${fmtEur(v)}`).join(' + ');
  return `${costs} = Kosten ${fmtEur(b.cost)}, dazu Gewinn ${fmtEur(b.profit)}`;
}

function draftHtml() {
  const draft = loadDraft();
  const { settings } = ctx.app;
  const head = `<div class="panel-head"><h2>Offener Beleg</h2><p>Teile aus dem Rechner oder dem Druckverlauf sammeln, dann den Beleg erstellen</p></div>`;
  if (!draft.positions.length) {
    const who = draft.customer && draft.customer.trim();
    return `${head}${who ? `<p>Für <strong>${esc(who)}</strong> <button type="button" class="link" data-draft="clear-customer">entfernen</button></p>` : ''}
      <p class="muted">Noch leer. Im Rechner, unter „Drucke“ im Druckverlauf oder unten beim Vorrat Teile hinzufügen.</p>
      <div class="actions"><button class="btn small" type="button" data-draft="manual">Position von Hand</button></div>`;
  }
  const t = draftTotals(draft, settings);
  const rows = t.lines.map((p) => {
    const b = p.breakdown;
    const auto = p.manual ? null : positionBreakdown({ ...p, piecePrice: null }, settings).piece;
    const left = p.stockId ? (stock.find((x) => x.id === p.stockId) || { onHand: 0 }).onHand : null;
    const meta = [
      left !== null ? `<span class="${left < p.qty ? 'neg' : ''}">aus dem Vorrat, noch ${left}</span>` : '',
      p.colorName || p.material ? `${p.colorHex ? `<span class="dot-color" style="background:${esc(p.colorHex)}"></span>` : ''}${esc([p.material, p.colorName].filter(Boolean).join(' '))}${p.spoolNr ? ` #${p.spoolNr}` : ''}` : '',
      p.grams ? `${fmtNum(p.grams)} g` : '',
      p.seconds ? fmtDuration(p.seconds) : '',
    ].filter(Boolean).join(' · ');
    return `<div class="draft-row" data-id="${esc(p.id)}">
      <div class="draft-title"><strong>${esc(p.title)}</strong>${meta ? `<span class="small muted">${meta} pro Stück</span>` : ''}
        <span class="small muted" data-k="split-${esc(p.id)}">${p.manual ? 'von Hand' : splitText(b)}</span></div>
      <label class="draft-field"><span>Anzahl</span><input type="number" min="1" step="1" inputmode="numeric" data-field="qty" value="${p.qty}"></label>
      <label class="draft-field"><span>pro Stück</span><input inputmode="decimal" data-field="piecePrice" value="${p.piecePrice === null ? '' : p.piecePrice.toFixed(2).replace('.', ',')}" placeholder="${auto === null ? '' : auto.toFixed(2).replace('.', ',')}" aria-label="Preis pro Stück in Euro"></label>
      <span class="num draft-sum" data-k="sum-${esc(p.id)}">${fmtEur(b.piece * p.qty)}</span>
      <button type="button" class="icon-btn" data-draft="remove" aria-label="Position entfernen">×</button>
    </div>`;
  }).join('');
  return `${head}
    <div class="draft-list">${rows}</div>
    <div class="calc-line" data-row="min" ${t.minExtra > 0 ? '' : 'hidden'}><span>Aufschlag auf den Mindestpreis von ${fmtEur(settings.minPrice)}</span><span class="num" data-k="min">${fmtEur(t.minExtra)}</span></div>
    <div class="calc-total"><span>Summe</span><strong class="num" data-k="total">${fmtEur(t.total)}</strong></div>
    <p class="small muted">Preis pro Stück leer lassen für den berechneten Preis. Ein eigener Preis ändert nur den Gewinn.</p>
    <div class="fields">
      <label class="field"><span>Datum</span><input type="date" data-meta="date" value="${esc(draft.date || today())}"></label>
      <label class="field"><span>Kunde (optional)</span><input data-meta="customer" id="draft-customer" value="${esc(draft.customer || '')}" placeholder="Name suchen oder neu eingeben">
        <small class="muted" data-k="customer-hint">${esc(customerHint(draft))}</small></label>
      <label class="field full"><span>Notiz auf dem Beleg (optional)</span><input data-meta="note" value="${esc(draft.note || '')}" placeholder="z. B. bar bezahlt"></label>
      ${draft.positions.some((p) => p.kind === 'versand') || draft.tracking ? `<label class="field full"><span>DHL-Sendungsnummer (optional, auch später möglich)</span>
        <input data-meta="tracking" value="${esc(draft.tracking || '')}" inputmode="text" autocomplete="off" placeholder="z. B. 00340434…"></label>` : ''}
    </div>
    <div class="actions">
      <button class="btn primary" type="button" data-draft="create">Beleg erstellen</button>
      <button class="btn" type="button" data-draft="offer">Als Angebot speichern</button>
      <button class="btn" type="button" data-draft="shipping">${icons.truck}Versand</button>
      <button class="btn" type="button" data-draft="manual">Position von Hand</button>
      <span class="spacer"></span>
      <button class="btn ghost" type="button" data-draft="clear">Leeren</button>
    </div>`;
}

function updateDraft(full = true) {
  const el = ctx.root.querySelector('#draft');
  if (!full) {
    patchText(el, draftHtml());
    return;
  }
  el.innerHTML = draftHtml();
  const input = el.querySelector('#draft-customer');
  if (input) {
    combobox(input, {
      options: () => customers.map((c) => ({ value: c.name, hint: c.address.split('\n').pop() })),
      onPick: (name) => {
        const c = customers.find((x) => x.name === name);
        editDraft((d) => {
          d.customer = name;
          d.customerId = c ? c.id : '';
        });
        updateDraft(false);
      },
      newLabel: (v) => `„${v}“ als neuen Kunden`,
    });
  }
}

// Unter dem Kundenfeld: Adresse aus der Kundenliste oder Hinweis auf neuen Kunden
function customerHint(draft) {
  const c = draft.customerId && customers.find((x) => x.id === draft.customerId);
  if (c) return c.address ? c.address.replace(/\n/g, ', ') : 'aus der Kundenliste';
  return draft.customer && draft.customer.trim() ? 'wird beim Erstellen als neuer Kunde gespeichert' : '';
}

// Kunde für Beleg oder Angebot: aus der Liste oder neu anlegen
async function draftCustomer(draft) {
  let c = draft.customerId && customers.find((x) => x.id === draft.customerId);
  const name = (draft.customer || '').trim();
  if (!c && name) c = customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c && name) {
    const res = await ctx.app.backend.addCustomer({ name });
    customers = res.customers;
    c = res.item;
  }
  return c ? { customer: customerText(c), customerId: c.id } : { customer: '', customerId: '' };
}

function editDraft(fn) {
  const draft = loadDraft();
  fn(draft);
  saveDraft(draft);
  return draft;
}

function onDraftInput(e) {
  const row = e.target.closest('.draft-row');
  const meta = e.target.dataset.meta;
  if (meta) {
    editDraft((d) => {
      d[meta] = e.target.value;
      if (meta === 'customer') d.customerId = ''; // getippt statt gewählt
    });
    if (meta === 'customer') updateDraft(false);
    return;
  }
  if (!row) return;
  const field = e.target.dataset.field;
  editDraft((d) => {
    const p = d.positions.find((x) => x.id === row.dataset.id);
    if (!p) return;
    if (field === 'qty') p.qty = Math.max(1, Math.round(num(e.target.value)) || 1);
    if (field === 'piecePrice') {
      const v = num(e.target.value);
      p.piecePrice = e.target.value.trim() === '' || !Number.isFinite(v) ? null : Math.max(0, v);
    }
  });
  updateDraft(false);
}

// Nach dem Verlassen eines Feldes ganz neu zeichnen (Platzhalter, Aufteilung).
function onDraftChange(e) {
  if (e.target.dataset.field) {
    updateDraft();
    updateStock();
  }
}

async function onDraftClick(e) {
  const b = e.target.closest('[data-draft]');
  if (!b) return;
  const action = b.dataset.draft;
  if (action === 'remove') {
    const id = b.closest('.draft-row').dataset.id;
    editDraft((d) => { d.positions = d.positions.filter((p) => p.id !== id); });
    updateDraft();
    updateStock();
  }
  if (action === 'clear') {
    saveDraft({ positions: [], customer: '', note: '' });
    updateDraft();
    updateStock();
  }
  if (action === 'manual') manualDialog();
  if (action === 'shipping') shippingDialog();
  if (action === 'clear-customer') {
    editDraft((d) => {
      d.customer = '';
      d.customerId = '';
    });
    updateDraft();
  }
  if (action === 'create') await createReceipt(b);
  if (action === 'offer') await createOffer(b);
}

function manualDialog() {
  openDialog({
    title: 'Position von Hand',
    body: `<div class="fields">
      <label class="field full"><span>Bezeichnung</span><input name="title" required placeholder="z. B. Versand oder Sonderwunsch"></label>
      <label class="field"><span>Anzahl</span><input name="qty" type="number" min="1" step="1" value="1"></label>
      <label class="field"><span>Preis pro Stück (€)</span><input name="price" inputmode="decimal" required></label>
      <label class="field full"><span>Eigene Kosten pro Stück (€, optional)</span><input name="cost" inputmode="decimal" placeholder="0"></label>
    </div>`,
    foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Hinzufügen</button>',
    async onSubmit(form) {
      const f = form.elements;
      const price = num(f.price.value);
      if (!f.title.value.trim()) throw new Error('Bitte eine Bezeichnung eingeben.');
      if (!f.price.value.trim() || !Number.isFinite(price) || price < 0) throw new Error('Bitte einen Preis in Euro eingeben, z. B. 4,50.');
      addPosition({
        title: f.title.value.trim(), qty: Math.max(1, Math.round(num(f.qty.value)) || 1), manual: true, piecePrice: price, pieceCost: Math.max(0, num(f.cost.value) || 0),
      });
      updateDraft();
    },
  });
}

// Versand als feste Position: Preis für den Kunden, eigene Kosten = Porto
function shippingDialog() {
  const options = ctx.app.settings.shipping;
  openDialog({
    title: 'Versand',
    body: `<div class="ship-options">${options.map((o, i) => `<label class="switch"><input type="radio" name="option" value="${i}" ${i === 0 ? 'checked' : ''}>
        <span>${esc(o.name)} <strong class="num">${fmtEur(o.price)}</strong><small>Porto ${fmtEur(o.cost)}</small></span></label>`).join('')}
        <label class="switch"><input type="radio" name="option" value="own" ${options.length ? '' : 'checked'}><span>Anderer Betrag</span></label></div>
      <div class="fields">
        <label class="field"><span>Preis für den Kunden (€)</span><input name="price" inputmode="decimal"></label>
        <label class="field"><span>Porto, eigene Kosten (€)</span><input name="cost" inputmode="decimal"></label>
        <label class="field full"><span>DHL-Sendungsnummer (optional)</span><input name="tracking" autocomplete="off"></label>
      </div>
      <p class="small muted">Versandarten und Preise stehen unter Einstellungen. Die Sendungsnummer kannst du auch später am Beleg eintragen.</p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Hinzufügen</button>',
    onReady(dlg, form) {
      const f = form.elements;
      const fill = () => {
        const o = options[Number(f.option.value)];
        if (!o) return;
        f.price.value = o.price.toFixed(2).replace('.', ',');
        f.cost.value = o.cost.toFixed(2).replace('.', ',');
      };
      form.addEventListener('change', (e) => {
        if (e.target.name === 'option') fill();
      });
      fill();
    },
    onSubmit(form) {
      const f = form.elements;
      const o = options[Number(f.option.value)];
      const price = num(f.price.value);
      if (!f.price.value.trim() || !Number.isFinite(price) || price < 0) throw new Error('Bitte den Versandpreis in Euro eingeben.');
      addPosition({
        title: `Versand${o ? ` (${o.name})` : ''}`, qty: 1, manual: true, kind: 'versand', piecePrice: price, pieceCost: Math.max(0, num(f.cost.value) || 0),
      });
      if (f.tracking.value.trim()) editDraft((d) => { d.tracking = f.tracking.value.trim(); });
      updateDraft();
    },
  });
}

async function createReceipt(btn) {
  const draft = loadDraft();
  const { settings } = ctx.app;
  btn.disabled = true;
  try {
    const who = await draftCustomer(draft);
    const res = await ctx.app.backend.addSale({
      ...saleFromDraft(draft, settings, { date: draft.date || today(), customer: who.customer, note: draft.note || '' }),
      customerId: who.customerId,
    });
    saveDraft({ positions: [], customer: '', note: '' });
    takeSales(res);
    updateDraft();
    updateSales();
    updateCustomers();
    toast(`Beleg ${res.sale.nr} erstellt`);
    openReceipt(res.sale, settings);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
  }
}

// Angebot statt Beleg: bekommt eine eigene Nummer und gilt eine Zeit lang.
async function createOffer(btn) {
  const draft = loadDraft();
  const { settings } = ctx.app;
  btn.disabled = true;
  try {
    const who = await draftCustomer(draft);
    const res = await ctx.app.backend.addOffer({
      ...saleFromDraft(draft, settings, { date: draft.date || today(), customer: who.customer, note: draft.note || '' }),
      customerId: who.customerId,
    });
    offers = res.offers;
    saveDraft({ positions: [], customer: '', note: '' });
    updateDraft();
    updateOffers();
    updateCustomers();
    toast(`Angebot ${res.offer.nr} gespeichert`);
    openReceipt(res.offer, settings, { offer: true });
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Vorrat

function updateStock() {
  const el = ctx.root.querySelector('#stock');
  const draft = loadDraft();
  const inDraft = (id) => draft.positions.filter((p) => p.stockId === id).reduce((a, p) => a + p.qty, 0);
  const list = [...stock].sort((a, b) => Number(b.onHand > 0) - Number(a.onHand > 0) || a.title.localeCompare(b.title, 'de'));
  const pieces = stock.reduce((a, x) => a + x.onHand, 0);
  const value = stock.reduce((a, x) => a + x.onHand * x.price, 0);
  el.innerHTML = `<div class="panel-head"><h2>Vorrat</h2><p>${pieces ? `${pieces} ${pieces === 1 ? 'Teil' : 'Teile'}, Verkaufswert ${fmtEur(value)}` : 'auf Vorrat gedruckt, einzeln verkaufen'}</p></div>
    ${list.length ? `<div class="stock-list">${list.map((x) => {
    const reserved = inDraft(x.id);
    const profit = x.price - x.parts.cost;
    return `<div class="stock-row${x.onHand ? '' : ' sold-out'}" data-id="${esc(x.id)}">
        <div class="stock-title"><strong>${esc(x.title)}</strong>
          <span class="small muted">${x.colorHex ? `<span class="dot-color" style="background:${esc(x.colorHex)}"></span>` : ''}${esc([x.material, x.colorName].filter(Boolean).join(' '))}${x.material || x.colorName ? ' · ' : ''}Selbstkosten ${fmtEur(x.parts.cost)}, Gewinn <span class="${profit < 0 ? 'neg' : ''}">${fmtEur(profit)}</span> pro Stück</span></div>
        <div class="stock-count"><strong class="num">${x.onHand}</strong><span class="small muted">${x.onHand ? `von ${x.made}` : 'ausverkauft'}${reserved ? ` · ${reserved} im Beleg` : ''}</span></div>
        <span class="num stock-price">${fmtEur(x.price)}</span>
        <span class="stock-actions"><button type="button" class="btn small primary" data-stock="sell" ${x.onHand ? '' : 'disabled'}>Verkaufen</button>
          <button type="button" class="icon-btn" data-stock="edit" aria-label="${esc(x.title)} ändern">${icons.edit}</button></span>
      </div>`;
  }).join('')}</div>` : `<p class="muted">Mehrere gleiche Teile auf einmal gedruckt, z. B. 25 Kürbisse? Leg sie auf Vorrat: im Rechner die Anzahl eintragen und „Auf Vorrat legen“,
      oder unter „Drucke“ im Druckverlauf bei einem Druck „Auf Vorrat“. Dann verkaufst du sie einzeln, der Vorrat zählt mit, und die Arbeit ist auf alle Teile verteilt.</p>`}`;
}

function onStockClick(e) {
  const b = e.target.closest('[data-stock]');
  if (!b) return;
  const item = stock.find((x) => x.id === b.closest('.stock-row').dataset.id);
  if (!item) return;
  if (b.dataset.stock === 'sell') {
    sellDialog(ctx.app, item, {
      customers,
      async onSold(res) {
        takeSales(res);
        updateSales();
        customers = (await ctx.app.backend.customers()).customers;
        updateCustomers();
      },
      onDraft() {
        updateDraft();
        updateStock();
      },
    });
  }
  if (b.dataset.stock === 'edit') {
    editStockDialog(ctx.app, item, {
      onDone(res) {
        stock = res.stock;
        updateStock();
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Angebote

const OFFER_STATUS = {
  offen: (o) => `<span class="pill">gilt bis ${dateDe(o.validUntil)}</span>`,
  abgelaufen: (o) => `<span class="pill knapp">abgelaufen ${dateDe(o.validUntil)}</span>`,
  angenommen: (o) => `<span class="pill new">Beleg ${esc(o.saleNr)}</span>`,
};

function updateOffers() {
  const el = ctx.root.querySelector('#offers');
  el.hidden = !offers.length;
  if (!offers.length) return;
  const open = offers.filter((o) => offerStatus(o, today()) === 'offen');
  el.innerHTML = `<div class="panel-head"><h2>Angebote</h2><p>${open.length ? `${plural(open.length, 'offenes', 'offene')} über ${fmtEur(open.reduce((a, o) => a + o.price, 0))}` : 'keine offenen'}</p></div>
    <div class="sale-list">${offers.slice(0, 50).map((o) => {
    const status = offerStatus(o, today());
    return `<div class="sale-row offer-row">
        <span class="num small muted sale-nr"><span>${esc(o.nr)}</span><span>${dateDe(o.date)}</span></span>
        <button type="button" class="sale-title" data-offer="open" data-id="${esc(o.id)}"><strong>${esc(o.title)}</strong>${o.qty > 1 ? ` <span class="muted">× ${o.qty}</span>` : ''}${o.customer ? `<span class="small muted"> · ${esc(o.customer.split('\n')[0])}</span>` : ''}</button>
        <span class="num">${fmtEur(o.price)}</span>
        <span class="offer-state">${OFFER_STATUS[status](o)}${status === 'angenommen' ? '' : ` <button type="button" class="btn small primary" data-offer="accept" data-id="${esc(o.id)}">Beleg</button>`}</span>
        <button type="button" class="icon-btn" data-offer="delete" data-id="${esc(o.id)}" aria-label="Angebot löschen">×</button>
      </div>`;
  }).join('')}</div>
    <p class="small muted">„Beleg“ macht aus dem Angebot mit einem Klick einen Beleg mit denselben Preisen.</p>`;
}

async function onOffersClick(e) {
  const b = e.target.closest('[data-offer]');
  if (!b) return;
  const offer = offers.find((o) => o.id === b.dataset.id);
  if (!offer) return;
  const { settings } = ctx.app;
  if (b.dataset.offer === 'open') openReceipt(offer, settings, { offer: true });
  if (b.dataset.offer === 'accept') {
    b.disabled = true;
    try {
      const res = await ctx.app.backend.acceptOffer(offer.id);
      offers = res.offers;
      takeSales(res);
      updateOffers();
      updateSales();
      updateCustomers();
      toast(`Beleg ${res.sale.nr} aus Angebot ${offer.nr} erstellt`);
      openReceipt(res.sale, settings);
    } catch (err) {
      toast(err.message, 'error');
      b.disabled = false;
    }
  }
  if (b.dataset.offer === 'delete') {
    openDialog({
      title: 'Angebot löschen?',
      body: `<p>Angebot ${esc(offer.nr)} über ${fmtEur(offer.price)} wird gelöscht.${offer.saleNr ? ` Beleg ${esc(offer.saleNr)} bleibt erhalten.` : ''}</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn danger solid">Löschen</button>',
      async onSubmit() {
        offers = (await ctx.app.backend.deleteOffer(offer.id)).offers;
        updateOffers();
        toast('Angebot gelöscht');
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Belege

function updateSales() {
  const el = ctx.root.querySelector('#sales');
  const { summary } = sales;
  const m = summary.month;
  const t = summary.total;
  const monthName = new Date().toLocaleDateString('de-DE', { month: 'long' });
  el.innerHTML = `<div class="panel-head"><h2>Belege</h2><p>Antippen öffnet den Beleg zum Drucken oder als PDF</p></div>
    <div class="stats sales-stats">
      ${tile(`Umsatz im ${esc(monthName)}`, fmtEur(m.revenue), `${m.pieces} Stück`)}
      ${tile(`Gewinn im ${esc(monthName)}`, fmtEur(m.profit), `Kosten ${fmtEur(m.cost)}`)}
      ${tile('Umsatz gesamt', fmtEur(t.revenue), `${plural(t.count, 'Beleg', 'Belege')}, ${t.pieces} Stück`)}
      ${tile('Gewinn gesamt', fmtEur(t.profit), `Kosten ${fmtEur(t.cost)}`)}
    </div>
    ${openOrdersHtml()}
    ${sales.sales.length ? `<div class="sale-list">${sales.sales.slice(0, 50).map((s) => `
      <div class="sale-row receipt-row">
        <span class="num small muted sale-nr"><span>${esc(s.nr)}</span><span>${dateDe(s.date)}</span></span>
        <div class="sale-main">
          <button type="button" class="sale-title" data-sales="open" data-id="${esc(s.id)}"><strong>${esc(s.title)}</strong>${s.qty > 1 ? ` <span class="muted">× ${s.qty}</span>` : ''}${s.customer ? `<span class="small muted"> · ${esc(s.customer.split('\n')[0])}</span>` : ''}</button>
          ${statusPill(s)}
        </div>
        <span class="num">${fmtEur(s.price)}</span>
        <span class="num small ${s.price - s.cost >= 0 ? 'muted' : 'neg'}" title="Gewinn">${s.price - s.cost >= 0 ? '+' : ''}${fmtEur(s.price - s.cost)}</span>
        <button type="button" class="icon-btn" data-sales="order" data-id="${esc(s.id)}" aria-label="Bestellstatus und Versand" title="Bestellstatus, Link für den Kunden, DHL">${icons.truck}</button>
        <button type="button" class="icon-btn" data-sales="delete" data-id="${esc(s.id)}" aria-label="Beleg löschen">×</button>
      </div>`).join('')}</div>`
    : '<p class="small muted">Noch keine Belege.</p>'}`;
}

// Bestellstatus oder Sendung als Knopf in der Belegliste
function statusPill(s) {
  const o = s.order;
  if (o.status) {
    const place = o.status === 'versendet' && s.tracking && s.tracking.place ? ` · ${s.tracking.place}` : '';
    return `<button type="button" class="pill order ${esc(o.status)}" data-sales="order" data-id="${esc(s.id)}">${icons.truck}${esc(orderLabel(o.status, o.delivery) + place)}${o.token ? ' · Link' : ''}</button>`;
  }
  if (s.tracking) return `<button type="button" class="pill track ${esc(s.tracking.status || 'none')}" data-sales="order" data-id="${esc(s.id)}">${icons.truck}${esc(trackShort(s.tracking))}</button>`;
  return '';
}

// Bestellungen, die noch nicht beim Kunden sind, mit dem nächsten Schritt
function openOrdersHtml() {
  const open = sales.sales.filter((s) => s.order.status && s.order.status !== 'zugestellt')
    .sort((a, b) => (a.order.expectedAt || '9999').localeCompare(b.order.expectedAt || '9999') || a.date.localeCompare(b.date));
  if (!open.length) return '';
  return `<h3>Offene Bestellungen (${open.length})</h3>
    <div class="sale-list open-orders">${open.map((s) => {
    const steps = orderSteps(s.order.delivery);
    const next = steps[steps.indexOf(s.order.status) + 1];
    return `<div class="sale-row receipt-row">
        <span class="num small muted sale-nr"><span>${esc(s.nr)}</span><span>${s.order.expectedAt ? `bis ${dateDe(s.order.expectedAt)}` : dateDe(s.date)}</span></span>
        <div class="sale-main">
          <button type="button" class="sale-title" data-sales="order" data-id="${esc(s.id)}"><strong>${esc(s.customer ? s.customer.split('\n')[0] : s.title)}</strong><span class="small muted"> · ${esc(s.title)}</span></button>
          ${statusPill(s)}
        </div>
        <span></span><span></span>
        ${next === 'versendet' ? `<button type="button" class="btn small" data-sales="order" data-id="${esc(s.id)}">Versenden …</button>`
    : next ? `<button type="button" class="btn small" data-sales="next" data-step="${next}" data-id="${esc(s.id)}">${esc(orderLabel(next, s.order.delivery))}</button>` : '<span></span>'}
        <span></span>
      </div>`;
  }).join('')}</div>
    <h3>Alle Belege</h3>`;
}

function onSalesClick(e) {
  const b = e.target.closest('[data-sales]');
  if (!b) return;
  const sale = sales.sales.find((s) => s.id === b.dataset.id);
  if (!sale) return;
  if (b.dataset.sales === 'open') openReceipt(sale, ctx.app.settings);
  if (b.dataset.sales === 'order') orderDialog(sale);
  if (b.dataset.sales === 'next') {
    b.disabled = true;
    ctx.app.backend.updateOrder(sale.id, { status: b.dataset.step }).then((res) => {
      takeSales(res);
      updateSales();
      toast(`${sale.nr}: ${orderLabel(res.sale.order.status, res.sale.order.delivery)}`);
    }, (err) => {
      toast(err.message, 'error');
      b.disabled = false;
    });
  }
  if (b.dataset.sales === 'delete') {
    openDialog({
      title: 'Beleg löschen?',
      body: `<p>Beleg ${esc(sale.nr)} vom ${dateDe(sale.date)} über ${fmtEur(sale.price)} wird gelöscht. Die Nummer wird nicht neu vergeben.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn danger solid">Löschen</button>',
      async onSubmit() {
        takeSales(await ctx.app.backend.deleteSale(sale.id));
        updateSales();
        updateCustomers();
        toast(sale.items.some((i) => i.stockId) ? 'Beleg gelöscht, die Teile sind wieder im Vorrat' : 'Beleg gelöscht');
      },
    });
  }
}

// ---------------------------------------------------------------------------
// DHL-Sendungsverfolgung

const timeDe = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Kurz für die Liste: "unterwegs · Bonn", ohne Abfrage nur die Nummer
function trackShort(t) {
  if (!t.status) return `…${t.number.slice(-6)}`;
  return [trackingLabel(t), t.place].filter(Boolean).join(' · ');
}

function trackingHtml(t) {
  if (!t) return '';
  const head = t.status
    ? `<p><span class="pill track ${esc(t.status)}">${esc(trackingLabel(t))}</span> ${esc(t.statusText)}${t.place ? ` <span class="muted">(${esc(t.place)})</span>` : ''}</p>
      <p class="small muted">${t.updatedAt ? `Stand ${esc(timeDe(t.updatedAt))}. ` : ''}${t.checkedAt ? `Bei DHL nachgesehen ${esc(timeDe(t.checkedAt))}.` : ''}</p>`
    : '';
  const events = t.events.length > 1 ? `<details><summary>Verlauf (${t.events.length})</summary><ol class="track-events">${t.events.map((e) => `<li><span class="small muted num">${esc(timeDe(e.time))}</span> ${esc(e.text)}${e.place ? ` <span class="muted">· ${esc(e.place)}</span>` : ''}</li>`).join('')}</ol></details>` : '';
  return `${head}${t.error ? `<p class="small neg">${esc(t.error)}</p>` : ''}${events}`;
}

const orderLink = (o) => new URL(`bestellung.html#t=${o.token}`, location.href).href;

function stepsHtml(sale) {
  const o = sale.order;
  const steps = orderSteps(o.delivery);
  const cur = steps.indexOf(o.status);
  return `<div class="order-pick">${steps.map((st, i) => `<button type="button" class="btn small ${i < cur ? 'done' : ''}" data-step="${st}" aria-pressed="${st === o.status}">${i < cur ? '✓ ' : ''}${esc(orderLabel(st, o.delivery))}</button>`).join('')}</div>
    <p class="small muted">${o.status ? `Seit ${esc(timeDe(orderStepAt(o, o.status)))}. Sendungsnummer setzt „Versendet“, DHL „Zugestellt“${o.printJob ? `, Druckende von „${esc(o.printJob.job)}“ setzt „${esc(orderLabel('fertig', o.delivery))}“` : ''} von selbst.`
    : 'Antippen startet die Bestellverfolgung, z. B. „Bestellung eingegangen“.'}
    ${o.status ? ' <button type="button" class="link" data-order="stop">Verfolgung beenden</button>' : ''}</p>`;
}

function linkHtml(sale) {
  const o = sale.order;
  if (ctx.app.backend.mode !== 'server') return '<p class="small muted">Einen Link für Kunden gibt es nur mit dem Lager-Server.</p>';
  if (!o.token) {
    return `<p class="small">Der Kunde sieht über den Link ohne Passwort den Stand der Bestellung, den Druckfortschritt und die DHL-Sendung. Preise pro Teil, Kosten und andere Bestellungen sieht er nicht.</p>
      <div class="actions"><button type="button" class="btn primary" data-order="link">Link erstellen</button></div>`;
  }
  const url = orderLink(o);
  return `<div class="share-box">
      <div class="share-qr">${qrSvg(url, { border: 2, title: 'Link als QR-Code' })}</div>
      <div class="share-link"><span class="copy-row"><input id="order-link" readonly value="${esc(url)}" aria-label="Link für den Kunden"><button class="btn" type="button" data-order="copy">Kopieren</button></span>
        <div class="actions">${navigator.share ? '<button type="button" class="btn small" data-order="share">Teilen …</button>' : ''}<button type="button" class="btn small" data-order="text">Text mit Link kopieren</button>
          <a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">Ansehen</a><button type="button" class="btn small danger" data-order="unlink">Zurückziehen</button></div></div>
    </div>`;
}

function orderDialog(sale) {
  const server = ctx.app.backend.mode === 'server';
  const who = sale.customer ? sale.customer.split('\n')[0] : '';
  const o = sale.order;
  const t = sale.tracking;
  const dlg = openDialog({
    title: `Bestellung ${esc(sale.nr)}${who ? ` · ${esc(who)}` : ''}`,
    body: `<div class="dlg-section"><h3>Status für den Kunden</h3><div data-steps>${stepsHtml(sale)}</div>
        <div class="fields">
          <label class="field"><span>Lieferung</span><select name="delivery"><option value="versand" ${o.delivery === 'versand' ? 'selected' : ''}>Versand</option><option value="abholung" ${o.delivery === 'abholung' ? 'selected' : ''}>Abholung</option></select></label>
          <label class="field"><span>Voraussichtlich da bzw. abholbereit</span><input type="date" name="expectedAt" value="${esc(o.expectedAt)}"></label>
          <label class="field full"><span>Nachricht an den Kunden (optional)</span><textarea name="note" rows="2" placeholder="z. B. Der Druck braucht etwas länger, das Filament kommt am Montag.">${esc(o.note)}</textarea></label>
        </div></div>
      <div class="dlg-section"><h3>Link für den Kunden</h3><div data-link>${linkHtml(sale)}</div></div>
      <div class="dlg-section"><h3>DHL-Sendung</h3>
        <label class="field"><span>DHL-Sendungsnummer</span><input name="number" value="${esc(t ? t.number : '')}" autocomplete="off" placeholder="z. B. 00340434161234567890"></label>
        <div data-track>${trackingHtml(t)}</div>
        ${t ? `<div class="actions"><a class="btn small" href="${esc(trackingUrl(t))}" target="_blank" rel="noopener">Auf dhl.de verfolgen</a>
          ${dhl.hasKey ? '<button type="button" class="btn small" data-order="check">Jetzt bei DHL nachsehen</button>' : ''}
          <button type="button" class="btn small danger" data-order="untrack">Nummer entfernen</button></div>` : ''}
        ${!dhl.hasKey ? `<p class="small muted">${server ? 'Mit einem kostenlosen DHL-API-Schlüssel (Einstellungen → Sendungsverfolgung) zeigt das Lager den Stand selbst an, auch auf der Seite für den Kunden.' : 'Den Stand zeigt das Lager nur mit Server und DHL-API-Schlüssel an, hier gibt es den Link zu dhl.de.'}</p>` : ''}</div>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Schließen</button><button type="submit" class="btn primary">Speichern</button>',
    async onSubmit(form) {
      const f = form.elements;
      const number = f.number.value.replace(/\s+/g, '').toUpperCase();
      if (number && !validTrackingNumber(number)) throw new Error('Die Sendungsnummer sieht nicht richtig aus: nur Buchstaben und Ziffern, 8 bis 35 Zeichen.');
      await send({});
      const cur = current();
      if (number !== (cur.tracking ? cur.tracking.number : '')) {
        const res = await ctx.app.backend.setTracking(sale.id, number);
        takeSales(res);
        updateSales();
        const tr = res.sale.tracking;
        toast(tr && tr.status ? `Gespeichert, Sendung ${trackingLabel(tr)}${tr.place ? ` (${tr.place})` : ''}` : 'Gespeichert');
      } else toast('Gespeichert');
    },
  });
  const form = dlg.querySelector('form');
  const current = () => sales.sales.find((x) => x.id === sale.id) || sale;
  const redraw = () => {
    const s = current();
    dlg.querySelector('[data-steps]').innerHTML = stepsHtml(s);
    dlg.querySelector('[data-link]').innerHTML = linkHtml(s);
  };
  // Jede Änderung nimmt Lieferart, Datum und Nachricht mit, damit nichts verloren geht
  async function send(body) {
    const f = form.elements;
    const res = await ctx.app.backend.updateOrder(sale.id, {
      delivery: f.delivery.value, expectedAt: f.expectedAt.value, note: f.note.value, ...body,
    });
    takeSales(res);
    updateSales();
    redraw();
    return res.sale;
  }
  const message = (s) => `Bestellung ${s.nr}${who ? ` für ${who}` : ''}: Den aktuellen Stand gibt es hier: ${orderLink(s.order)}`;
  form.addEventListener('change', (e) => {
    if (e.target.name === 'delivery' && current().order.status) send({}).catch((err) => toast(err.message, 'error'));
  });
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-step], [data-order]');
    if (!b) return;
    const s = current();
    try {
      if (b.dataset.step) {
        const fresh = await send({ status: b.dataset.step });
        toast(`Status: ${orderLabel(fresh.order.status, fresh.order.delivery)}${fresh.order.printJob && b.dataset.step === 'druck' ? ` (mit Fortschritt von „${fresh.order.printJob.job}“)` : ''}`);
      }
      const act = b.dataset.order;
      if (act === 'stop') {
        await send({ status: '' });
        toast('Bestellverfolgung beendet, der Link gilt nicht mehr');
      }
      if (act === 'link') {
        await send({ link: 'neu' });
        toast('Link erstellt');
      }
      if (act === 'unlink') {
        await send({ link: 'weg' });
        toast('Link zurückgezogen, er funktioniert nicht mehr');
      }
      if (act === 'copy' || act === 'text') {
        const text = act === 'copy' ? orderLink(s.order) : message(s);
        await navigator.clipboard.writeText(text).then(() => toast(act === 'copy' ? 'Link kopiert' : 'Text kopiert, z. B. für WhatsApp'), () => {
          dlg.querySelector('#order-link').select();
          toast('Link markiert, jetzt kopieren');
        });
      }
      if (act === 'share') await navigator.share({ title: `Bestellung ${s.nr}`, text: message(s), url: orderLink(s.order) }).catch(() => {});
      if (act === 'check') {
        b.disabled = true;
        const res = await ctx.app.backend.checkTracking(sale.id);
        takeSales(res);
        updateSales();
        redraw();
        dlg.querySelector('[data-track]').innerHTML = trackingHtml(res.sale.tracking);
        b.disabled = false;
      }
      if (act === 'untrack') {
        const res = await ctx.app.backend.setTracking(sale.id, '');
        takeSales(res);
        updateSales();
        form.elements.number.value = '';
        dlg.querySelector('[data-track]').innerHTML = '';
        b.closest('.actions').remove();
        toast('Sendungsnummer entfernt');
      }
    } catch (err) {
      toast(err.message, 'error');
      b.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Kunden

// Belege eines Kunden: über die Kundennummer, ältere Belege über den Namen
function salesOf(c) {
  const name = c.name.toLowerCase();
  return sales.sales.filter((s) => (s.customerId ? s.customerId === c.id : s.customer.split('\n')[0].trim().toLowerCase() === name));
}

function updateCustomers() {
  const el = ctx.root.querySelector('#customers');
  if (!el) return;
  const words = customerQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const list = customers.filter((c) => words.every((w) => [c.name, c.address, c.email, c.phone].join(' ').toLowerCase().includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const focused = document.activeElement && document.activeElement.id === 'customer-q';
  el.innerHTML = `<div class="panel-head"><h2>Kunden</h2><p>${customers.length ? plural(customers.length, 'Kunde', 'Kunden') : 'Namen und Adressen für Belege'}</p></div>
    <div class="toolbar">
      <label class="search">${icons.search}<input type="search" id="customer-q" placeholder="Kunde suchen" aria-label="Kunde suchen" value="${esc(customerQuery)}"></label>
      <span class="toolbar-actions"><button class="btn" type="button" data-customer="add">${icons.plus}Kunde</button></span>
    </div>
    ${list.length ? `<div class="customer-list">${list.map((c) => {
    const own = salesOf(c);
    const total = own.reduce((a, s) => a + s.price, 0);
    return `<div class="customer-row" data-id="${esc(c.id)}">
        <button type="button" class="sale-title customer-name" data-customer="edit"><strong>${esc(c.name)}</strong>
          <span class="small muted">${esc([c.address.replace(/\n/g, ', '), c.email, c.phone].filter(Boolean).join(' · ') || 'keine Kontaktdaten')}</span></button>
        <span class="small muted num">${own.length ? `${plural(own.length, 'Beleg', 'Belege')} · ${fmtEur(total)}` : 'noch kein Beleg'}</span>
        <button type="button" class="btn small" data-customer="receipt">Neuer Beleg</button>
      </div>`;
  }).join('')}</div>` : `<p class="small muted">${customers.length ? 'Kein Kunde passt zur Suche.' : 'Noch keine Kunden. Wer im offenen Beleg als Kunde eingetragen wird, landet beim Erstellen automatisch hier.'}</p>`}`;
  if (focused) {
    const q = el.querySelector('#customer-q');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }
}

function onCustomersInput(e) {
  if (e.target.id !== 'customer-q') return;
  customerQuery = e.target.value;
  updateCustomers();
}

function onCustomersClick(e) {
  const b = e.target.closest('[data-customer]');
  if (!b) return;
  if (b.dataset.customer === 'add') {
    customerDialog(null);
    return;
  }
  const c = customers.find((x) => x.id === b.closest('.customer-row').dataset.id);
  if (!c) return;
  if (b.dataset.customer === 'edit') customerDialog(c);
  if (b.dataset.customer === 'receipt') {
    editDraft((d) => {
      d.customer = c.name;
      d.customerId = c.id;
    });
    updateDraft();
    ctx.root.querySelector('#draft').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`${c.name} steht im offenen Beleg`);
  }
}

function customerDialog(c) {
  const own = c ? salesOf(c) : [];
  openDialog({
    title: c ? esc(c.name) : 'Neuer Kunde',
    body: `<div class="fields">
        <label class="field full"><span>Name</span><input name="name" required value="${esc(c ? c.name : '')}" autocomplete="off"></label>
        <label class="field full"><span>Adresse</span><textarea name="address" rows="3" placeholder="Straße Nr.&#10;PLZ Ort">${esc(c ? c.address : '')}</textarea></label>
        <label class="field"><span>E-Mail</span><input name="email" type="email" value="${esc(c ? c.email : '')}"></label>
        <label class="field"><span>Telefon</span><input name="phone" type="tel" value="${esc(c ? c.phone : '')}"></label>
        <label class="field full"><span>Notiz</span><input name="note" value="${esc(c ? c.note : '')}"></label>
      </div>
      ${own.length ? `<h3>Belege</h3><div class="sale-list">${own.slice(0, 20).map((s) => `<div class="sale-row">
          <span class="num small muted sale-nr"><span>${esc(s.nr)}</span><span>${dateDe(s.date)}</span></span>
          <button type="button" class="sale-title" data-open="${esc(s.id)}"><strong>${esc(s.title)}</strong></button>
          <span class="num">${fmtEur(s.price)}</span><span></span><span></span></div>`).join('')}</div>` : ''}`,
    foot: `${c ? '<button type="button" class="btn danger" data-del>Löschen</button>' : ''}<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`,
    onReady(dlg) {
      dlg.querySelector('.dlg-body').addEventListener('click', (e) => {
        const b = e.target.closest('[data-open]');
        const sale = b && sales.sales.find((s) => s.id === b.dataset.open);
        if (sale) openReceipt(sale, ctx.app.settings);
      });
      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        try {
          customers = (await ctx.app.backend.deleteCustomer(c.id)).customers;
          dlg.close();
          updateCustomers();
          toast(`${c.name} gelöscht. Belege bleiben erhalten.`);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
    async onSubmit(form) {
      const f = form.elements;
      const data = {
        name: f.name.value.trim(), address: f.address.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), note: f.note.value.trim(),
      };
      if (!data.name) throw new Error('Bitte einen Namen eingeben.');
      const res = c ? await ctx.app.backend.updateCustomer(c.id, data) : await ctx.app.backend.addCustomer(data);
      customers = res.customers;
      updateCustomers();
      updateDraft(false);
      toast(c ? 'Kunde gespeichert' : `${data.name} angelegt`);
    },
  });
}
