// =====================================================================
// dbInterface — el ÚNICO punto por donde las pantallas leen y escriben datos.
//
// Capas:
//   pantallas (src/ui)  →  db (este archivo)  →  caché local (localStorage, siempre)
//                                             →  adaptador de nube (opcional, intercambiable)
//
// Hoy el adaptador es googleDriveService. Para pasar a Firebase basta con escribir
// un firestoreService que cumpla el contrato AdaptadorNube de abajo y pasarlo en
// db.conectar(). Las pantallas no se tocan.
//
// Reglas del modelo (las cumple cualquier backend):
//   - Cada registro tiene: id, mod (ms), modPor, creado, por.
//   - Un borrado es una "lápida": { id, _del: true, mod, modPor }. Así el borrado
//     viaja al otro teléfono. Las lápidas se purgan a los 60 días.
//   - Conflictos: por registro, gana el `mod` más alto (último en editar).
// =====================================================================

/**
 * @typedef {Object<string, Object<string, Object>>} Datos  { coleccion: { id: registro } }
 *
 * @typedef {Object} ContextoAdaptador   Lo que db le entrega al adaptador al conectarlo.
 * @property {() => Datos} datos                Copia local actual (para subir).
 * @property {(remoto: Datos) => void} recibir   Entregar datos remotos (completos o parciales) para fusionar.
 * @property {(estado: EstadoSync) => void} estado
 *
 * @typedef {'local'|'conectando'|'nube'|'offline'|'sin-sesion'|'error'} EstadoSync
 *
 * @typedef {Object} AdaptadorNube        Contrato que cumple googleDriveService (y cumplirá firestoreService).
 * @property {string} id                              'drive' | 'firestore'
 * @property {() => boolean} configurado              ¿Este teléfono ya está unido a un hogar en este backend?
 * @property {(ctx: ContextoAdaptador) => Promise<void>} iniciar
 * @property {(col: string, reg: Object) => void} escribir   Aviso de un cambio local (registro o lápida).
 * @property {() => Promise<void>} sincronizar        Forzar intercambio con la nube.
 * @property {() => void} login                       Renovar sesión (puede navegar fuera de la app).
 * @property {() => Promise<void>} desconectar        Olvidar sesión en este teléfono (no borra la nube).
 */

import { COLS, DEF_ESPACIOS, DEF_SERVICIOS } from '../core/config.js';
import { load, save, clean } from '../core/utils.js';

const CLAVE = 'casa.data';
const LAPIDA_MS = 60 * 864e5;

const datos = {};
COLS.forEach(c => { datos[c] = {}; });
let adaptador = null;
let autor = () => '';
let estadoActual = 'local';
let ultimaSync = 0;
const oyentes = { cambio: new Set(), estado: new Set(), escritura: new Set() };

/* ---------- Fusión (pura, exportada para pruebas y para adaptadores) ---------- */
export function fusionar(a, b) {
  const out = {}, limite = Date.now() - LAPIDA_MS;
  COLS.forEach(c => {
    const m = { ...(b[c] || {}) };
    Object.entries(a[c] || {}).forEach(([id, o]) => { const r = m[id]; if (!r || (o.mod || 0) > (r.mod || 0)) m[id] = o; });
    Object.keys(m).forEach(id => { if (m[id]._del && m[id].mod < limite) delete m[id]; });
    out[c] = m;
  });
  return out;
}
/** Huella barata para saber si dos copias difieren (ids + mod). */
export const firma = d => COLS.map(c => Object.keys(d[c] || {}).sort().map(id => id + ':' + (d[c][id].mod || 0)).join(',')).join('|');

