// =====================================================================
// googleAuth — inicio de sesión con Google SIN ventanas emergentes.
//
// La librería GIS (initTokenClient) solo funciona con popup: su opción
// ux_mode:'redirect' existe únicamente para el flujo con código, que necesita
// un servidor propio para canjearlo. Como la app no tiene servidor, aquí se usa
// directamente el flujo OAuth 2.0 para apps web del lado del cliente:
//   1. La app navega a accounts.google.com (página completa, no popup).
//   2. Google vuelve a la app con #access_token=... en la URL.
//   3. procesarRetorno() lee el token, lo guarda y limpia la URL.
// Antes de salir se guarda la "intención" (crear hogar, unirse, sincronizar)
// para retomarla al volver, porque la página se recarga.
//
// En Google Cloud, el ID de cliente debe tener en "URI de redirección autorizados"
// exactamente la dirección de la app, p. ej. https://usuario.github.io/nuestra-casa/
// =====================================================================
import { load, save, uid } from '../core/utils.js';

export const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/calendar'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const K_TOKEN = 'casa.token', K_PEND = 'casa.oauth';

/** Dirección exacta a la que Google devuelve (sin index.html, sin #, sin ?). */
export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

let token = load(K_TOKEN);

export const googleAuth = {
  valido: () => !!(token && token.exp > Date.now() + 60000),

  /**
   * Sale de la app hacia Google. Al volver, procesarRetorno() entrega `intencion`.
   * @param {{clientId:string, email?:string, consentimiento?:boolean, intencion?:Object}} o
   */
  iniciarLogin({ clientId, email, consentimiento = false, intencion = null }) {
    const state = uid();
    save(K_PEND, { state, intencion, ts: Date.now() });
    const p = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri(), response_type: 'token',
      scope: SCOPES.join(' '), include_granted_scopes: 'true', state
    });
    if (consentimiento) p.set('prompt', 'consent');
    if (email) p.set('login_hint', email);
    location.assign(`${AUTH_URL}?${p}`);
  },

  /**
   * Llamar al arrancar. Si la URL trae la respuesta de Google la procesa.
   * @returns {null | {ok?:true, error?:string, intencion?:Object}}
   */
  procesarRetorno() {
    if (!/[#&](access_token|error)=/.test(location.hash)) return null;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);   // saca el token de la barra
    const pend = load(K_PEND);
    localStorage.removeItem(K_PEND);
    if (!pend || h.get('state') !== pend.state) return { error: 'La respuesta de Google no coincide con la solicitud. Intenta de nuevo.' };
    const intencion = pend.intencion;
    if (h.get('error')) return { error: h.get('error') === 'access_denied' ? 'Cancelaste el acceso a Google.' : 'Google respondió: ' + h.get('error'), intencion };
    const otorgados = (h.get('scope') || '').split(' ');
    if (!SCOPES.every(s => otorgados.includes(s))) return { error: 'Hay que aceptar los permisos de Drive y Calendar.', intencion };
    token = { t: h.get('access_token'), exp: Date.now() + Number(h.get('expires_in') || 3600) * 1000 };
    save(K_TOKEN, token);
    return { ok: true, intencion };
  },

  async revocar() {
    if (token) {
      try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(token.t) }); }
      catch (e) { /* sin red: el token igual expira en una hora */ }
    }
    googleAuth.olvidar();
  },
  olvidar() { token = null; localStorage.removeItem(K_TOKEN); },

  /** fetch autenticado. Lanza {code:'sin-token'} si hay que volver a iniciar sesión. */
  async api(url, opt = {}) {
    if (!googleAuth.valido()) throw Object.assign(new Error('sin-token'), { code: 'sin-token' });
    const headers = { Authorization: 'Bearer ' + token.t, ...(opt.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) };
    const r = await fetch(url, { method: opt.method || 'GET', headers, body: opt.json !== undefined ? JSON.stringify(opt.json) : opt.body });
    if (r.status === 401) { googleAuth.olvidar(); throw Object.assign(new Error('sin-token'), { code: 'sin-token' }); }
    if (!r.ok) {
      const e = new Error('HTTP ' + r.status); e.status = r.status;
      try { e.detalle = (await r.json()).error.message; } catch (x) { /* sin detalle */ }
      throw e;
    }
    if (r.status === 204) return null;
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (x) { return txt; }
  }
};
