// Farben auswählen wie im Bambu-Shop: zur Filamentart die Farben aus dem
// Bambu-Sortiment, sonst die allgemeinen Farben. Als Farbflächen im
// Spulen-Dialog und als eigener Dialog mit Namen und Suche.
import { bambuColors, swatchBackground } from './bambu-colors.js';
import { COLOR_PRESETS, normHex } from './domain.js';
import { esc, icons, openDialog } from './ui.js';

// Farben zur Filamentart: { name, hex, hexes, bambu }
export function colorsFor(material) {
  const list = bambuColors(material);
  if (list.length) return list.map((c) => ({ ...c, bambu: true }));
  return COLOR_PRESETS.map((c) => ({
    name: c.name, hex: normHex(c.hex), hexes: [normHex(c.hex)], bambu: false,
  }));
}

const same = (c, hex, name) => normHex(c.hex) === normHex(hex) && (!name || c.name.toLowerCase() === String(name).toLowerCase());

// Kleine Farbflächen (Spulen-Dialog); data-hex und data-name übernimmt der Aufrufer
export function swatchesHtml(material, hex = '', name = '') {
  const list = colorsFor(material);
  const head = list[0] && list[0].bambu ? `<span class="small muted swatch-head">Bambu Lab ${esc(material)}: ${list.length} Farben</span>` : '';
  return head + list.map((c) => `<button type="button" class="swatch" data-hex="${esc(c.hex)}" data-name="${esc(c.name)}" title="${esc(c.name)}" aria-label="${esc(c.name)}"
    aria-pressed="${same(c, hex, name) || (!name && normHex(c.hex) === normHex(hex))}" style="background:${esc(swatchBackground(c.hexes))}"></button>`).join('');
}

// Dialog mit allen Farben der Filamentart, Namen und Suche; dazu eine eigene Farbe.
// Gibt { name, hex } zurück oder null bei Abbruch.
export function pickColor({ material = '', name = '', hex = '#9AA0A6' } = {}) {
  const list = colorsFor(material);
  return new Promise((resolve) => {
    let result = null;
    const dlg = openDialog({
      title: list[0] && list[0].bambu ? `Farbe: Bambu Lab ${esc(material)}` : 'Farbe wählen',
      body: `${list.length > 12 ? `<label class="search color-search">${icons.search}<input type="search" name="q" placeholder="Farbe suchen" aria-label="Farbe suchen"></label>` : ''}
        <div class="color-grid">${list.map((c, i) => `<button type="button" class="color-tile" data-i="${i}" aria-pressed="${same(c, hex, name)}">
            <span class="color-dot" style="background:${esc(swatchBackground(c.hexes))}"></span><span class="color-name">${esc(c.name)}</span></button>`).join('')}</div>
        ${list[0] && !list[0].bambu ? '<p class="small muted">Für diese Filamentart kennt das Lager keine Bambu-Farben, deshalb die allgemeinen Farben.</p>' : ''}
        <details class="color-own"${list.some((c) => same(c, hex, name)) || !name ? '' : ' open'}><summary>Eigene Farbe</summary>
          <div class="color-row"><input name="ownName" value="${esc(name)}" placeholder="Name, z. B. Kürbis Orange" aria-label="Farbname"><input type="color" name="ownHex" value="${esc(normHex(hex) || '#9AA0A6').toLowerCase()}" aria-label="Farbton"></div>
        </details>`,
      foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Eigene Farbe übernehmen</button>',
      onSubmit(form) {
        const own = form.elements.ownName.value.trim();
        if (!own) throw new Error('Bitte eine Farbe antippen oder einen Namen für die eigene Farbe eingeben.');
        result = { name: own, hex: normHex(form.elements.ownHex.value) };
      },
    });
    dlg.addEventListener('close', () => resolve(result));
    dlg.querySelector('.color-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.color-tile');
      if (!b) return;
      const c = list[Number(b.dataset.i)];
      result = { name: c.name, hex: c.hex };
      dlg.close();
    });
    dlg.querySelector('[name="q"]')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      dlg.querySelectorAll('.color-tile').forEach((b) => {
        b.hidden = Boolean(q) && !list[Number(b.dataset.i)].name.toLowerCase().includes(q);
      });
    });
  });
}
