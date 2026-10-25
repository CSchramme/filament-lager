// Einkaufsliste: was nachgekauft werden muss, mit dem zuletzt bezahlten Preis.
// Kopieren (z. B. in eine Notiz oder an jemanden schicken) oder drucken.
import { shoppingList } from './domain.js';
import { openDocument } from './documents.js';
import {
  esc, fmt, fmtEur, openDialog, toast,
} from './ui.js';

const sortName = (i) => [i.material, i.colorName || i.colorHex].filter(Boolean).join(' ');
const rolls = (list) => list.map((s) => `#${s.nr} ${s.level === 'leer' ? 'leer' : `${fmt(s.netWeight)} g`}`).join(', ');
const kg = (g) => (g >= 1000 ? `${String(g / 1000).replace('.', ',')} kg` : `${fmt(g)} g`);

function priceText(i) {
  if (!i.price) return 'Preis unbekannt';
  const from = i.priceFrom === 'sorte' ? `zuletzt bei #${i.price.nr}` : `${i.material} zuletzt bei #${i.price.nr}`;
  return `${fmtEur(i.price.perKg)} pro kg, ${from}`;
}

export function shoppingText(list) {
  const lines = ['Filament nachkaufen:'];
  for (const i of list.buy) {
    lines.push(`- ${sortName(i)}${i.brand ? ` (${i.brand})` : ''}, ${kg(i.weight)}${i.estimate !== null ? `, ca. ${fmtEur(i.estimate)}` : ''}`);
  }
  if (list.total) lines.push(`Zusammen ca. ${fmtEur(list.total)}${list.unknown ? ` plus ${list.unknown} ohne bekannten Preis` : ''}`);
  return lines.join('\n');
}

function row(i) {
  return `<div class="shop-row">
    <span class="dot-color" style="background:${esc(i.colorHex)}"></span>
    <span class="shop-name"><span><strong>${esc(sortName(i))}</strong>${i.brand ? ` <span class="muted">· ${esc(i.brand)}</span>` : ''}</span>
      <span class="small muted">${i.buy ? `Rest: ${esc(rolls(i.low))}` : `${esc(rolls(i.low))} knapp, Ersatz: ${esc(rolls(i.spare))}`}</span></span>
    <span class="shop-price"><span class="num">${i.buy ? `${kg(i.weight)}${i.estimate !== null ? ` · ${fmtEur(i.estimate)}` : ''}` : ''}</span>
      <span class="small muted">${esc(priceText(i))}</span></span>
  </div>`;
}

export function openShoppingList(app) {
  const list = shoppingList(app.spools, app.settings);
  const body = !list.items.length
    ? '<p>Keine Rolle ist knapp. Nichts nachzukaufen.</p>'
    : `${list.buy.length ? `<h3>Nachkaufen</h3><div class="shop-list">${list.buy.map(row).join('')}</div>
        <p class="shop-total">${list.total ? `Zusammen ca. <strong>${fmtEur(list.total)}</strong>${list.unknown ? ` <span class="small muted">plus ${list.unknown} ohne bekannten Preis</span>` : ''}`
    : '<span class="small muted">Ohne Kaufpreise keine Schätzung. Trag beim Bearbeiten einer Rolle ein, was sie gekostet hat.</span>'}</p>` : '<p>Für alle knappen Rollen liegt schon Ersatz im Lager.</p>'}
      ${list.spare.length ? `<h3>Knapp, aber Ersatz im Lager</h3><div class="shop-list">${list.spare.map(row).join('')}</div>` : ''}
      <p class="small muted">Knapp heißt: weniger als 1/${app.settings.lowStockPart} der Rolle übrig. Der Preis stammt vom Kaufpreis der Rollen im Lager.</p>`;
  openDialog({
    title: 'Einkaufsliste',
    body,
    foot: list.buy.length
      ? '<button type="button" class="btn" data-shop="print">Drucken</button><span class="spacer"></span><button type="button" class="btn" data-close>Schließen</button><button type="button" class="btn primary" data-shop="copy">Liste kopieren</button>'
      : '<span class="spacer"></span><button type="button" class="btn" data-close>Schließen</button>',
    onReady(dlg) {
      dlg.querySelector('[data-shop="copy"]')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(shoppingText(list));
          toast('Einkaufsliste kopiert');
        } catch {
          toast('Kopieren nicht möglich. Bitte „Drucken“ nutzen.', 'error');
        }
      });
      dlg.querySelector('[data-shop="print"]')?.addEventListener('click', () => {
        openDocument('Einkaufsliste', `<h1>Einkaufsliste Filament</h1><p class="sub">${new Date().toLocaleDateString('de-DE')}</p>
          <table><thead><tr><th></th><th>Sorte</th><th>Menge</th><th class="r">ca. Preis</th></tr></thead><tbody>
          ${list.buy.map((i) => `<tr><td>☐</td><td><span class="swatch" style="background:${esc(i.colorHex)}"></span><strong>${esc(sortName(i))}</strong>${i.brand ? ` · ${esc(i.brand)}` : ''}<div class="sub">${esc(priceText(i))}</div></td>
            <td>${kg(i.weight)}</td><td class="r">${i.estimate !== null ? fmtEur(i.estimate) : '–'}</td></tr>`).join('')}
          ${list.total ? `<tr class="total"><td></td><td>Zusammen ca.</td><td></td><td class="r">${fmtEur(list.total)}</td></tr>` : ''}</tbody></table>`);
      });
    },
  });
}
