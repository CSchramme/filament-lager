// Druckbare Dokumente: Beleg (mit Aufteilung des Preises pro Teil) und
// Stromabrechnung. Sie öffnen sich in einem neuen Fenster; dort "Drucken"
// wählen oder im Druckdialog "Als PDF sichern".
import {
  esc, fmtCt, fmtDuration, fmtEur, fmtNum, toast,
} from './ui.js';

const STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.45 'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', sans-serif; color: #15212B; background: #EEF1F4; }
  .page { max-width: 210mm; margin: 24px auto; padding: 18mm 16mm; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .bar { display: flex; gap: 8px; justify-content: center; padding: 16px; }
  .bar button { font: inherit; font-weight: 700; padding: 8px 16px; border-radius: 6px; border: 1px solid #CFD7DF; background: #fff; cursor: pointer; }
  .bar button.primary { background: #0B6B73; border-color: #0B6B73; color: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
  .meta { text-align: right; }
  .addr { white-space: pre-line; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6F7D89; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6F7D89; border-bottom: 2px solid #15212B; padding: 6px 4px; }
  td { padding: 8px 4px; vertical-align: top; border-bottom: 1px solid #DDE3E8; }
  .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub { color: #6F7D89; font-size: 12px; }
  .split td { border-bottom: 0; padding: 1px 4px; font-size: 12px; color: #44535F; }
  .split.first td { padding-top: 6px; }
  .split.last td { padding-bottom: 10px; border-bottom: 1px solid #DDE3E8; }
  .split .sum td { font-weight: 700; color: #15212B; }
  .total td { border-bottom: 0; border-top: 2px solid #15212B; font-weight: 700; font-size: 16px; padding-top: 10px; }
  .foot { margin-top: 28px; font-size: 12px; color: #44535F; display: grid; gap: 6px; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #CFD7DF; vertical-align: middle; margin-right: 4px; }
  .sign { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; font-size: 12px; color: #44535F; }
  .sign div { border-top: 1px solid #15212B; padding-top: 4px; }
  @media print {
    body { background: #fff; }
    .bar { display: none; }
    .page { margin: 0; box-shadow: none; max-width: none; padding: 0; }
    @page { size: A4; margin: 16mm; }
  }`;

export function openDocument(title, body) {
  const w = window.open('', '_blank');
  if (!w) {
    toast('Das Fenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.', 'error');
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title><style>${STYLE}</style></head><body>
    <div class="bar"><button class="primary" onclick="window.print()">Drucken oder als PDF speichern</button><button onclick="window.close()">Schließen</button></div>
    <div class="page">${body}</div></body></html>`);
  w.document.close();
}

const date = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '');

// Posten pro Teil für die Aufteilung unter einer Position.
function splitRows(item, rates) {
  const b = item.breakdown;
  if (!b) return '';
  const h = item.seconds / 3600;
  const rows = [
    ['Filament', `${fmtNum(item.grams)} g`, b.filament],
    ['Strom', h ? `${fmtNum(h, 2)} Std. × ${fmtNum(rates.printerWatts, 0)} W × ${fmtCt(rates.energyPrice)} ct/kWh` : '', b.energy],
    ['Drucker (Abnutzung)', h ? `${fmtNum(h, 2)} Std. × ${fmtEur(rates.machineRate)}` : '', b.machine],
    ['Fehldrucke', `${fmtNum(rates.failPct, 0)} % auf Filament und Strom`, b.failure],
    ['Arbeit', item.qty > 1 ? 'anteilig pro Teil' : '', b.labor],
  ];
  const line = (label, note, v, cls = '') => `<tr class="split ${cls}"><td></td><td>${label}${note ? ` <span class="sub">${esc(note)}</span>` : ''}</td><td class="r"></td><td class="r">${fmtEur(v)}</td><td class="r">${fmtEur(v * item.qty)}</td></tr>`;
  return rows.map(([l, n, v], i) => line(l, n, v, i === 0 ? 'first' : '')).join('')
    + `<tr class="split"><td></td><td><em>Selbstkosten</em></td><td></td><td class="r">${fmtEur(b.cost)}</td><td class="r">${fmtEur(b.cost * item.qty)}</td></tr>`
    + `<tr class="split"><td></td><td>Gewinn</td><td></td><td class="r">${fmtEur(b.profit)}</td><td class="r">${fmtEur(b.profit * item.qty)}</td></tr>`
    + `<tr class="split last sum"><td></td><td>Preis pro Teil</td><td></td><td class="r">${fmtEur(b.piece)}</td><td class="r">${fmtEur(b.piece * item.qty)}</td></tr>`;
}

// sale: Beleg oder Angebot (offer = true: mit "gültig bis", ohne Dank)
export function openReceipt(sale, settings, { offer = false } = {}) {
  const rates = sale.rates || settings;
  const kind = offer ? 'Angebot' : 'Beleg';
  const items = sale.items.map((item, i) => {
    const desc = [
      item.material || item.colorName ? `${item.colorHex ? `<span class="swatch" style="background:${esc(item.colorHex)}"></span>` : ''}${esc([item.material, item.colorName].filter(Boolean).join(' '))}${item.spoolNr ? ` (Rolle #${item.spoolNr})` : ''}` : '',
      item.grams ? `${fmtNum(item.grams)} g pro Teil` : '',
      item.seconds ? `${fmtDuration(item.seconds)} Druckzeit pro Teil` : '',
    ].filter(Boolean).join(' · ');
    const piece = item.breakdown ? item.breakdown.piece : item.price / item.qty;
    return `<tr><td>${i + 1}</td><td><strong>${esc(item.title)}</strong>${desc ? `<div class="sub">${desc}</div>` : ''}</td>
      <td class="r">${item.qty}</td><td class="r">${fmtEur(piece)}</td><td class="r">${fmtEur(item.price)}</td></tr>${splitRows(item, rates)}`;
  }).join('');
  const body = `
    <div class="head">
      <div>${settings.sellerName ? `<div class="label">Von</div><strong>${esc(settings.sellerName)}</strong><div class="addr">${esc(settings.sellerAddress)}</div>` : ''}
        ${sale.customer ? `<div class="label" style="margin-top:16px">An</div><div class="addr">${esc(sale.customer)}</div>` : ''}</div>
      <div class="meta"><h1>${kind}</h1><div>Nr. ${esc(sale.nr || '–')}</div><div>Datum ${date(sale.date)}</div>
        ${offer ? `<div>Gültig bis ${date(sale.validUntil)}</div>` : ''}${!offer && sale.fromOffer ? `<div>Zu Angebot ${esc(sale.fromOffer)}</div>` : ''}</div>
    </div>
    <table>
      <thead><tr><th>Pos.</th><th>Artikel</th><th class="r">Menge</th><th class="r">pro Teil</th><th class="r">Gesamt</th></tr></thead>
      <tbody>${items}
        ${sale.minExtra ? `<tr><td></td><td>Aufschlag auf den Mindestpreis von ${fmtEur(sale.price)}</td><td></td><td></td><td class="r">${fmtEur(sale.minExtra)}</td></tr>` : ''}
        <tr class="total"><td></td><td>Summe</td><td class="r">${sale.qty}</td><td></td><td class="r">${fmtEur(sale.price)}</td></tr>
      </tbody>
    </table>
    <div class="foot">
      ${settings.smallBusiness ? '<div>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</div>' : ''}
      ${sale.note ? `<div>${esc(sale.note)}</div>` : ''}
      <div>${offer ? `Das Angebot gilt bis ${date(sale.validUntil)}. Ich freue mich auf den Auftrag.` : 'Vielen Dank!'}</div>
    </div>`;
  openDocument(`${kind} ${sale.nr || ''}`, body);
}

// power: Ergebnis von openPower() oder eine gespeicherte Abrechnung;
// paid: gespeicherte Abrechnung oder null
export function openPowerStatement(power, settings, paid = null) {
  const watts = power.printerWatts || settings.printerWatts;
  const price = power.energyPrice || settings.energyPrice;
  const rows = power.rows.map((r) => `<tr><td>${date(r.date)}</td><td>${esc(r.title)}${r.status === 3 ? ' <span class="sub">abgebrochen</span>' : ''}</td><td class="r">${fmtDuration(r.seconds)}</td>
    <td class="r">${fmtNum(r.kwh, 2)} kWh</td><td class="r">${fmtEur(r.amount)}</td></tr>`).join('');
  const body = `
    <div class="head">
      <div><div class="label">Für</div><strong>${esc(settings.powerPayee)}</strong>
        ${settings.sellerName ? `<div class="label" style="margin-top:16px">Von</div><div>${esc(settings.sellerName)}</div>` : ''}</div>
      <div class="meta"><h1>Stromabrechnung</h1><div>${date(power.from)} bis ${date(power.to)}</div>${paid ? `<div>Abgerechnet am ${date(paid.date)}</div>` : ''}</div>
    </div>
    <p>Strom für den 3D-Drucker: ${power.prints} ${power.prints === 1 ? 'Druck' : 'Drucke'}, zusammen ${fmtNum(power.hours, 1)} Stunden.
      Gerechnet mit ${fmtNum(watts, 0)} W beim Drucken und ${fmtCt(price)} ct pro kWh.</p>
    <table>
      <thead><tr><th>Datum</th><th>Druck</th><th class="r">Dauer</th><th class="r">Strom</th><th class="r">Betrag</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Keine Drucke in diesem Zeitraum.</td></tr>'}
        <tr class="total"><td></td><td>Summe</td><td class="r">${fmtNum(power.hours, 1)} Std.</td><td class="r">${fmtNum(power.kwh, 2)} kWh</td><td class="r">${fmtEur(power.amount)}</td></tr>
      </tbody>
    </table>
    <div class="sign"><div>Datum, bezahlt${settings.sellerName ? ` von ${esc(settings.sellerName)}` : ''}</div><div>Datum, erhalten von ${esc(settings.powerPayee)}</div></div>`;
  openDocument('Stromabrechnung', body);
}
