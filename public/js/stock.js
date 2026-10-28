// Vorrat: Teile, die auf Vorrat gedruckt und einzeln verkauft werden
// (z. B. 25 Kürbisse auf einer Platte). Dialoge zum Anlegen, Verkaufen und
// Ändern; die Liste steht im Reiter "Drucke".
import {
  customerText, stockFromQuote, stockSaleItem, weightPatch,
} from './domain.js';
import { openReceipt } from './documents.js';
import { addPosition } from './sales.js';
import {
  combobox, esc, fmt, fmtEur, fmtNum, openDialog, toast,
} from './ui.js';

const num = (v) => Number(String(v).replace(/\s|€/g, '').replace(',', '.'));
const dec = (v) => esc(v.toFixed(2).replace('.', ','));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function costText(q) {
  return [['Filament', q.filament], ['Strom', q.energy], ['Drucker', q.machine], ['Fehldrucke', q.failure], ['Arbeit', q.labor]]
    .filter(([, v]) => v).map(([l, v]) => `${l} ${fmtEur(v)}`).join(' + ');
}

// Druck auf Vorrat legen. quoteFor(n) liefert die Preisrechnung für n Teile;
// spool: Rolle für Farbe und zum Abziehen des Filaments (nur im Rechner).
export function addStockDialog(app, {
  title, qty = 1, quoteFor, spool = null, canBook = false, perPlate = false, onDone,
}) {
  openDialog({
    title: 'Auf Vorrat legen',
    body: `<p class="small muted">Für Teile, die du auf Vorrat druckst und einzeln verkaufst. Die Arbeit verteilt sich auf alle Teile, der Verkaufspreis steht fest.</p>
      <div class="fields">
        <label class="field full"><span>Bezeichnung</span><input name="title" value="${esc(title)}" required></label>
        <label class="field"><span>${perPlate ? 'Teile auf der Platte' : 'Anzahl gedruckt'}</span><input name="qty" type="number" min="1" step="1" inputmode="numeric" value="${qty}"></label>
        <label class="field"><span>Verkaufspreis pro Stück (€)</span><input name="price" inputmode="decimal"></label>
      </div>
      <div class="note" data-cost></div>
      ${canBook && spool ? `<label class="switch"><input type="checkbox" name="book"><span data-book></span></label>` : ''}`,
    foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Auf Vorrat legen</button>',
    onReady(dlg, form) {
      const f = form.elements;
      const update = () => {
        const n = Math.max(1, Math.round(num(f.qty.value)) || 1);
        const q = quoteFor(n);
        f.price.placeholder = q.piece.toFixed(2).replace('.', ',');
        const price = f.price.value.trim() ? num(f.price.value) : q.piece;
        const profit = Number.isFinite(price) ? price - q.cost : 0;
        dlg.querySelector('[data-cost]').innerHTML = `Selbstkosten pro Stück <strong>${fmtEur(q.cost)}</strong>
          <span class="small muted">(${esc(costText(q))})</span><br>
          Berechneter Preis ${fmtEur(q.piece)}, Gewinn pro Stück <strong class="${profit < 0 ? 'neg' : ''}">${fmtEur(profit)}</strong>, bei ${n} Stück ${fmtEur(profit * n)}`;
        const book = dlg.querySelector('[data-book]');
        if (book) book.textContent = `${fmtNum(q.grams * n)} g von Rolle #${spool.nr} abziehen (nur wenn Bambu das nicht schon tut)`;
      };
      f.qty.addEventListener('input', update);
      f.price.addEventListener('input', update);
      update();
    },
    async onSubmit(form) {
      const f = form.elements;
      const n = Math.max(1, Math.round(num(f.qty.value)) || 1);
      const q = quoteFor(n);
      const price = f.price.value.trim() ? num(f.price.value) : q.piece;
      if (!f.title.value.trim()) throw new Error('Bitte eine Bezeichnung eingeben.');
      if (!Number.isFinite(price) || price < 0) throw new Error('Bitte einen Verkaufspreis in Euro eingeben, z. B. 3,50.');
      const res = await app.backend.addStock({ ...stockFromQuote({ title: f.title.value.trim(), quote: q, spool, price }) });
      if (f.book && f.book.checked) {
        const updated = await app.backend.updateSpool(spool.id, weightPatch(spool, app.settings, { used: q.grams * n }));
        app.spools = app.spools.map((s) => (s.id === updated.id ? updated : s));
      }
      toast(res.merged ? `${n} × ${res.item.title} zum Vorrat dazu, jetzt ${res.item.onHand} Stück` : `${n} × ${res.item.title} auf Vorrat gelegt`);
      if (onDone) onDone(res);
    },
  });
}

