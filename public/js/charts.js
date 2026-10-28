// Kleine Diagramm-Bausteine ohne Bibliothek: Säulen pro Monat (eine oder
// mehrere Reihen, gemeinsame Achse), waagrechte Balken und ein Tooltip.
// Farben kommen aus CSS-Variablen (--series-1, --series-2), Beschriftung in
// Textfarben. Jede Grafik hat eine Tabelle als Alternative.
import { esc } from './ui.js';

const BAR_MAX = 24; // px, dicker wird keine Säule
const GAP = 2; // px Abstand zwischen Säulen einer Gruppe
const R = 4; // px Rundung am Datenende

// Schöne Achsenwerte: 0, 5, 10, … bis über das Maximum
function niceTicks(min, max, count = 4) {
  const span = Math.max(max - min, 1e-9);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || 10 * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

// Säule mit runder Kappe am Datenende, eckig an der Nulllinie.
function columnPath(x, w, y0, y1) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(R, w / 2, h);
  if (y1 < y0) {
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

// categories: [{ key, label, title }], series: [{ name, color (CSS-Wert), values: [] }]
// format: Zahl -> Text, tick: Zahl -> kurzer Achsentext
export function columnChart({
  width, height = 220, categories, series, format, tick = format, labelMax = false,
}) {
  const padL = 52;
  const padR = 8;
  const padT = 18;
  const padB = 26;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = height - padT - padB;
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1] || 1;
  const y = (v) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / categories.length;
  const barW = Math.max(2, Math.min(BAR_MAX, (band * 0.7 - GAP * (series.length - 1)) / series.length));
  const groupW = barW * series.length + GAP * (series.length - 1);
  // Bei vielen Monaten nur jede n-te Beschriftung
  const every = Math.max(1, Math.ceil(categories.length / Math.max(1, Math.floor(plotW / 34))));
  let out = `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">`;
  for (const t of ticks) {
    out += `<line class="grid${t === 0 ? ' base' : ''}" x1="${padL}" x2="${width - padR}" y1="${y(t)}" y2="${y(t)}"/>`;
    out += `<text class="tick" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${esc(tick(t))}</text>`;
  }
  let maxAt = null;
  categories.forEach((c, i) => {
    const x0 = padL + band * i + (band - groupW) / 2;
    series.forEach((s, j) => {
      const v = s.values[i];
      const x = x0 + j * (barW + GAP);
      const d = columnPath(x, barW, y(0), y(v));
      if (d) out += `<path class="col" d="${d}" fill="${s.color}"/>`;
      if (labelMax && j === 0 && v > 0 && (!maxAt || v > maxAt.v)) maxAt = { v, x: x + barW / 2, y: y(v) };
    });
    if (i % every === 0 || i === categories.length - 1) {
      out += `<text class="tick" x="${padL + band * i + band / 2}" y="${height - 8}" text-anchor="middle">${esc(c.label)}</text>`;
    }
  });
  if (maxAt) out += `<text class="val" x="${maxAt.x}" y="${maxAt.y - 6}" text-anchor="middle">${esc(format(maxAt.v))}</text>`;
  // Trefferflächen: der ganze Monatsstreifen, per Tastatur erreichbar
  categories.forEach((c, i) => {
    const tip = [c.title, ...series.map((s) => [s.name, format(s.values[i])])];
    out += `<rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}" tabindex="0" data-tip="${esc(JSON.stringify(tip))}"/>`;
  });
  return `${out}</svg>`;
}

// rows: [{ label, hex (Farbtupfer, optional), value, text, tip: [[name, value], …] }]
export function barList(rows) {
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return `<div class="hbars">${rows.map((r) => `<div class="hbar" tabindex="0" data-tip="${esc(JSON.stringify([r.label, ...(r.tip || [])]))}">
      <span class="hbar-label">${r.hex ? `<span class="dot-color" style="background:${esc(r.hex)}"></span>` : ''}${esc(r.label)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(0.5, (r.value / max) * 100).toFixed(1)}%"></span></span>
      <span class="hbar-value num">${esc(r.text)}</span>
    </div>`).join('')}</div>`;
}

export function legend(series) {
  return `<div class="legend">${series.map((s) => `<span><span class="key" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>`;
}

// head: Spaltennamen, rows: Zeilen mit fertigem Text
export function tableView(head, rows) {
  return `<details class="table-view"><summary>Als Tabelle</summary><div class="table-wrap"><table>
    <thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="r num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}

// Ein Tooltip für alle Diagramme in root: Maus und Tastatur. Inhalte nur
// über textContent, die Namen kommen aus Daten.
export function attachTooltip(root) {
  document.querySelectorAll('.chart-tip').forEach((n) => n.remove()); // von einer früheren Ansicht
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  document.body.append(tip);
  const show = (el, x, y) => {
    let data;
    try {
      data = JSON.parse(el.dataset.tip);
    } catch {
      return;
    }
    const [title, ...lines] = data;
    tip.replaceChildren();
    const t = document.createElement('div');
    t.className = 'tip-title';
    t.textContent = title;
    tip.append(t);
    for (const [name, value] of lines) {
      const row = document.createElement('div');
      row.className = 'tip-row';
      const v = document.createElement('strong');
      v.textContent = value;
      const n = document.createElement('span');
      n.textContent = name;
      row.append(v, n);
      tip.append(row);
    }
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 12));
    const top = y - h - 12 < 8 ? y + 16 : y - h - 12;
    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${top + window.scrollY}px`;
    root.querySelectorAll('.is-hover').forEach((n) => n.classList.remove('is-hover'));
    el.classList.add('is-hover');
  };
  const hide = () => {
    tip.hidden = true;
    root.querySelectorAll('.is-hover').forEach((n) => n.classList.remove('is-hover'));
  };
  root.addEventListener('pointermove', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) show(el, e.clientX, e.clientY);
    else hide();
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focusin', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  root.addEventListener('focusout', hide);
  return () => tip.remove();
}
