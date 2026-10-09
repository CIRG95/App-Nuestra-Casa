// Consultas y reglas del dominio (no dibujan nada). Leen siempre a través de dbInterface.
import { db } from '../services/dbInterface.js';
import { addDays, addMonths, num, norm, hoy, parseD } from './utils.js';
import { FRECUENCIAS, CUENTAS } from './config.js';

export const list = c => db.list(c);
export const get = (c, id) => db.get(c, id);
export const espacios = () => list('espacios').sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || a.nombre.localeCompare(b.nombre));
export const esp = id => get('espacios', id) || { id, nombre: 'Sin espacio', icono: '📦' };
export const stockBajo = i => num(i.minimo) > 0 && num(i.cantidad) <= num(i.minimo);
export const enCompras = nombre => list('compras').some(c => !c.comprado && norm(c.nombre) === norm(nombre));
export const freqTxt = t => t.frecuencia === 'dias' ? `Cada ${num(t.cadaDias) || 1} días` : (FRECUENCIAS[t.frecuencia] || '');

export function siguienteFecha(base, t) {
  switch (t.frecuencia) {
    case 'diaria': return addDays(base, 1);
    case 'semanal': return addDays(base, 7);
    case 'quincenal': return addDays(base, 14);
    case 'mensual': return addMonths(base, 1);
    case 'trimestral': return addMonths(base, 3);
    case 'semestral': return addMonths(base, 6);
    case 'anual': return addMonths(base, 12);
    case 'dias': return addDays(base, Math.max(1, num(t.cadaDias) || 1));
    default: return null;
  }
}

/** Semana actual de lunes a domingo, como fechas 'AAAA-MM-DD'. */
export function semana() {
  const h = hoy(), ini = addDays(h, -((parseD(h).getDay() + 6) % 7));
  return { ini, fin: addDays(ini, 6) };
}

/**
 * Avance semanal de tareas:
 *   hechas     = veces que se marcó una tarea como hecha esta semana (cuenta cada repetición)
 *   atrasadas  = pendientes cuya fecha ya pasó
 *   pendientes = pendientes que vencen de hoy al domingo
 * Una tarea diaria cuenta una vez como pendiente: los días siguientes aparecen al llegar.
 */
export function avanceSemanal() {
  const { ini, fin } = semana(), h = hoy();
  const porPersona = {};
  let hechas = 0;
  list('tareas').forEach(t => (t.historial || []).forEach(x => {
    if (x.fecha >= ini && x.fecha <= fin) { hechas++; porPersona[x.por] = (porPersona[x.por] || 0) + 1; }
  }));
  const abiertas = list('tareas').filter(t => !t.hecha && t.proxima && t.proxima <= fin);
  const atrasadas = abiertas.filter(t => t.proxima < h).length;
  const pendientes = abiertas.length - atrasadas;
  const total = hechas + abiertas.length;
  return { ini, fin, hechas, atrasadas, pendientes, total, porPersona, pct: total ? Math.round(hechas / total * 100) : 0 };
}

/* ---------- Gastos (v0.2) ---------- */
/** Mes que cubre el gasto ('AAAA-MM'). Los gastos anteriores a v0.2 no tienen periodo: se usa su fecha. */
export const periodoDe = g => g.periodo || (g.fecha || '').slice(0, 7);
export const gastosDelMes = ym => list('gastos').filter(g => periodoDe(g) === ym);
export const servicios = (soloActivos = true) => list('servicios').filter(s => !soloActivos || s.activo !== false)
  .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || a.nombre.localeCompare(b.nombre));
export const nombreServicio = s => s ? s.nombre + (s.proveedor ? ` (${s.proveedor})` : '') : '';

/** Estado de cada cuenta básica en un mes: pagos registrados, total y si está pagada. */
export function cuentasDelMes(ym) {
  const pagos = gastosDelMes(ym).filter(g => g.categoria === CUENTAS && g.servicio);
  const filas = servicios().map(s => {
    const ps = pagos.filter(g => g.servicio === s.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return { s, pagos: ps, total: ps.reduce((a, g) => a + num(g.monto), 0), pagada: ps.length > 0 };
  });
  return { filas, pagadas: filas.filter(f => f.pagada).length, sinPagar: filas.filter(f => !f.pagada).length };
}
