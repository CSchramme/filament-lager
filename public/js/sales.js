// Dialog "Verkauf eintragen", genutzt vom Rechner und vom Druckverlauf.
import { normalizeSale } from './domain.js';
import {
  esc, fmtEur, openDialog, toast,
} from './ui.js';

const money = (v) => String(v.toFixed(2)).replace('.', ',');
const num = (v) => Number(String(v).replace(/\s|€/g, '').replace(',', '.')) || 0;

// prefill: { title, qty, unitPrice, unitCost, grams, spoolNr, taskId }
export function saleDialog(app, prefill, onSaved) {
  const qty0 = Math.max(1, prefill.qty || 1);
  const unitPrice = prefill.unitPrice || 0;
  const unitCost = prefill.unitCost || 0;
  const today = new Date().toISOString().slice(0, 10);
  openDialog({
    title: 'Verkauf eintragen',
    body: `<div class="fields">
        <label class="field full"><span>Was</span><input name="title" value="${esc(prefill.title || '')}" required></label>
        <label class="field"><span>Anzahl</span><input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${qty0}"></label>
        <label class="field"><span>Datum</span><input name="date" type="date" value="${today}"></label>
        <label class="field"><span>Verkaufspreis gesamt (€)</span><input name="price" inputmode="decimal" value="${money(unitPrice * qty0)}"></label>
        <label class="field"><span>Kosten gesamt (€)</span><input name="cost" inputmode="decimal" value="${money(unitCost * qty0)}"></label>
        <label class="field full"><span>Kunde (optional)</span><input name="customer" autocomplete="off"></label>
        <label class="field full"><span>Notiz (optional)</span><input name="note" autocomplete="off"></label>
      </div>
      <div class="note" data-profit></div>`,
    foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Verkauf speichern</button>',
    onReady(dlg, form) {
      const f = form.elements;
      const touched = { price: false, cost: false };
      const show = () => {
        const profit = num(f.price.value) - num(f.cost.value);
        dlg.querySelector('[data-profit]').textContent = `Gewinn: ${fmtEur(profit)}`;
      };
      f.price.addEventListener('input', () => { touched.price = true; show(); });
      f.cost.addEventListener('input', () => { touched.cost = true; show(); });
      // Solange die Beträge nicht von Hand geändert wurden, wachsen sie mit der Anzahl.
      f.qty.addEventListener('input', () => {
        const q = Math.max(1, Math.round(num(f.qty.value)) || 1);
        if (!touched.price) f.price.value = money(unitPrice * q);
        if (!touched.cost) f.cost.value = money(unitCost * q);
        show();
      });
      show();
    },
    async onSubmit(form) {
      const f = form.elements;
      if (!f.title.value.trim()) throw new Error('Bitte angeben, was verkauft wurde.');
      const sale = normalizeSale({
        title: f.title.value,
        qty: f.qty.value,
        date: f.date.value || today,
        price: f.price.value,
        cost: f.cost.value,
        customer: f.customer.value,
        note: f.note.value,
        grams: (prefill.grams || 0) * (Math.max(1, Math.round(num(f.qty.value)) || 1) / qty0),
        spoolNr: prefill.spoolNr,
        taskId: prefill.taskId,
      });
      const res = await app.backend.addSale(sale);
      toast(`Verkauf gespeichert: ${fmtEur(res.sale.price)}`);
      if (onSaved) onSaved(res);
    },
  });
}
