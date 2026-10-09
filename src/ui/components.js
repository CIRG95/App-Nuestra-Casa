// Piezas visuales reutilizables: íconos, encabezados de sección y filas de cada lista.
import { esc, clp, relDias, diasHasta, fechaCorta, num } from '../core/utils.js';
import { cfg, ESTADOS } from '../core/config.js';
import { list, get, esp, stockBajo, enCompras, freqTxt, avanceSemanal, periodoDe } from '../core/dominio.js';
import { MESES } from '../core/utils.js';

const svg = p => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const ICON = {
  campana: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>'),
  inicio: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  inventario: svg('<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>'),
  compras: svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2h12L22 7H6"/>'),
  tareas: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12.5l3 3 5-6.5"/>'),
  proyectos: svg('<path d="M14.5 6.5l3 3M4 20l3.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L4.5 16z"/><path d="M13 21h8"/>'),
  gastos: svg('<rect x="2.5" y="6" width="19" height="13" rx="3"/><path d="M2.5 10.5h19M6.5 15h4"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  prev: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>')
};
const TABS = [['inicio', 'Inicio'], ['inventario', 'Inventario'], ['compras', 'Compras'], ['tareas', 'Tareas'], ['proyectos', 'Proyectos'], ['gastos', 'Gastos']];

function who(n) {
  const i = cfg.nombres.indexOf(n);
  return `<span class="who ${i === 0 ? 'p1' : i === 1 ? 'p2' : 'pa'}">${esc(n)}</span>`;
}
const espTxt = id => { const e = esp(id); return `<span>${e.icono} ${esc(e.nombre)}</span>`; };
const sec = (titulo, n, add) => `<h2 class="sec">${titulo}${n !== null && n !== undefined ? ` <span class="n">${n}</span>` : ''}${add ? `<button class="add" onclick="${add}">+ Agregar</button>` : ''}</h2>`;
const group = (rows, vacio) => rows.length ? `<div class="group">${rows.join('')}</div>` : `<p class="calm">${vacio}</p>`;
const seg = (opts, val, fn) => `<div class="seg">${opts.map(([k, l]) => `<button class="${val === k ? 'on' : ''}" onclick="${fn}('${k}')">${l}</button>`).join('')}</div>`;
const opt = (k, l, v) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;

function fmtCant(i) { const c = num(i.cantidad); return `${Number.isInteger(c) ? c : c.toFixed(1)}${i.unidad ? ' ' + esc(i.unidad) : ''}`; }

function rowInv(i, conEsp = true) {
  const tags = [];
  if (i.vence) {
    const d = diasHasta(i.vence);
    tags.push(`<span class="tag ${d < 0 ? 'bad' : d <= 7 ? 'warn' : ''}">${d < 0 ? 'Venció ' : 'Vence '}${relDias(i.vence)}</span>`);
  }
  if (stockBajo(i)) tags.push('<span class="tag warn">Queda poco</span>');
  const sugerir = stockBajo(i) && !enCompras(i.nombre);
  return `<div class="row">
    <button class="row-main" onclick="A.editar('inventario','${i.id}')">
      <span class="t">${esc(i.nombre)}</span>
      <span class="s">${conEsp ? espTxt(i.espacio) : ''}${tags.join('')}</span>
    </button>
    ${sugerir ? `<button class="mini" onclick="A.aCompras('${i.id}')">A compras</button>` : ''}
    <div class="qty"><button onclick="A.cant('${i.id}',-1)" aria-label="Restar uno">−</button><span>${fmtCant(i)}</span><button onclick="A.cant('${i.id}',1)" aria-label="Sumar uno">+</button></div>
  </div>`;
}

function rowCompra(c, conEsp = true) {
  return `<div class="row">
    <button class="check ${c.comprado ? 'on' : ''}" onclick="A.toggleCompra('${c.id}')" aria-label="${c.comprado ? 'Quitar del carro' : 'Marcar como en el carro'}"></button>
    <button class="row-main" onclick="A.editar('compras','${c.id}')">
      <span class="t ${c.comprado ? 'done' : ''}">${num(c.cantidad) > 1 || c.unidad ? fmtCant(c) + ' ' : ''}${esc(c.nombre)}</span>
      <span class="s">${conEsp ? espTxt(c.espacio) : ''}${c.notas ? `<span>${esc(c.notas)}</span>` : ''}${c.por ? who(c.por) : ''}</span>
    </button>
  </div>`;
}

function rowTarea(t, conEsp = true) {
  let tag = '';
  if (t.hecha) tag = `<span class="tag">Hecha${t.ultima ? ' ' + relDias(t.ultima) : ''}</span>`;
  else if (t.proxima) {
    const d = diasHasta(t.proxima);
    tag = `<span class="tag ${d < 0 ? 'bad' : d === 0 ? 'warn' : ''}">${d < 0 ? `Atrasada ${-d} ${d === -1 ? 'día' : 'días'}` : relDias(t.proxima)}</span>`;
  }
  return `<div class="row">
    <button class="check round ${t.hecha ? 'on' : ''}" onclick="A.hecha('${t.id}')" aria-label="${t.hecha ? 'Reabrir tarea' : 'Marcar como hecha'}"></button>
    <button class="row-main" onclick="A.editar('tareas','${t.id}')">
      <span class="t ${t.hecha ? 'done' : ''}">${esc(t.titulo)}</span>
      <span class="s">${tag}<span>${freqTxt(t)}</span>${t.asignado ? who(t.asignado) : ''}${conEsp ? espTxt(t.espacio) : ''}</span>
      ${t.hecha && t.ultimaPor ? `<span class="por">Hecha por ${esc(t.ultimaPor)}</span>` : t.por ? `<span class="por">Agregó ${esc(t.por)}</span>` : ''}
    </button>
  </div>`;
}

