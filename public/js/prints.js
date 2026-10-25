// Reiter "Drucke": offener Beleg, Angebote, erstellte Belege mit Umsatz und Gewinn,
// Stromabrechnung für den, der den Strom zahlt, und der Druckverlauf aus der
// Bambu Cloud mit Kosten je Druck.
import {
  jobQuote, offerStatus, openPower, salesSummary,
} from './domain.js';
import { openJob } from './calculator.js';
import { openPowerStatement, openReceipt } from './documents.js';
import {
  addPosition, draftTotals, loadDraft, positionBreakdown, saleFromDraft, saveDraft,
} from './sales.js';
import {
  esc, fmtCt, fmtDuration, fmtEur, fmtNum, openDialog, patchText, timeAgo, toast,
} from './ui.js';

const STATUS = { 2: ['ok', 'fertig'], 3: ['crit', 'abgebrochen'] };

let ctx = null; // { root, app, go }
let history = { connected: false, lastSync: '', tasks: [] };
let sales = { sales: [], summary: salesSummary([]) };
let payments = [];
let offers = [];
let powerSince = ''; // abweichender Beginn der offenen Stromabrechnung (yyyy-mm-dd)

const num = (v) => Number(String(v).replace(/\s|€/g, '').replace(',', '.'));
// Datum im Format yyyy-mm-dd in der Zeitzone des Geräts
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localDay();
const dateDe = (iso) => new Date(iso).toLocaleDateString('de-DE');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function renderPrints(root, app, { go }) {
  ctx = { root, app, go };
  root.innerHTML = `
    <section class="panel" id="draft"></section>
    <section class="panel" id="offers" hidden></section>
    <section class="panel" id="sales"><div class="panel-head"><h2>Belege</h2></div><p class="small muted">Lädt …</p></section>
    <section class="panel" id="power"><div class="panel-head"><h2>Strom</h2></div><p class="small muted">Lädt …</p></section>
    <section class="panel" id="history"><div class="panel-head"><h2>Druckverlauf von Bambu</h2></div><p class="small muted">Lädt …</p></section>`;
  root.querySelector('#draft').addEventListener('click', onDraftClick);
  root.querySelector('#draft').addEventListener('input', onDraftInput);
  root.querySelector('#draft').addEventListener('change', onDraftChange);
  root.querySelector('#offers').addEventListener('click', onOffersClick);
  root.querySelector('#sales').addEventListener('click', onSalesClick);
  root.querySelector('#power').addEventListener('click', onPowerClick);
  root.querySelector('#power').addEventListener('change', onPowerChange);
  root.querySelector('#history').addEventListener('click', onHistoryClick);
  updateDraft();
  try {
    let power;
    let offerList;
    [history, sales, power, offerList] = await Promise.all([app.backend.tasks(), app.backend.sales(), app.backend.powerPayments(), app.backend.offers()]);
    payments = power.payments;
    offers = offerList.offers;
  } catch (err) {
    toast(err.message, 'error');
  }
  updateOffers();
  updateSales();
  updatePower();
  updateHistory();
}

function tile(label, value, hint = '') {
  return `<div class="stat"><span class="label">${label}</span><span class="value">${value}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
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
    return `${head}<p class="muted">Noch leer. Im Rechner oder unten im Druckverlauf auf „Zum Beleg“ tippen.</p>
      <div class="actions"><button class="btn small" type="button" data-draft="manual">Position von Hand</button></div>`;
  }
  const t = draftTotals(draft, settings);
  const rows = t.lines.map((p) => {
    const b = p.breakdown;
    const auto = p.manual ? null : positionBreakdown({ ...p, piecePrice: null }, settings).piece;
    const meta = [
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
      <label class="field"><span>Kunde (optional)</span><input data-meta="customer" value="${esc(draft.customer || '')}" placeholder="Name"></label>
      <label class="field full"><span>Notiz auf dem Beleg (optional)</span><input data-meta="note" value="${esc(draft.note || '')}" placeholder="z. B. bar bezahlt"></label>
    </div>
    <div class="actions">
      <button class="btn primary" type="button" data-draft="create">Beleg erstellen</button>
      <button class="btn" type="button" data-draft="offer">Als Angebot speichern</button>
      <button class="btn" type="button" data-draft="manual">Position von Hand</button>
      <span class="spacer"></span>
      <button class="btn ghost" type="button" data-draft="clear">Leeren</button>
    </div>`;
}

