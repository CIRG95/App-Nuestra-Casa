// Tema claro/oscuro: cada teléfono elige el suyo (cfg.tema, no se sincroniza).
import { cfg } from '../core/config.js';

const TEMA_BASE = document.documentElement.getAttribute('data-theme');
const oscuroSistema = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function aplicarTema() {
  const r = document.documentElement;
  if (cfg.tema === 'claro') r.setAttribute('data-theme', 'light');
  else if (cfg.tema === 'oscuro') r.setAttribute('data-theme', 'dark');
  else if (TEMA_BASE) r.setAttribute('data-theme', TEMA_BASE);
  else r.removeAttribute('data-theme');
  const oscuro = cfg.tema === 'oscuro' || (cfg.tema !== 'claro' && (TEMA_BASE ? TEMA_BASE === 'dark' : !!(oscuroSistema && oscuroSistema.matches)));
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', oscuro ? '#131A16' : '#2F6B4F');
}
if (oscuroSistema && oscuroSistema.addEventListener) oscuroSistema.addEventListener('change', aplicarTema);
