// Formularios genéricos: cada colección declara sus campos y openForm los dibuja.
import { esc, hoy, fechaCorta, iso } from '../core/utils.js';
import { cfg, yo, CATEGORIAS, FRECUENCIAS, ESTADOS } from '../core/config.js';
import { list, get, espacios } from '../core/dominio.js';
import { S } from './state.js';
import { openSheet } from './sheet.js';
import { opt } from './components.js';

const ESPACIO = { k: 'espacio', l: 'Espacio', t: 'espacio' };
const NOTAS = { k: 'notas', l: 'Notas', t: 'textarea' };
const FORMS = {
  inventario: { nuevo: 'Nuevo producto', editar: 'Editar producto', campos: [
    { k: 'nombre', l: 'Nombre', t: 'text', req: 1, ph: 'Arroz, detergente, ampolletas…' }, ESPACIO,
    { k: 'cantidad', l: 'Cantidad', t: 'number', def: 1, half: 1 }, { k: 'unidad', l: 'Unidad', t: 'text', ph: 'un, kg, L', half: 1 },
    { k: 'minimo', l: 'Avisar cuando queden', t: 'number', ph: 'Vacío = no avisar', half: 1 }, { k: 'vence', l: 'Vence', t: 'date', half: 1 },
    NOTAS] },
  compras: { nuevo: 'Agregar a compras', editar: 'Editar ítem', campos: [
    { k: 'nombre', l: 'Qué comprar', t: 'text', req: 1 },
    { k: 'cantidad', l: 'Cantidad', t: 'number', def: 1, half: 1 }, { k: 'unidad', l: 'Unidad', t: 'text', ph: 'un, kg, L', half: 1 },
    ESPACIO, { k: 'notas', l: 'Detalle', t: 'text', ph: 'Marca, tamaño, dónde comprarlo' }] },
  tareas: { nuevo: 'Nueva tarea', editar: 'Editar tarea', campos: [
    { k: 'titulo', l: 'Tarea', t: 'text', req: 1, ph: 'Cambiar sábanas, regar plantas…' }, ESPACIO,
    { k: 'frecuencia', l: 'Se repite', t: 'select', opts: FRECUENCIAS, def: 'semanal' },
    { k: 'cadaDias', l: 'Cada cuántos días', t: 'number', show: 'frecuencia=dias', def: 10 },
    { k: 'proxima', l: 'Próxima vez', t: 'date', def: hoy, half: 1 },
    { k: 'asignado', l: 'Responsable', t: 'persona', ambos: 1, def: 'Ambos', half: 1 }, NOTAS] },
  proyectos: { nuevo: 'Nuevo proyecto', editar: 'Editar proyecto', campos: [
    { k: 'nombre', l: 'Proyecto', t: 'text', req: 1, ph: 'Pintar el dormitorio' }, ESPACIO,
    { k: 'estado', l: 'Estado', t: 'select', opts: ESTADOS, def: 'idea', half: 1 }, { k: 'fechaMeta', l: 'Fecha meta', t: 'date', half: 1 },
    { k: 'presupuesto', l: 'Presupuesto (CLP)', t: 'number' }, NOTAS] },
  gastos: { nuevo: 'Nuevo gasto', editar: 'Editar gasto', campos: [
    { k: 'descripcion', l: 'Descripción', t: 'text', req: 1, ph: 'Cuenta de luz, Líder, ferretería…' },
    { k: 'monto', l: 'Monto (CLP)', t: 'number', req: 1, half: 1 }, { k: 'fecha', l: 'Fecha', t: 'date', def: hoy, half: 1 },
    { k: 'categoria', l: 'Categoría', t: 'select', opts: CATEGORIAS, def: 'Supermercado' }, ESPACIO,
    { k: 'pagadoPor', l: 'Pagó', t: 'persona', def: yo, half: 1 },
    { k: 'division', l: 'Se reparte', t: 'select', opts: { compartido: 'Mitad y mitad', personal: 'No, es personal' }, def: 'compartido', half: 1 },
    { k: 'proyecto', l: 'Proyecto asociado', t: 'proyecto' }] },
  espacios: { nuevo: 'Nuevo espacio', editar: 'Editar espacio', campos: [
    { k: 'icono', l: 'Ícono (un emoji)', t: 'text', def: '📦', half: 1 }, { k: 'nombre', l: 'Nombre', t: 'text', req: 1, half: 1, ph: 'Terraza, bodega…' }] }
};