function gastadoProyecto(id) { return list('gastos').filter(g => g.proyecto === id).reduce((a, g) => a + num(g.monto), 0); }
function rowProyecto(p, conEsp = true) {
  const pasos = p.pasos || [];
  const hechos = pasos.filter(x => x.hecho).length;
  const pct = pasos.length ? Math.round(hechos / pasos.length * 100) : (p.estado === 'listo' ? 100 : 0);
  const gastado = gastadoProyecto(p.id);
  const pres = num(p.presupuesto);
  return `<button class="proj" onclick="A.verProyecto('${p.id}')">
    <span class="h"><b>${esc(p.nombre)}</b><span class="tag ${p.estado === 'curso' ? 'warn' : ''}">${ESTADOS[p.estado] || ''}</span></span>
    <span class="bar"><i style="width:${pct}%"></i></span>
    <span class="m">${conEsp ? espTxt(p.espacio) : ''}<span>${pasos.length ? `${hechos} de ${pasos.length} pasos` : 'Sin pasos'}</span>
      ${pres || gastado ? `<span>${clp(gastado)}${pres ? ' de ' + clp(pres) : ' gastado'}</span>` : ''}
      ${p.fechaMeta ? `<span>Meta ${fechaCorta(p.fechaMeta)}</span>` : ''}${p.por ? `<span>Agregó ${esc(p.por)}</span>` : ''}</span>
  </button>`;
}

function rowGasto(g, conCat = true) {
  const s = g.servicio ? get('servicios', g.servicio) : null;
  const per = periodoDe(g), mesFecha = (g.fecha || '').slice(0, 7);
  const perTxt = per && per !== mesFecha ? `<span>Periodo ${MESES[Number(per.slice(5, 7)) - 1]}</span>` : '';
  return `<div class="row">
    <button class="row-main" onclick="A.editar('gastos','${g.id}')">
      <span class="t">${s ? s.icono + ' ' : ''}${esc(g.descripcion)}</span>
      <span class="s">${g.fecha ? `<span>${fechaCorta(g.fecha)}</span>` : ''}${perTxt}${conCat ? `<span>${esc(g.categoria || '')}</span>` : ''}${who(g.pagadoPor)}${g.division === 'personal' ? '<span class="tag">Personal</span>' : ''}</span>
    </button>
    <span class="amount">${clp(g.monto)}</span>
  </div>`;
}

/** Hora relativa corta: "hace 5 min", "hace 2 h", "ayer 18:40", "3 oct 09:15". */
function haceCuanto(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  if (m < 12 * 60) return `hace ${Math.round(m / 60)} h`;
  const d = new Date(ms), hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === new Date().toDateString()) return 'hoy ' + hora;
  if (d.toDateString() === ayer.toDateString()) return 'ayer ' + hora;
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) + ' ' + hora;
}

/** Barra de avance de la semana (tareas). */
function progresoSemanal() {
  const a = avanceSemanal();
  const rango = `${fechaCorta(a.ini)} al ${fechaCorta(a.fin)}`;
  if (!a.total) return `<section class="semana"><div class="sem-h"><b>Esta semana</b><span>${rango}</span></div><p class="sem-vacia">Sin tareas para esta semana.</p></section>`;
  const w = n => (n / a.total * 100).toFixed(1) + '%';
  const personas = cfg.nombres.map(n => `<span>${who(n)} ${a.porPersona[n] || 0}</span>`).join('');
  return `<section class="semana" aria-label="Avance de la semana">
    <div class="sem-h"><b>Esta semana</b><span>${a.hechas} de ${a.total} hechas · ${a.pct}%</span></div>
    <div class="sem-bar" role="img" aria-label="${a.hechas} hechas, ${a.atrasadas} atrasadas, ${a.pendientes} pendientes">
      <i class="ok" style="width:${w(a.hechas)}"></i><i class="late" style="width:${w(a.atrasadas)}"></i></div>
    <div class="sem-l"><span><i class="ok"></i>${a.hechas} hechas</span><span><i class="late"></i>${a.atrasadas} atrasadas</span><span><i></i>${a.pendientes} por hacer</span></div>
    <div class="sem-p"><span>Completadas por</span>${personas}<span class="r">${rango}</span></div>
  </section>`;
}

export { haceCuanto, progresoSemanal, svg, ICON, TABS, who, espTxt, sec, group, seg, opt, fmtCant, rowInv, rowCompra, rowTarea, gastadoProyecto, rowProyecto, rowGasto };
