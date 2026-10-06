// Panel inferior (formularios, ajustes), confirmaciones, avisos y botón "atrás" de Android.
import { $, esc } from '../core/utils.js';
import { S } from './state.js';
import { render } from './views.js';

let sheetHist = false, ignorePop = false, resolverConf = null;

export function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#modal').hidden = false; document.body.classList.add('lock');
  $('#sheet').scrollTop = 0;
  if (!sheetHist) { history.pushState({ sheet: 1 }, ''); sheetHist = true; }
}
function hideSheet() { $('#modal').hidden = true; document.body.classList.remove('lock'); }
export function closeSheet() {
  hideSheet();
  if (sheetHist) { sheetHist = false; ignorePop = true; history.back(); }
}
window.closeSheet = closeSheet;   // usado por onclick="closeSheet()"

window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  if (!$('#modal').hidden) { sheetHist = false; hideSheet(); return; }
  if (S.espacio) { S.espacio = null; render(); window.scrollTo(0, 0); }
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSheet(); });

/** Confirmación propia (los diálogos del navegador pueden venir bloqueados). */
export function confirmar(msg, ok = 'Eliminar') {
  return new Promise(res => {
    resolverConf = res;
    openSheet(`<h2>¿Seguro?</h2><p>${esc(msg)}</p><div class="acts"><span class="sp"></span>
      <button class="ghost" onclick="__conf(false);closeSheet()">Cancelar</button><button class="pri" onclick="__conf(true)">${esc(ok)}</button></div>`);
  });
}
window.__conf = v => { const r = resolverConf; resolverConf = null; if (r) r(v); };

let tt;
export function toast(msg, act) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${act ? `<button id="tact">${esc(act.label)}</button>` : ''}`;
  t.hidden = false;
  if (act) $('#tact').onclick = () => { act.fn(); t.hidden = true; };
  clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, act ? 5500 : 3000);
}
