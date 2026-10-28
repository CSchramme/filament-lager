// Geheimer Link zu einer Nur-Lese-Seite (Strom für Papa, Farbkarte für
// Kunden): erstellen, mit QR-Code teilen, neu erstellen oder zurückziehen.
import { qrSvg } from './qr.js';
import {
  dateDe, esc, openDialog, toast,
} from './ui.js';

// page: z. B. "strom.html"; intro(hasLink): Text über dem Link (HTML);
// get/create/remove: Backend-Aufrufe, die { token, createdAt } liefern.
export async function shareLinkDialog({
  title, page, intro, hint = '', get, create, remove,
}) {
  let share;
  try {
    share = await get();
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const link = (s) => new URL(`${page}#t=${s.token}`, location.href).href;
  const body = (s) => (s.token
    ? `<p>${intro(true)}</p>
      <div class="share-box">
        <div class="share-qr">${qrSvg(link(s), { border: 2, title: 'Link als QR-Code' })}</div>
        <div class="share-link"><span class="copy-row"><input id="share-link" readonly value="${esc(link(s))}" aria-label="Link"><button class="btn" type="button" data-share="copy">Kopieren</button></span>
          <div class="actions">${navigator.share ? '<button type="button" class="btn small" data-share="send">Teilen …</button>' : ''}<a class="btn small" href="${esc(link(s))}" target="_blank" rel="noopener">Ansehen</a></div>
          <p class="small muted">${hint ? `${hint} ` : ''}Seit ${dateDe(s.createdAt)} gültig.</p></div>
      </div>`
    : `<p>${intro(false)}</p>`);
  const foot = (s) => (s.token
    ? '<button type="button" class="btn danger" data-share="stop">Link zurückziehen</button><span class="spacer"></span><button type="button" class="btn" data-share="new">Neuer Link</button><button type="button" class="btn primary" data-close>Fertig</button>'
    : '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="button" class="btn primary" data-share="new">Link erstellen</button>');
  const dlg = openDialog({ title, body: body(share), foot: foot(share) });
  const redraw = (s) => {
    share = s;
    dlg.querySelector('.dlg-body').innerHTML = body(s);
    dlg.querySelector('.dlg-foot').innerHTML = foot(s);
  };
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-share]');
    if (!b) return;
    try {
      if (b.dataset.share === 'copy') {
        await navigator.clipboard.writeText(link(share)).then(() => toast('Link kopiert'), () => {
          dlg.querySelector('#share-link').select();
          toast('Link markiert, jetzt kopieren');
        });
      }
      if (b.dataset.share === 'send') await navigator.share({ title, url: link(share) }).catch(() => {});
      if (b.dataset.share === 'new') {
        // Bei einem bestehenden Link erst nachfragen: der alte geht dann nicht mehr
        if (share.token && !b.dataset.sure) {
          b.dataset.sure = '1';
          b.textContent = 'Alter Link geht dann nicht mehr. Sicher?';
          return;
        }
        redraw(await create());
        toast('Link erstellt');
      }
      if (b.dataset.share === 'stop') {
        redraw(await remove());
        toast('Link zurückgezogen, er funktioniert nicht mehr');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