// Verkaufen: gleich als Beleg speichern oder in den offenen Beleg legen.
// customers: Kundenliste zur Auswahl; ein neuer Name wird als Kunde gespeichert.
// onGift({ qty, name }): stattdessen verschenken (Probe)
export function sellDialog(app, item, {
  onSold, onDraft, onGift, customers = [],
} = {}) {
  openDialog({
    title: `${esc(item.title)} verkaufen`,
    body: `<p class="small muted">Noch ${item.onHand} Stück im Vorrat. Selbstkosten ${fmtEur(item.parts.cost)} pro Stück.</p>
      <div class="fields">
        <label class="field"><span>Anzahl</span><input name="qty" type="number" min="1" max="${item.onHand}" step="1" inputmode="numeric" value="1"></label>
        <label class="field"><span>Preis pro Stück (€)</span><input name="price" inputmode="decimal" value="${dec(item.price)}"></label>
        <label class="field"><span>Datum</span><input name="date" type="date" value="${today()}"></label>
        <label class="field"><span>Kunde (optional)</span><input name="customer" placeholder="Name suchen oder neu"></label>
      </div>
      <label class="switch"><input type="checkbox" name="show"><span>Beleg gleich zum Drucken öffnen</span></label>
      <p class="small muted" data-sum></p>`,
    foot: `<button type="button" class="btn" data-draft>In den offenen Beleg</button>${onGift ? '<button type="button" class="btn" data-gift>Verschenken</button>' : ''}<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Verkauft</button>`,
    onReady(dlg, form) {
      const f = form.elements;
      const update = () => {
        const n = Math.max(1, Math.round(num(f.qty.value)) || 1);
        const price = num(f.price.value);
        dlg.querySelector('[data-sum]').textContent = Number.isFinite(price)
          ? `Zusammen ${fmtEur(price * n)}, Gewinn ${fmtEur((price - item.parts.cost) * n)}.` : '';
      };
      f.qty.addEventListener('input', update);
      f.price.addEventListener('input', update);
      update();
      combobox(f.customer, {
        options: () => customers.map((c) => ({ value: c.name, hint: c.address.split('\n').pop() })),
        newLabel: (v) => `„${v}“ als neuen Kunden`,
      });
      dlg.querySelector('[data-gift]')?.addEventListener('click', () => {
        const n = Math.max(1, Math.round(num(f.qty.value)) || 1);
        if (n > item.onHand) {
          toast(`Es sind nur noch ${item.onHand} Stück im Vorrat.`, 'error');
          return;
        }
        dlg.close();
        onGift({ qty: n, name: f.customer.value.trim() });
      });
      dlg.querySelector('[data-draft]').addEventListener('click', () => {
        const n = Math.max(1, Math.round(num(f.qty.value)) || 1);
        addPosition({ stockItem: { ...item, price: Number.isFinite(num(f.price.value)) ? num(f.price.value) : item.price }, qty: n });
        dlg.close();
        toast(`${n} × ${item.title} im offenen Beleg`);
        if (onDraft) onDraft();
      });
    },
    async onSubmit(form) {
      const f = form.elements;
      const n = Math.max(1, Math.round(num(f.qty.value)) || 1);
      const price = num(f.price.value);
      if (!Number.isFinite(price) || price < 0) throw new Error('Bitte einen Preis in Euro eingeben, z. B. 3,50.');
      if (n > item.onHand) throw new Error(`Es sind nur noch ${item.onHand} Stück im Vorrat.`);
      const name = f.customer.value.trim();
      let c = name && customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (name && !c) c = (await app.backend.addCustomer({ name })).item;
      const res = await app.backend.addSale({
        date: f.date.value || today(),
        customer: c ? customerText(c) : '',
        customerId: c ? c.id : '',
        items: [stockSaleItem(item, n, price)],
        minExtra: 0,
        rates: {
          energyPrice: app.settings.energyPrice, printerWatts: app.settings.printerWatts, machineRate: app.settings.machineRate, failPct: app.settings.failPct,
        },
      });
      toast(`Verkauft: ${n} × ${item.title}, Beleg ${res.sale.nr}`);
      if (f.show.checked) openReceipt(res.sale, app.settings);
      if (onSold) onSold(res);
    },
  });
}

// Name, Preis und Bestand ändern (z. B. eins kaputt), oder aus dem Vorrat löschen.
export function editStockDialog(app, item, { onDone } = {}) {
  openDialog({
    title: `${esc(item.title)} im Vorrat`,
    body: `<div class="fields">
        <label class="field full"><span>Bezeichnung</span><input name="title" value="${esc(item.title)}" required></label>
        <label class="field"><span>Verkaufspreis pro Stück (€)</span><input name="price" inputmode="decimal" value="${dec(item.price)}"></label>
        <label class="field"><span>Noch da (Stück)</span><input name="onHand" type="number" min="0" step="1" inputmode="numeric" value="${item.onHand}"></label>
      </div>
      <p class="small muted">Gedruckt ${item.made}, verkauft ${item.sold}${item.given ? `, verschenkt ${item.given}` : ''}${item.made - item.sold - (item.given || 0) - item.onHand > 0 ? `, ${item.made - item.sold - (item.given || 0) - item.onHand} kaputt oder weg` : ''}.
        Selbstkosten ${fmtEur(item.parts.cost)} pro Stück, ${fmt(item.grams)} g Filament.</p>`,
    foot: '<button type="button" class="btn danger" data-del>Aus dem Vorrat löschen</button><span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>',
    onReady(dlg) {
      dlg.querySelector('[data-del]').addEventListener('click', async () => {
        try {
          const res = await app.backend.deleteStock(item.id);
          dlg.close();
          toast(`${item.title} aus dem Vorrat gelöscht. Belege bleiben erhalten.`);
          if (onDone) onDone(res);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
    async onSubmit(form) {
      const f = form.elements;
      const price = num(f.price.value);
      if (!Number.isFinite(price) || price < 0) throw new Error('Bitte einen Preis in Euro eingeben.');
      const res = await app.backend.updateStock(item.id, {
        title: f.title.value.trim() || item.title, price, onHand: Math.max(0, Math.round(num(f.onHand.value)) || 0),
      });
      toast('Vorrat gespeichert');
      if (onDone) onDone(res);
    },
  });
}