/* ---------- Internos ---------- */
const persistir = () => save(CLAVE, datos);
function emitir(tipo, ...args) { oyentes[tipo].forEach(f => { try { f(...args); } catch (e) { console.error(e); } }); }
function sembrar() {
  // Valores iniciales con mod: 0 e ids fijos → iguales en ambos teléfonos, y cualquier edición real gana al fusionar.
  // Solo si la colección está vacía de verdad (sin lápidas): si alguien borró todo, no se vuelve a sembrar.
  let n = 0;
  if (!Object.keys(datos.espacios).length) { DEF_ESPACIOS.forEach(([id, icono, nombre], i) => { datos.espacios[id] = { id, icono, nombre, orden: i, mod: 0 }; }); n++; }
  if (!Object.keys(datos.servicios || {}).length) { datos.servicios = {}; DEF_SERVICIOS.forEach(([id, icono, nombre], i) => { datos.servicios[id] = { id, icono, nombre, proveedor: '', activo: true, orden: i, mod: 0 }; }); n++; }
  if (n) persistir();
}
function recibir(remoto) {
  const m = fusionar(datos, remoto || {});
  COLS.forEach(c => { datos[c] = m[c]; });
  sembrar();
  persistir(); emitir('cambio');
}
function setEstado(e) {
  estadoActual = e;
  if (e === 'nube') ultimaSync = Date.now();
  emitir('estado', e);
}

/* ---------- API pública ---------- */
export const db = {
  /** Carga la caché local y, si se entrega un adaptador ya configurado, lo conecta. */
  async iniciar({ adaptador: ad = null, autor: fnAutor } = {}) {
    if (fnAutor) autor = fnAutor;
    const raw = load(CLAVE);
    if (raw) COLS.forEach(c => { datos[c] = raw[c] || {}; });
    sembrar();
    if (ad && ad.configurado()) await db.conectar(ad);
    else setEstado('local');
  },

  /** Enchufa un backend de nube (Drive hoy, Firestore mañana). */
  async conectar(ad) {
    adaptador = ad;
    await ad.iniciar({ datos: () => datos, recibir, estado: setEstado });
  },
  async desconectar() {
    if (adaptador) await adaptador.desconectar();
    adaptador = null; setEstado('local');
  },
  conectado: () => !!adaptador,
  backend: () => adaptador ? adaptador.id : 'local',

  /* Lectura (nunca devuelve lápidas) */
  list: c => Object.values(datos[c] || {}).filter(o => !o._del),
  get(c, id) { const o = (datos[c] || {})[id]; return o && !o._del ? o : null; },

  /* Escritura: siempre local primero; la nube se entera después. */
  put(col, obj) {
    const ahora = Date.now();
    if (!obj.creado) { obj.creado = ahora; obj.por = autor(); }
    obj.mod = ahora; obj.modPor = autor();
    delete obj._del;
    const previo = db.get(col, obj.id);
    datos[col][obj.id] = obj; persistir();
    emitir('escritura', col, obj, previo, 'local'); emitir('cambio');
    if (adaptador) adaptador.escribir(col, obj);
    return obj;
  },
  remove(col, id) {
    if (!datos[col][id]) return;
    const previo = db.get(col, id);
    const t = { id, _del: true, mod: Date.now(), modPor: autor() };
    datos[col][id] = t; persistir();
    emitir('escritura', col, t, previo, 'local'); emitir('cambio');
    if (adaptador) adaptador.escribir(col, t);
  },

  /* Sincronización y sesión */
  sync: () => adaptador ? adaptador.sincronizar() : Promise.resolve(),
  login: () => { if (adaptador) adaptador.login(); },
  estado: () => estadoActual,
  ultimaSync: () => ultimaSync,

  /* Eventos: 'cambio' (redibujar), 'estado' (insignia de sync),
     'escritura' (col, registro, previo, origen) → recordatorios y actividad. Solo cambios hechos EN este teléfono. */
  on(tipo, fn) { oyentes[tipo].add(fn); return () => oyentes[tipo].delete(fn); },

  /* Respaldo */
  exportar: () => clean(datos),
  importar(d) {
    let n = 0;
    COLS.forEach(c => Object.values(d[c] || {}).forEach(o => { datos[c][o.id] = o; emitir('escritura', c, o, null, 'importado'); n++; }));
    persistir(); emitir('cambio');
    if (adaptador) adaptador.sincronizar();
    return n;
  }
};
