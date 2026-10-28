// Etiketten zum Aufkleben auf die Spulen: QR-Code, Rollennummer, Farbe,
// Material und Leergewicht der Spule. Der QR-Code öffnet die Rolle in der App
// direkt zum Wiegen (#rolle/12). Gedruckt wird über ein eigenes Fenster.
import { spoolTypeOf } from './domain.js';
import { qrSvg } from './qr.js';
import {
  DOC_SCRIPT, esc, fmt, showDocument, toast,
} from './ui.js';

// Breite, Höhe, QR-Größe in mm
const FORMATS = {
  e50: { name: 'Etikett 50 × 30 mm', w: 50, h: 30, qr: 26 },
  e40: { name: 'Etikett 40 × 30 mm', w: 40, h: 30, qr: 20 },
  e62: { name: 'Etikett 62 × 29 mm (Brother)', w: 62, h: 29, qr: 25 },
  a4: { name: 'A4-Bogen 3 × 8 (70 × 37 mm)', w: 70, h: 37, qr: 31, sheet: true },
};

export function spoolLink(spool, base = location.origin + location.pathname) {
  return `${base}#rolle/${spool.nr}`;
}

function label(spool, settings) {
  const type = spoolTypeOf(spool, settings);
  const kg = spool.purchaseWeight >= 1000 ? `${String(spool.purchaseWeight / 1000).replace('.', ',')} kg` : `${fmt(spool.purchaseWeight)} g`;
  return `<div class="label">
    <div class="qr">${qrSvg(spoolLink(spool), { level: 'M', border: 1, title: `Rolle ${spool.nr}` })}</div>
    <div class="txt">
      <div class="nr">#${spool.nr}</div>
      <div class="name"><span class="dot" style="background:${esc(spool.colorHex)}"></span>${esc(spool.colorName || spool.colorHex)}</div>
      <div class="mat">${esc(spool.material)}${spool.brand ? `<span class="brand"> · ${esc(spool.brand)}</span>` : ''}</div>
      <div class="tare">${esc(kg)}${type.tare ? ` · Spule ${fmt(type.tare)} g` : ''}</div>
    </div>
  </div>`;
}

const pageCss = (f) => (f.sheet
  ? '@page { size: A4; margin: 0; }'
  : `@page { size: ${f.w}mm ${f.h}mm; margin: 0; }`);

export function openLabels(spools, settings) {
  const list = spools.filter((s) => s.nr);
  if (!list.length) {
    toast('Keine Rollen ausgewählt.', 'error');
    return;
  }
  const formats = Object.entries(FORMATS);
  const css = formats.map(([k, f]) => `body[data-format="${k}"] { --w: ${f.w}mm; --h: ${f.h}mm; --qr: ${f.qr}mm; }`).join('\n');
  showDocument(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Etiketten</title>${DOC_SCRIPT}
    <style id="page">${pageCss(FORMATS.e50)}</style>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: 'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', sans-serif; color: #000; background: #EEF1F4; }
      ${css}
      .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; padding: 16px; font-size: 14px; }
      .bar button, .bar select { font: inherit; padding: 8px 12px; border-radius: 6px; border: 1px solid #CFD7DF; background: #fff; }
      .bar button.primary { background: #0B6B73; border-color: #0B6B73; color: #fff; font-weight: 700; cursor: pointer; }
      .hint { width: 100%; text-align: center; color: #44535F; font-size: 13px; margin: 0; }
      .labels { display: flex; flex-wrap: wrap; gap: 6mm; justify-content: center; padding: 0 16px 24px; }
      body[data-format="a4"] .labels { display: grid; grid-template-columns: repeat(3, var(--w)); grid-auto-rows: var(--h); gap: 0; width: 210mm; margin: 0 auto; padding: 0; background: #fff; }
      .label { width: var(--w); height: var(--h); padding: 2mm; display: flex; gap: 2mm; align-items: center; background: #fff; overflow: hidden; outline: 1px dashed #9AA6B2; }
      .qr { flex: none; width: var(--qr); height: var(--qr); }
      .qr svg { display: block; width: 100%; height: 100%; }
      .txt { min-width: 0; display: grid; gap: 0.6mm; line-height: 1.1; }
      .nr { font-weight: 800; font-size: calc(var(--h) * 0.24); letter-spacing: -0.02em; }
      .name { font-weight: 700; font-size: calc(var(--h) * 0.11); overflow-wrap: break-word; hyphens: auto; }
      .mat, .tare { font-size: calc(var(--h) * 0.085); overflow-wrap: break-word; hyphens: auto; }
      body[data-format="e50"] .brand, body[data-format="e40"] .brand { display: none; }
      .dot { display: inline-block; width: 0.8em; height: 0.8em; border-radius: 50%; border: 0.2mm solid #000; margin-right: 0.25em; vertical-align: -0.05em; }
      body[data-format="e40"] .tare { display: none; }
      @media print {
        body { background: #fff; }
        .bar { display: none; }
        .labels { display: block; padding: 0; }
        .label { outline: none; break-after: page; }
        body[data-format="a4"] .labels { display: grid; }
        body[data-format="a4"] .label { break-after: auto; }
        body[data-format="a4"] .label:nth-child(24n) { break-after: page; }
      }
    </style></head><body data-format="e50">
    <div class="bar">
      <select id="format" aria-label="Format">${formats.map(([k, f]) => `<option value="${k}">${esc(f.name)}</option>`).join('')}</select>
      <button class="primary" type="button" onclick="window.print()">Drucken</button>
      <button type="button" onclick="closeDoc()">Schließen</button>
      <p class="hint">${list.length} ${list.length === 1 ? 'Etikett' : 'Etiketten'}. Im Druckdialog „Ränder: keine“ und 100 % Größe wählen.
        Den QR-Code mit der Handykamera scannen, dann öffnet sich die Rolle zum Wiegen.</p>
    </div>
    <div class="labels">${list.map((s) => label(s, settings)).join('')}</div>
    <script>
      const PAGE = ${JSON.stringify(Object.fromEntries(formats.map(([k, f]) => [k, pageCss(f)])))};
      const select = document.getElementById('format');
      function setFormat(k) {
        if (!PAGE[k]) return;
        document.body.dataset.format = k;
        document.getElementById('page').textContent = PAGE[k];
        select.value = k;
        try { localStorage.setItem('filament-lager-etikett', k); } catch (e) { /* egal */ }
      }
      select.addEventListener('change', () => setFormat(select.value));
      try { setFormat(localStorage.getItem('filament-lager-etikett') || 'e50'); } catch (e) { setFormat('e50'); }
    </script>
    </body></html>`);
}
