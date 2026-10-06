// =====================================================================
// actividadService — registro de "quién hizo qué" para la campana de Inicio.
//
// Escucha las escrituras LOCALES de dbInterface y guarda una entrada legible en
// la colección 'actividad', que se sincroniza como cualquier otra. Así cada
// teléfono ve lo que hizo el otro, sin importar si la nube es Drive o Firestore.
//
// Para no llenar la campana de ruido:
//   - cambios seguidos de la misma persona sobre el mismo registro (por ejemplo,
//     tocar + tres veces en el inventario) se agrupan en una sola entrada (10 min);
//   - las acciones compuestas (finalizar compra) se registran como un solo evento;
//   - las entradas de más de 30 días se eliminan.
// =====================================================================
import { db } from './dbInterface.js';
import { cfg, saveCfg, yo, ESTADOS } from '../core/config.js';
import { uid, clp, num, hoy } from '../core/utils.js';

const AGRUPAR_MS = 10 * 60000;
const VIDA_MS = 30 * 864e5;
let silencio = 0;

const nombreDe = (col, o) => o ? (col === 'tareas' ? o.titulo : col === 'gastos' ? o.descripcion : o.nombre) || '' : '';
const hechos = o => (o.pasos || []).filter(x => x.hecho).length;

/** Traduce un cambio en [frase, agrupable]. null = no vale la pena avisar.
 *  "agrupable" = cambio menor que se puede fundir con el anterior del mismo registro. */
function describir(col, o, prev) {
  const r = frase(col, o, prev);
  if (!r) return null;
  const menor = !o._del && prev && !/^(completó|dejó .* como pendiente|avanzó|cambió)/.test(r);
  return [r, menor];
}
function frase(col, o, prev) {
  if (o._del) {
    if (!prev) return null;
    const n = nombreDe(col, prev);
    return { compras: `sacó ${n} de la lista de compras`, inventario: `eliminó ${n} del inventario`, tareas: `eliminó la tarea ${n}`,
      proyectos: `eliminó el proyecto ${n}`, gastos: `eliminó el gasto ${n}`, espacios: `eliminó el espacio ${n}` }[col] || null;
  }
  const n = nombreDe(col, o);
  if (!prev) {
    return { compras: `agregó ${n} a la lista de compras`, inventario: `agregó ${n} al inventario`, tareas: `creó la tarea ${n}`,
      proyectos: `creó el proyecto ${n}`, gastos: `registró el gasto ${n} por ${clp(o.monto)}`, espacios: `creó el espacio ${n}` }[col] || null;
  }
  switch (col) {
    case 'tareas': {
      const h1 = (o.historial || []).length, h0 = (prev.historial || []).length;
      if (h1 > h0) return `completó ${n}`;
      if (h1 < h0 || (prev.hecha && !o.hecha)) return `dejó ${n} como pendiente`;
      return `editó la tarea ${n}`;
    }
    case 'compras':
      if (o.comprado && !prev.comprado) return `echó ${n} al carro`;
      if (!o.comprado && prev.comprado) return `sacó ${n} del carro`;
      return `editó ${n} en compras`;
    case 'inventario':
      if (num(o.cantidad) !== num(prev.cantidad)) return `dejó ${n} en ${num(o.cantidad)}${o.unidad ? ' ' + o.unidad : ''}`;
      return `editó ${n} en el inventario`;
    case 'proyectos':
      if (hechos(o) > hechos(prev)) return `avanzó en ${n} (${hechos(o)} de ${o.pasos.length} pasos)`;
      if (o.estado !== prev.estado) return `cambió ${n} a ${(ESTADOS[o.estado] || '').toLowerCase()}`;
      return `editó el proyecto ${n}`;
    case 'gastos': return `editó el gasto ${n}`;
    case 'espacios': return `editó el espacio ${n}`;
    default: return null;
  }
}

function registrar(texto, col = '', ref = '', menor = false) {
  const ahora = Date.now(), quien = yo();
  // Cambio menor sobre el mismo registro que otro menor reciente mío: se reemplaza en vez de sumar otra línea.
  const previa = menor && ref && db.list('actividad').find(a => a.menor && a.ref === ref && a.col === col && a.quien === quien && ahora - a.fecha < AGRUPAR_MS);
  db.put('actividad', { id: previa ? previa.id : uid(), fecha: ahora, quien, col, ref, texto, menor });
}

export const actividad = {
  iniciar() {
    db.on('escritura', (col, o, prev, origen) => {
      if (col === 'actividad' || silencio || origen === 'importado') return;
      const d = describir(col, o, prev);
      if (d) registrar(d[0], col, o.id, d[1]);
    });
    // Limpieza diaria de entradas viejas
    if (cfg.actLimpieza !== hoy()) {
      const limite = Date.now() - VIDA_MS;
      db.list('actividad').filter(a => a.fecha < limite).forEach(a => db.remove('actividad', a.id));
      cfg.actLimpieza = hoy(); saveCfg();
    }
  },

  /** Ejecuta varias escrituras y deja UNA sola entrada con `texto`. */
  lote(texto, fn) {
    silencio++;
    try { fn(); } finally { silencio--; }
    registrar(texto);
  },

  /** Últimas entradas, más recientes primero. */
  recientes: (n = 60) => db.list('actividad').sort((a, b) => b.fecha - a.fecha).slice(0, n),

  /** Cuántas entradas del OTRO no he visto en este teléfono. */
  noLeidas() {
    const visto = cfg.notifVisto || 0, quien = yo();
    return db.list('actividad').filter(a => a.quien !== quien && a.fecha > visto).length;
  },
  marcarLeidas() { cfg.notifVisto = Date.now(); saveCfg(); }
};