const optsOf = o => Array.isArray(o) ? o.map(x => [x, x]) : Object.entries(o);
function campoHTML(c, v) {
  const val = v[c.k] ?? '';
  let inp;
  switch (c.t) {
    case 'textarea': inp = `<textarea name="${c.k}" rows="2">${esc(val)}</textarea>`; break;
    case 'select': inp = `<select name="${c.k}">${optsOf(c.opts).map(([k, l]) => opt(k, l, val)).join('')}</select>`; break;
    case 'espacio': inp = `<select name="${c.k}">${espacios().map(e => opt(e.id, e.icono + ' ' + e.nombre, val)).join('')}</select>`; break;
    case 'persona': inp = `<select name="${c.k}">${[...cfg.nombres, ...(c.ambos ? ['Ambos'] : [])].map(n => opt(n, n, val)).join('')}</select>`; break;
    case 'proyecto': inp = `<select name="${c.k}"><option value="">Ninguno</option>${list('proyectos').map(p => opt(p.id, p.nombre, val)).join('')}</select>`; break;
    default:
      inp = `<input name="${c.k}" type="${c.t}" value="${esc(val)}" ${c.t === 'number' ? 'inputmode="decimal" step="any" min="0"' : ''} ${c.req ? 'required' : ''} placeholder="${esc(c.ph || '')}">`;
  }
  return `<label class="f" ${c.show ? `data-show="${c.show}"` : ''}>${esc(c.l)}${inp}</label>`;
}
function camposHTML(campos, v) {
  let out = '', buf = [];
  campos.forEach(c => {
    if (c.half) { buf.push(campoHTML(c, v)); if (buf.length === 2) { out += `<div class="two">${buf.join('')}</div>`; buf = []; } }
    else { if (buf.length) { out += buf.join(''); buf = []; } out += campoHTML(c, v); }
  });
  return out + buf.join('');
}

/** "Agregado por Yael el 5 oct. Último cambio: Camilo, 7 oct." */
function autoria(o) {
  const f = ms => fechaCorta(iso(new Date(ms)));
  const partes = [];
  if (o.por) partes.push(`Agregado por ${esc(o.por)}${o.creado ? ' el ' + f(o.creado) : ''}.`);
  if (o.modPor && o.mod && o.mod !== o.creado) partes.push(`Último cambio: ${esc(o.modPor)}, ${f(o.mod)}.`);
  return partes.length ? `<p class="hint">${partes.join(' ')}</p>` : '';
}

function openForm(col, obj, preset = {}) {
  const F = FORMS[col], v = obj ? { ...obj } : {};
  if (!obj) {
    F.campos.forEach(c => { if (c.def !== undefined) v[c.k] = typeof c.def === 'function' ? c.def() : c.def; });
    v.espacio = S.espacio || (S.filtro !== 'todos' ? S.filtro : (get('espacios', 'general') ? 'general' : (espacios()[0] || {}).id));
    Object.assign(v, preset);
  }
  openSheet(`<form id="frm" onsubmit="A.guardar(event,'${col}','${obj ? obj.id : ''}')" onchange="A.frmShow()" novalidate>
    <h2>${obj ? F.editar : F.nuevo}</h2>${obj ? autoria(obj) : ''}${camposHTML(F.campos, v)}
    <div class="acts">${obj ? `<button type="button" class="ghost bad" onclick="A.borrar('${col}','${obj.id}')">Eliminar</button>` : ''}
    <span class="sp"></span><button type="button" class="ghost" onclick="closeSheet()">Cancelar</button><button class="pri">Guardar</button></div></form>`);
  window.A.frmShow();
}

export { FORMS, openForm };
