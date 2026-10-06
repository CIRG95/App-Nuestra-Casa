// =====================================================================
// remindersService — recordatorios en un calendario compartido de Google.
// Independiente del backend de datos: escucha las escrituras de dbInterface,
// así que sigue funcionando igual si mañana los datos viven en Firestore.
//
// Cada tarea pendiente, producto con vencimiento y meta de proyecto es un
// evento con id determinista (derivado del id del registro), así que crear o
// actualizar es la misma operación y nunca se duplican eventos.
// =====================================================================
import { googleAuth } from './googleAuth.js';
import { db } from './dbInterface.js';
import { cfg } from '../core/config.js';
import { load, save, pad, hoy, addDays, fechaCorta, num } from '../core/utils.js';
import { esp, freqTxt, list } from '../core/dominio.js';

const CAL = 'https://www.googleapis.com/calendar/v3';
const enc = encodeURIComponent;
const CON_EVENTO = ['tareas', 'inventario', 'proyectos'];
const K_COLA = 'casa.calcola';
const AVISO = [{ method: 'popup', minutes: 0 }];

let cola = load(K_COLA) || {};          // eventId → {op:'up', body} | {op:'del'}
const guardarCola = () => save(K_COLA, cola);
const activo = () => !!(cfg.drive && cfg.drive.calendarId);

function evId(col, id) {
  // Calendar acepta ids con caracteres 0-9 y a-v: el hex del id cumple.
  return { tareas: 'a', inventario: 'b', proyectos: 'c' }[col] + Array.from(new TextEncoder().encode(id)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function cuerpo(col, o) {
  const H = pad(cfg.drive.hora ?? 9);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
  const e = esp(o.espacio), lugar = `${e.icono} ${e.nombre}`;
  const ev = (fecha, summary, desc) => ({
    summary, description: `${desc}\n\nAbrir Nuestra Casa: ${location.origin + location.pathname}`,
    start: { dateTime: `${fecha}T${H}:00:00`, timeZone: tz }, end: { dateTime: `${fecha}T${H}:30:00`, timeZone: tz },
    reminders: { useDefault: true }, transparency: 'transparent'
  });
  if (col === 'tareas') {
    if (o.hecha || !o.proxima) return null;
    return ev(o.proxima, `🧹 ${o.titulo}`, `${lugar}. Responsable: ${o.asignado || 'Ambos'}. ${freqTxt(o)}.${o.notas ? '\n' + o.notas : ''}`);
  }
  if (col === 'inventario') {
    if (!o.vence || num(o.cantidad) <= 0) return null;
    let f = addDays(o.vence, -(cfg.drive.aviso ?? 2));
    if (f < hoy()) f = o.vence < hoy() ? o.vence : hoy();
    return ev(f, `⏳ Vence ${fechaCorta(o.vence)}: ${o.nombre}`, `${lugar}. Quedan ${num(o.cantidad)} ${o.unidad || ''}.`);
  }
  if (col === 'proyectos') {
    if (!o.fechaMeta || o.estado === 'listo') return null;
    return ev(o.fechaMeta, `🛠️ Meta: ${o.nombre}`, `${lugar}.`);
  }
  return null;
}

function encolar(col, o) {
  if (!activo() || !CON_EVENTO.includes(col)) return;
  const b = o._del ? null : cuerpo(col, o);
  cola[evId(col, o.id)] = b ? { op: 'up', body: b } : { op: 'del' };
  guardarCola();
}

export const recordatorios = {
  /** Conecta el servicio a las escrituras y a las sincronizaciones exitosas. */
  iniciar() {
    db.on('escritura', encolar);
    db.on('estado', e => { if (e === 'nube') recordatorios.procesar().catch(() => { /* se reintenta en la próxima */ }); });
  },

  /** Vuelve a programar todos los eventos (al unirse o al cambiar la hora del aviso). */
  reprogramarTodo() {
    if (!activo()) return;
    CON_EVENTO.forEach(c => list(c).forEach(o => { if (cuerpo(c, o)) encolar(c, o); }));
  },

  async procesar() {
    if (!activo() || !googleAuth.valido()) return;
    const base = `${CAL}/calendars/${enc(cfg.drive.calendarId)}/events`;
    for (const [id, x] of Object.entries(cola)) {
      try {
        if (x.op === 'del') {
          await googleAuth.api(`${base}/${id}`, { method: 'DELETE' }).catch(e => { if (![404, 410].includes(e.status)) throw e; });
        } else {
          const body = { ...x.body, id, status: 'confirmed' };
          try { await googleAuth.api(`${base}/${id}`, { method: 'PUT', json: body }); }
          catch (e) { if (e.status === 404) await googleAuth.api(base, { method: 'POST', json: body }); else throw e; }
        }
        delete cola[id]; guardarCola();
      } catch (e) {
        if (e.code === 'sin-token') throw e;
        if (e.status === 400 || e.status === 403) { delete cola[id]; guardarCola(); }   // no aplicable: no reintentar para siempre
        else throw e;
      }
    }
  },

  limpiarCola() { cola = {}; guardarCola(); },

  /* ---------- Alta del calendario ---------- */
  async crearCalendario() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
    const cal = await googleAuth.api(`${CAL}/calendars`, { method: 'POST', json: { summary: 'Nuestra Casa', description: 'Recordatorios de tareas, vencimientos y proyectos del hogar.', timeZone: tz } });
    await googleAuth.api(`${CAL}/users/me/calendarList/${enc(cal.id)}`, { method: 'PATCH', json: { defaultReminders: AVISO, colorId: '10' } }).catch(() => {});
    return cal.id;
  },
  compartirCalendario(calendarId, email) {
    return googleAuth.api(`${CAL}/calendars/${enc(calendarId)}/acl?sendNotifications=true`, { method: 'POST', json: { role: 'writer', scope: { type: 'user', value: email } } });
  },
  /** Agrega el calendario compartido a la lista de quien se une, con su aviso por defecto. */
  async suscribir(calendarId) {
    const cl = { id: calendarId, defaultReminders: AVISO, colorId: '10' };
    try { await googleAuth.api(`${CAL}/users/me/calendarList`, { method: 'POST', json: cl }); }
    catch (e) {
      if (e.status === 409) await googleAuth.api(`${CAL}/users/me/calendarList/${enc(calendarId)}`, { method: 'PATCH', json: cl });
      else throw e;
    }
  }
};