function updateDraft(full = true) {
  const el = ctx.root.querySelector('#draft');
  if (full) el.innerHTML = draftHtml();
  else patchText(el, draftHtml());
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
    editDraft((d) => { d[meta] = e.target.value; });
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
  if (e.target.dataset.field) updateDraft();
}

async function onDraftClick(e) {
  const b = e.target.closest('[data-draft]');
  if (!b) return;
  const action = b.dataset.draft;
  if (action === 'remove') {
    const id = b.closest('.draft-row').dataset.id;
    editDraft((d) => { d.positions = d.positions.filter((p) => p.id !== id); });
    updateDraft();
  }
  if (action === 'clear') {
    saveDraft({ positions: [], customer: '', note: '' });
    updateDraft();
  }
  if (action === 'manual') manualDialog();
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

async function createReceipt(btn) {
  const draft = loadDraft();
  const { settings } = ctx.app;
  btn.disabled = true;
  try {
    const res = await ctx.app.backend.addSale(saleFromDraft(draft, settings, {
      date: draft.date || today(), customer: draft.customer || '', note: draft.note || '',
    }));
    sales = res;
    saveDraft({ positions: [], customer: '', note: '' });
    updateDraft();
    updateSales();
    updatePower();
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
    const res = await ctx.app.backend.addOffer(saleFromDraft(draft, settings, {
      date: draft.date || today(), customer: draft.customer || '', note: draft.note || '',
    }));
    offers = res.offers;
    saveDraft({ positions: [], customer: '', note: '' });
    updateDraft();
    updateOffers();
    toast(`Angebot ${res.offer.nr} gespeichert`);
    openReceipt(res.offer, settings, { offer: true });
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
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
      sales = { sales: res.sales, summary: res.summary };
      updateOffers();
      updateSales();
      updatePower();
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
    ${sales.sales.length ? `<div class="sale-list">${sales.sales.slice(0, 50).map((s) => `
      <div class="sale-row">
        <span class="num small muted sale-nr"><span>${esc(s.nr)}</span><span>${dateDe(s.date)}</span></span>
        <button type="button" class="sale-title" data-sales="open" data-id="${esc(s.id)}"><strong>${esc(s.title)}</strong>${s.qty > 1 ? ` <span class="muted">× ${s.qty}</span>` : ''}${s.customer ? `<span class="small muted"> · ${esc(s.customer.split('\n')[0])}</span>` : ''}</button>
        <span class="num">${fmtEur(s.price)}</span>
        <span class="num small ${s.price - s.cost >= 0 ? 'muted' : 'neg'}" title="Gewinn">${s.price - s.cost >= 0 ? '+' : ''}${fmtEur(s.price - s.cost)}</span>
        <button type="button" class="icon-btn" data-sales="delete" data-id="${esc(s.id)}" aria-label="Beleg löschen">×</button>
      </div>`).join('')}</div>`
    : '<p class="small muted">Noch keine Belege.</p>'}`;
}

function onSalesClick(e) {
  const b = e.target.closest('[data-sales]');
  if (!b) return;
  const sale = sales.sales.find((s) => s.id === b.dataset.id);
  if (!sale) return;
  if (b.dataset.sales === 'open') openReceipt(sale, ctx.app.settings);
  if (b.dataset.sales === 'delete') {
    openDialog({
      title: 'Beleg löschen?',
      body: `<p>Beleg ${esc(sale.nr)} vom ${dateDe(sale.date)} über ${fmtEur(sale.price)} wird gelöscht. Die Nummer wird nicht neu vergeben.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn danger solid">Löschen</button>',
      async onSubmit() {
        sales = await ctx.app.backend.deleteSale(sale.id);
        updateSales();
        updatePower();
        toast('Beleg gelöscht');
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Strom für den, der ihn bezahlt

function currentPower() {
  return openPower({
    tasks: history.tasks, sales: sales.sales, payments, settings: ctx.app.settings, since: powerSince ? new Date(powerSince + 'T00:00:00').toISOString() : '',
  });
}

function updatePower() {
  const el = ctx.root.querySelector('#power');
  const { settings } = ctx.app;
  const who = settings.powerPayee;
  const p = currentPower();
  const source = p.source === 'verlauf'
    ? 'Gerechnet aus dem Bambu-Druckverlauf, auch abgebrochene Drucke.'
    : 'Ohne Bambu-Druckverlauf gerechnet aus den Belegen (nur verkaufte Teile).';
  el.innerHTML = `<div class="panel-head"><h2>Strom für ${esc(who)}</h2><p>${esc(who)} zahlt den Strom, hier steht, was ihm zusteht</p></div>
    <div class="stats sales-stats">
      ${tile('Offen', fmtEur(p.amount), `seit ${dateDe(p.from)}`)}
      ${tile('Strom in kWh', fmtNum(p.kwh, 2), `${fmtCt(settings.energyPrice)} ct pro kWh`)}
      ${tile('Druckzeit in Std.', fmtNum(p.hours, 1), `${fmtNum(settings.printerWatts, 0)} W beim Drucken`)}
      ${tile('Drucke', String(p.prints), payments.length ? `letzte Abrechnung ${dateDe(payments[0].date)}` : 'noch nie abgerechnet')}
    </div>
    <p class="small muted">${source} Watt und Strompreis stehen unter „Einstellungen“.</p>
    <div class="actions">
      <label class="inline-field"><span>Ab</span><input type="date" data-power="since" value="${esc(localDay(new Date(p.from)))}"></label>
      <button class="btn" type="button" data-power="show">Abrechnung ansehen</button>
      <button class="btn primary" type="button" data-power="pay" ${p.amount > 0 ? '' : 'disabled'}>${esc(fmtEur(p.amount))} an ${esc(who)} gegeben</button>
    </div>
    ${payments.length ? `<h3>Abgerechnet</h3><div class="sale-list">${payments.map((x) => `
      <div class="sale-row">
        <span class="num small muted">${dateDe(x.date)}</span>
        <button type="button" class="sale-title" data-power="view" data-id="${esc(x.id)}">${dateDe(x.from)} bis ${dateDe(x.to)}<span class="small muted"> · ${plural(x.prints, 'Druck', 'Drucke')}, ${fmtNum(x.kwh, 2)} kWh</span></button>
        <span class="num">${fmtEur(x.amount)}</span>
        <span></span>
        <button type="button" class="icon-btn" data-power="delete" data-id="${esc(x.id)}" aria-label="Abrechnung löschen">×</button>
      </div>`).join('')}</div>` : ''}`;
}

function onPowerChange(e) {
  if (e.target.dataset.power !== 'since') return;
  powerSince = e.target.value;
  updatePower();
}

function onPowerClick(e) {
  const b = e.target.closest('[data-power]');
  if (!b || b.dataset.power === 'since') return;
  const { settings } = ctx.app;
  const action = b.dataset.power;
  if (action === 'show') openPowerStatement(currentPower(), settings);
  if (action === 'pay') {
    const p = currentPower();
    openDialog({
      title: 'Strom abrechnen',
      body: `<p>${esc(fmtEur(p.amount))} für ${plural(p.prints, 'Druck', 'Drucke')} vom ${dateDe(p.from)} bis heute als an ${esc(settings.powerPayee)} gegeben speichern?</p>
        <p class="small muted">Die nächste Abrechnung beginnt dann jetzt. Die Abrechnung kannst du vorher mit „Abrechnung ansehen“ drucken.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Speichern</button>',
      async onSubmit() {
        const res = await ctx.app.backend.addPowerPayment({
          date: today(), from: p.from, to: p.to, prints: p.prints, hours: p.hours, kwh: p.kwh, amount: p.amount,
          energyPrice: p.energyPrice, printerWatts: p.printerWatts, rows: p.rows,
        });
        payments = res.payments;
        powerSince = '';
        updatePower();
        toast(`Abrechnung für ${settings.powerPayee} gespeichert`);
      },
    });
  }
  const paid = payments.find((x) => x.id === b.dataset.id);
  if (!paid) return;
  if (action === 'view') openPowerStatement(paid, settings, paid);
  if (action === 'delete') {
    openDialog({
      title: 'Abrechnung löschen?',
      body: `<p>Die Abrechnung vom ${dateDe(paid.date)} über ${fmtEur(paid.amount)} wird gelöscht. Die Drucke zählen dann wieder als offen.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn danger solid">Löschen</button>',
      async onSubmit() {
        payments = (await ctx.app.backend.deletePowerPayment(paid.id)).payments;
        updatePower();
        toast('Abrechnung gelöscht');
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Druckverlauf

function quoteFor(task) {
  return jobQuote(task, ctx.app.spools, ctx.app.settings);
}

function taskCard(t) {
  const [dot, label] = STATUS[t.status] || ['', t.status === 0 ? 'unbekannt' : `Status ${t.status}`];
  const q = quoteFor(t);
  const date = t.startTime ? new Date(t.startTime).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const colors = q.parts.filter((p) => p.color).map((p) => `<span class="fil" title="${esc(p.type)}${p.slot ? ' · ' + esc(p.slot) : ''}">
      <span class="dot-color" style="background:${esc(p.color)}"></span>${fmtNum(p.grams)} g${p.spool ? ` <span class="muted">#${p.spool.nr}</span>` : ''}</span>`).join('');
  return `<article class="task" data-id="${esc(t.id)}">
    ${t.cover ? `<img class="task-cover" src="${esc(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="task-cover"></div>'}
    <div class="task-body">
      <div class="task-title"><strong>${esc(t.title)}</strong>${t.plate > 1 ? `<span class="muted small"> Platte ${t.plate}</span>` : ''}</div>
      <div class="status-line"><span><span class="dot ${dot}"></span>${esc(label)}</span><span>${esc(date)}</span>${t.deviceName ? `<span>${esc(t.deviceName)}</span>` : ''}
        <span class="num">${fmtNum(t.grams)} g</span>${t.seconds ? `<span class="num">${fmtDuration(t.seconds)}</span>` : ''}</div>
      ${colors ? `<div class="fils">${colors}</div>` : ''}
    </div>
    <div class="task-side">
      <span class="small muted">Preis</span><strong class="num">${fmtEur(q.piece)}</strong><span class="small muted">Kosten ${fmtEur(q.cost)}</span>
    </div>
    <div class="actions task-actions">
      <button class="btn small primary" type="button" data-task="add">Zum Beleg</button>
      <button class="btn small" type="button" data-task="calc">Im Rechner</button>
      <button class="btn small" type="button" data-task="reprint">Erneut drucken</button>
    </div>
  </article>`;
}

function updateHistory() {
  const el = ctx.root.querySelector('#history');
  const s = ctx.app.settings;
  const head = `<div class="panel-head"><h2>Druckverlauf von Bambu</h2>
    ${ctx.app.backend.mode === 'server' && history.connected ? `<span class="actions"><span class="small muted">Stand: ${esc(timeAgo(history.lastSync))}</span><button class="btn small" type="button" data-history="refresh">Aktualisieren</button></span>` : ''}</div>`;
  if (ctx.app.backend.mode !== 'server') {
    el.innerHTML = `${head}<p class="muted">Der Druckverlauf braucht den Lager-Server und eine Bambu-Anmeldung.</p>`;
    return;
  }
  if (!history.connected) {
    el.innerHTML = `${head}<p class="muted">Unter „Bambu“ anmelden, dann erscheinen hier deine Drucke mit Gramm, Druckzeit und Kosten.</p>
      <div class="actions"><button class="btn" type="button" data-history="login">Zur Bambu-Anmeldung</button></div>`;
    return;
  }
  el.innerHTML = `${head}
    <p class="small muted">Preis = Filament (Kaufpreis der passenden Rolle je Farbe), Strom, Drucker ${fmtEur(s.machineRate)} pro Stunde, ${fmtNum(s.failPct, 0)} % für Fehldrucke, ${fmtNum(s.laborMinutes, 0)} Min. Arbeit, dazu ${fmtNum(s.profitPct, 0)} % Gewinn. Das Filament zieht der Abgleich mit Bambu im Lager ab, sofern die Rollen dort verknüpft sind.</p>
    ${history.tasks.length ? `<div class="tasks">${history.tasks.map(taskCard).join('')}</div>` : '<p class="muted">Noch keine Drucke gefunden. „Aktualisieren“ holt den Verlauf von Bambu.</p>'}`;
}

async function onHistoryClick(e) {
  const h = e.target.closest('[data-history]');
  if (h && h.dataset.history === 'login') ctx.go('bambu');
  if (h && h.dataset.history === 'refresh') {
    h.disabled = true;
    try {
      history = await ctx.app.backend.refreshTasks();
      updateHistory();
      updatePower();
      toast('Druckverlauf aktualisiert');
    } catch (err) {
      toast(err.message, 'error');
      h.disabled = false;
    }
    return;
  }
  const b = e.target.closest('[data-task]');
  if (!b) return;
  const task = history.tasks.find((t) => t.id === b.closest('.task').dataset.id);
  if (b.dataset.task === 'calc') {
    openJob(task, ctx.app.spools);
    ctx.go('rechner');
  }
  if (b.dataset.task === 'add') {
    const q = quoteFor(task);
    const main = q.parts.filter((p) => p.spool).sort((a, c) => c.grams - a.grams)[0];
    const draft = addPosition({
      title: task.title, qty: 1, grams: q.grams, seconds: q.seconds, perGram: q.perGram, spool: main ? main.spool : null, taskId: task.id,
    });
    updateDraft();
    toast(`„${task.title}“ zum Beleg hinzugefügt (${plural(draft.positions.length, 'Position', 'Positionen')})`);
    ctx.root.querySelector('#draft').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (b.dataset.task === 'reprint') reprintDialog(task);
}

// Bambu lässt Druckstarts nur aus den eigenen Apps zu, deshalb hier nur der Weg dorthin.
function reprintDialog(task) {
  const link = task.designId ? `https://makerworld.com/de/models/${task.designId}` : '';
  openDialog({
    title: 'Erneut drucken',
    body: `<p>Einen Druck starten dürfen nur die Bambu-Apps selbst, andere Programme sperrt Bambu dafür.</p>
      <ol class="steps">
        <li>In <strong>Bambu Handy</strong> den Druckverlauf öffnen (über dein Profil).</li>
        <li>„${esc(task.title)}“ suchen und erneut drucken.</li>
      </ol>
      ${link ? `<p>Das Modell ist von MakerWorld: <a href="${esc(link)}" target="_blank" rel="noopener">auf MakerWorld öffnen</a></p>` : ''}
      <p class="small muted">Danach hier „Zum Beleg“ tippen; der Preis ist schon berechnet.</p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Schließen</button>',
  });
}
