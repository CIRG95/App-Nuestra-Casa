// =====================================================================
// googleDriveService — adaptador de nube basado en un archivo JSON en Drive.
// Cumple el contrato AdaptadorNube de dbInterface.js. No dibuja nada:
// avisa su estado con ctx.estado() y la UI decide cómo mostrarlo.
//
// Cómo sincroniza: baja el archivo, fusiona con la copia local (gana el último
// en editar cada registro) y, si quedó distinto, lo vuelve a subir. Si los dos
// teléfonos escriben a la vez, ninguno pierde datos: el que quedó atrás tiene
// su cambio en local y lo vuelve a subir en la siguiente vuelta.
// =====================================================================
import { googleAuth } from './googleAuth.js';
import { firma } from './dbInterface.js';
import { cfg, saveCfg } from '../core/config.js';
import { uid } from '../core/utils.js';

const DRV = 'https://www.googleapis.com/drive/v3';
const UPL = 'https://www.googleapis.com/upload/drive/v3';
export const FILE_NAME = 'Nuestra Casa - datos.json';
const INTERVALO_MS = 60000;

let ctx = null, timer = null, corriendo = false, otraVez = false, oyendo = false;

/** @type {import('./dbInterface.js').AdaptadorNube} */
export const googleDriveService = {
  id: 'drive',
  configurado: () => !!(cfg.drive && cfg.drive.fileId),

  async iniciar(contexto) {
    ctx = contexto;
    if (!oyendo) {
      oyendo = true;
      setInterval(() => { if (document.visibilityState === 'visible') googleDriveService.sincronizar(); }, INTERVALO_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') googleDriveService.sincronizar(); });
      window.addEventListener('online', () => googleDriveService.sincronizar());
    }
    await googleDriveService.sincronizar();
  },

  escribir() {   // Drive guarda el archivo entero: se agrupan los cambios de 1,5 s
    clearTimeout(timer);
    timer = setTimeout(() => googleDriveService.sincronizar(), 1500);
  },

  async sincronizar() {
    if (!ctx || !googleDriveService.configurado()) return;
    if (corriendo) { otraVez = true; return; }
    if (!navigator.onLine) return ctx.estado('offline');
    if (!googleAuth.valido()) return ctx.estado('sin-sesion');
    corriendo = true; ctx.estado('conectando');
    try {
      const rem = await leerArchivo(cfg.drive.fileId);
      const remData = (rem && rem.data) || {};
      ctx.recibir(remData);
      const local = ctx.datos();
      if (firma(local) !== firma(remData)) {
        await escribirArchivo(cfg.drive.fileId, { app: 'nuestra-casa', v: 1, meta: { ...(rem && rem.meta), calendarId: cfg.drive.calendarId }, data: local });
      }
      ctx.estado('nube');
    } catch (e) {
      if (e.code === 'sin-token') ctx.estado('sin-sesion');
      else ctx.estado(navigator.onLine ? 'error' : 'offline');
      if (e.code !== 'sin-token' && navigator.onLine) console.warn('Drive:', e.detalle || e.message);
    } finally {
      corriendo = false;
      if (otraVez) { otraVez = false; googleDriveService.escribir(); }
    }
  },

  login() {
    googleAuth.iniciarLogin({ clientId: cfg.drive.clientId, email: cfg.drive.email, intencion: { accion: 'sync' } });
  },

  async desconectar() {
    await googleAuth.revocar();
    cfg.drive = null; saveCfg();
    ctx = null;
  },

  /* ---------- Alta del hogar (las orquesta src/ui/actions.js) ---------- */

  /** Correo de la cuenta con sesión iniciada. */
  async quienSoy() { return (await googleAuth.api(`${DRV}/about?fields=user`)).user.emailAddress; },

  /** Crea el archivo de datos en el Drive de quien inicia el hogar. Devuelve su id. */
  async crearArchivo(datos, meta = {}) {
    const metaArchivo = { name: FILE_NAME, mimeType: 'application/json', description: 'Datos de la app Nuestra Casa. No editar a mano.' };
    const contenido = { app: 'nuestra-casa', v: 1, meta, data: datos };
    const bnd = 'casa' + uid();
    const body = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metaArchivo)}\r\n--${bnd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(contenido)}\r\n--${bnd}--`;
    const f = await googleAuth.api(`${UPL}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${bnd}` }, body });
    return f.id;
  },

  /** Da permiso de edición sobre el archivo a otra cuenta de Google. */
  compartirArchivo(fileId, email) {
    return googleAuth.api(`${DRV}/files/${fileId}/permissions?sendNotificationEmail=true`, { method: 'POST', json: { role: 'writer', type: 'user', emailAddress: email } });
  },

  /** Comprueba que esta cuenta puede leer el archivo (al unirse con un código). */
  verificarAcceso: fileId => leerArchivo(fileId)
};

function leerArchivo(fileId) { return googleAuth.api(`${DRV}/files/${fileId}?alt=media`); }
function escribirArchivo(fileId, contenido) {
  return googleAuth.api(`${UPL}/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contenido) });
}
