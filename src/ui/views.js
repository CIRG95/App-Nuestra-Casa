// Pantallas: Inicio, Espacio, Inventario, Compras, Tareas, Proyectos y Gastos.
// Solo LEEN datos (vía core/dominio.js); para cambiar algo llaman a window.A (actions.js).
import { $, esc, clp, hoy, MESES, fechaLarga, fechaCorta, diasHasta, num } from '../core/utils.js';
import { cfg, yo, ESTADOS, ORDEN_ESTADO, CATEGORIAS, CUENTAS } from '../core/config.js';
import { list, get, espacios, esp, stockBajo, gastosDelMes, cuentasDelMes } from '../core/dominio.js';
import { db } from '../services/dbInterface.js';
import { S, enFiltro } from './state.js';
import { ICON, TABS, sec, group, seg, rowInv, rowCompra, rowTarea, rowProyecto, rowGasto, progresoSemanal, who } from './components.js';
import { actividad } from '../services/actividadService.js';

const ETIQUETA_ESTADO = { local: 'Solo este teléfono', conectando: 'Sincronizando…', nube: 'Sincronizado', offline: 'Sin conexión', 'sin-sesion': 'Toca para sincronizar', error: 'Error al sincronizar' };
/** Insignia de sincronización del encabezado. */
function pintarEstado(s) {
  const el = $('#sync'); if (!el) return;
  el.className = 'sync s-' + s; el.textContent = ETIQUETA_ESTADO[s] || s;
}

let rq = 0;
function scheduleRender() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }

function render() {
  const ae = document.activeElement;
  const keep = ae && ae.id && ae.closest && ae.closest('#main') ? { id: ae.id, v: ae.value, s: ae.selectionStart } : null;

  $('#nav').innerHTML = TABS.map(([k, l]) =>
    `<button class="${S.tab === k && !S.espacio ? 'on' : ''}" onclick="A.tab('${k}')" aria-label="${l}" title="${l}">${ICON[k]}<span class="lbl">${l}</span></button>`).join('');
  const enInicio = S.tab === 'inicio' && !S.espacio, nuevas = actividad.noLeidas();
  $('#bell').hidden = !enInicio;
  $('#bell').setAttribute('aria-label', nuevas ? `Novedades: ${nuevas} sin ver` : 'Novedades');
  $('#bell-n').textContent = nuevas > 9 ? '9+' : nuevas;
  $('#bell-n').hidden = !nuevas;
  $('#chips').innerHTML = (S.tab !== 'inicio' && !S.espacio) ? chipsHTML() : '';
  $('#main').innerHTML = bannerSesion() + (S.espacio ? vEspacio() : VIEWS[S.tab]());
  const fab = { inventario: ['inventario', 'Producto'], tareas: ['tareas', 'Tarea'], proyectos: ['proyectos', 'Proyecto'], gastos: ['gastos', 'Gasto'] }[S.tab];
  $('#fab').innerHTML = fab && !S.espacio ? `<button class="fab" onclick="A.nuevo('${fab[0]}')">${ICON.plus}${fab[1]}</button>` : '';

  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (e) { /* inputs sin selección */ } }
  }
}

function bannerSesion() {
  if (db.estado() !== 'sin-sesion') return '';
  return `<div class="banner"><span>El acceso a Google expiró. Tus cambios quedan guardados aquí y se suben al sincronizar.</span><button class="pri" onclick="A.login()">Sincronizar</button></div>`;
}

function chipsHTML() {
  if (S.tab === 'gastos') {   // v0.2: en Gastos se filtra por categoría, no por espacio
    const cats = ['todas', ...CATEGORIAS];
    return `<div class="chips">${cats.map(c => `<button class="chip ${S.filtroCat === c ? 'on' : ''}" onclick="A.filtroCat('${esc(c)}')">${c === 'todas' ? 'Todas' : esc(c)}</button>`).join('')}</div>`;
  }
  const items = [{ id: 'todos', icono: '', nombre: 'Todos' }, ...espacios()];
  return `<div class="chips">${items.map(e =>
    `<button class="chip ${S.filtro === e.id ? 'on' : ''}" onclick="A.filtro('${e.id}')">${e.icono ? e.icono + ' ' : ''}${esc(e.nombre)}</button>`).join('')}</div>`;
}

const byProx = (a, b) => (a.proxima || '9999').localeCompare(b.proxima || '9999');

function vInicio() {
  const h = hoy();
  const tareas = list('tareas').filter(t => !t.hecha && t.proxima && diasHasta(t.proxima) <= 0).sort(byProx);
  const vence = list('inventario').filter(i => i.vence && diasHasta(i.vence) <= 7 && num(i.cantidad) > 0).sort((a, b) => a.vence.localeCompare(b.vence));
  const bajo = list('inventario').filter(i => stockBajo(i) && !(i.vence && diasHasta(i.vence) <= 7));
  const pendCompras = list('compras').filter(c => !c.comprado).length;
  const gm = gastosDelMes(h.slice(0, 7));
  const cm = cuentasDelMes(h.slice(0, 7));
  const totalMes = gm.reduce((a, g) => a + num(g.monto), 0);

  const nBajo = list('inventario').filter(stockBajo).length;
  const fecha = fechaLarga(h);
  let out = `<section class="hero"><p>${esc(fecha[0].toUpperCase() + fecha.slice(1))}</p><h1>Hola, ${esc(yo())}</h1></section>
    <div class="imanes">
      <button class="iman m1" onclick="A.tab('tareas')"><b>${tareas.length}</b><span>${tareas.length === 1 ? 'tarea hoy' : 'tareas hoy'}</span></button>
      <button class="iman m2" onclick="A.irInventario('vence')"><b>${vence.length}</b><span>${vence.length === 1 ? 'vence pronto' : 'vencen pronto'}</span></button>
      <button class="iman m3" onclick="A.irInventario('bajo')"><b>${nBajo}</b><span>${nBajo === 1 ? 'se acaba' : 'se acaban'}</span></button>
    </div>` + progresoSemanal();
  if (!tareas.length && !vence.length && !bajo.length) {
    out += `<p class="calm">Todo al día. No hay tareas atrasadas, nada vence esta semana y no falta nada en el inventario.</p>`;
  }
  if (tareas.length) out += sec('Tareas para hoy', tareas.length) + group(tareas.map(t => rowTarea(t)), '');
  if (vence.length) out += sec('Vence pronto', vence.length) + group(vence.map(i => rowInv(i)), '');
  if (bajo.length) out += sec('Se está acabando', bajo.length) + group(bajo.map(i => rowInv(i)), '');

  out += `<button class="linkrow" onclick="A.tab('compras')"><span>Lista de compras</span><b>${pendCompras ? pendCompras + ' pendientes' : 'Vacía'}</b></button>`;
  out += `<button class="linkrow" onclick="A.tab('gastos')"><span>Gastos de ${MESES[Number(h.slice(5, 7)) - 1]}${cm.sinPagar ? `<small class="rojo">${cm.sinPagar} ${cm.sinPagar === 1 ? 'cuenta sin pagar' : 'cuentas sin pagar'}</small>` : cm.filas.length ? '<small class="verde">Cuentas al día</small>' : ''}</span><b>${clp(totalMes)}</b></button>`;

  out += sec('Espacios', null, "A.nuevo('espacios')");
  out += `<div class="tiles">${espacios().map((e, idx) => {
    const inv = list('inventario').filter(i => i.espacio === e.id).length;
    const tar = list('tareas').filter(t => t.espacio === e.id && !t.hecha && t.proxima && diasHasta(t.proxima) <= 7).length;
    const alertas = list('inventario').filter(i => i.espacio === e.id && ((i.vence && diasHasta(i.vence) <= 7) || stockBajo(i))).length
      + list('tareas').filter(t => t.espacio === e.id && !t.hecha && t.proxima && diasHasta(t.proxima) < 0).length;
    return `<button class="tile t${idx % 8}" onclick="A.verEspacio('${e.id}')"><span class="e">${e.icono}</span><span class="n">${esc(e.nombre)}</span>
      <span class="c">${inv} ${inv === 1 ? 'producto' : 'productos'}</span>
      <span class="c">${tar} ${tar === 1 ? 'tarea' : 'tareas'} esta semana</span>
      ${alertas ? `<span class="c al">${alertas} por revisar</span>` : ''}</button>`;
  }).join('')}</div>`;
  return out;
}

function vEspacio() {
  const e = esp(S.espacio), f = o => o.espacio === e.id, p = `{espacio:'${e.id}'}`;
  const tareas = list('tareas').filter(t => f(t) && !t.hecha).sort(byProx);
  const inv = list('inventario').filter(f).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const compras = list('compras').filter(c => f(c) && !c.comprado);
  const proys = list('proyectos').filter(x => f(x) && x.estado !== 'listo');
  let out = `<button class="back" onclick="history.back()">${ICON.back}Volver</button>
    <div class="esp-h"><span>${e.icono}</span><h1>${esc(e.nombre)}</h1></div>`;
  out += sec('Tareas', tareas.length, `A.nuevo('tareas',${p})`) + group(tareas.map(t => rowTarea(t, false)), 'Sin tareas pendientes en este espacio.');
  out += sec('Inventario', inv.length, `A.nuevo('inventario',${p})`) + group(inv.map(i => rowInv(i, false)), 'Aún no hay productos registrados aquí.');
  out += sec('Por comprar', compras.length, `A.nuevo('compras',${p})`) + group(compras.map(c => rowCompra(c, false)), 'Nada pendiente de comprar para este espacio.');
  out += sec('Proyectos', proys.length, `A.nuevo('proyectos',${p})`) + group(proys.map(x => rowProyecto(x, false)), 'Sin proyectos activos.');
  out += `<div class="acts"><button class="ghost" onclick="A.editar('espacios','${e.id}')">Editar espacio</button></div>`;
  return out;
}

function agrupaPorEspacio(items, rowFn) {
  if (S.filtro !== 'todos') return group(items.map(x => rowFn(x, false)), '');
  const grupos = {};
  items.forEach(x => { (grupos[x.espacio] = grupos[x.espacio] || []).push(x); });
  const orden = espacios().map(e => e.id).concat(Object.keys(grupos).filter(k => !get('espacios', k)));
  return orden.filter(k => grupos[k]).map(k => {
    const e = esp(k);
    return `<h2 class="sec">${e.icono} ${esc(e.nombre)} <span class="n">${grupos[k].length}</span></h2>${group(grupos[k].map(x => rowFn(x, false)), '')}`;
  }).join('');
}

function vInventario() {
  let items = list('inventario').filter(enFiltro);
  const nVence = items.filter(i => i.vence && diasHasta(i.vence) <= 7).length;
  const nBajo = items.filter(stockBajo).length;
  if (S.invVista === 'vence') items = items.filter(i => i.vence).sort((a, b) => a.vence.localeCompare(b.vence));
  else if (S.invVista === 'bajo') items = items.filter(stockBajo);
  items.sort((a, b) => S.invVista === 'vence' ? 0 : a.nombre.localeCompare(b.nombre));
  let out = seg([['todo', 'Todo'], ['vence', `Vencimientos${nVence ? ' (' + nVence + ')' : ''}`], ['bajo', `Queda poco${nBajo ? ' (' + nBajo + ')' : ''}`]], S.invVista, 'A.invVista');
  if (!items.length) {
    return out + `<p class="calm" style="margin-top:12px">${S.invVista === 'todo' ? 'Registra lo que tienen en casa con el botón Producto. Si le pones fecha de vencimiento, aparecerá en Inicio una semana antes.' : 'Nada en esta lista.'}</p>`;
  }
  if (S.invVista === 'vence') return out + `<div style="margin-top:12px">${group(items.map(i => rowInv(i)), '')}</div>`;
  return out + agrupaPorEspacio(items, rowInv);
}

function vCompras() {
  const todas = list('compras').filter(enFiltro);
  const pend = todas.filter(c => !c.comprado).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const carro = todas.filter(c => c.comprado);
  let out = `<form class="quick" onsubmit="A.quickCompra(event)"><input id="qc" placeholder="Agregar, por ejemplo: 2 leche" autocomplete="off" enterkeyhint="done" aria-label="Agregar a la lista"><button class="pri">Agregar</button></form>`;
  out += `<p class="hint" style="margin:4px 2px 0">Toca el cuadro cuando lo eches al carro. Al terminar, usa Finalizar compra.</p>`;
  if (!pend.length && !carro.length) return out + `<p class="calm" style="margin-top:14px">La lista está vacía. Lo que escriban aquí lo ven los dos.</p>`;
  out += pend.length ? agrupaPorEspacio(pend, rowCompra) : `<p class="calm" style="margin-top:14px">Todo lo de la lista está en el carro.</p>`;
  if (carro.length) {
    out += `<h2 class="sec">En el carro <span class="n">${carro.length}</span></h2>${group(carro.map(c => rowCompra(c)), '')}
      <div class="acts"><button class="pri" onclick="A.finalizar()">Finalizar compra</button></div>`;
  }
  return out;
}

function vTareas() {
  let items = list('tareas').filter(enFiltro);
  if (S.tarVista === 'mias') items = items.filter(t => t.asignado === yo() || t.asignado === 'Ambos');
  const abiertas = items.filter(t => !t.hecha);
  const g = { atr: [], hoy: [], sem: [], luego: [], sin: [] };
  abiertas.forEach(t => {
    if (!t.proxima) return g.sin.push(t);
    const d = diasHasta(t.proxima);
    (d < 0 ? g.atr : d === 0 ? g.hoy : d <= 7 ? g.sem : g.luego).push(t);
  });
  Object.values(g).forEach(a => a.sort(byProx));
  const hechas = items.filter(t => t.hecha).sort((a, b) => (b.ultima || '').localeCompare(a.ultima || '')).slice(0, 10);
  let out = progresoSemanal() + seg([['todas', 'Todas'], ['mias', `Mías y compartidas`]], S.tarVista, 'A.tarVista');
  if (!items.length) return out + `<p class="calm" style="margin-top:12px">Agrega tareas únicas o que se repiten, como cambiar sábanas cada semana o limpiar el filtro de la lavadora cada 3 meses. Al marcarla hecha, la próxima fecha se calcula sola.</p>`;
  [['atr', 'Atrasadas'], ['hoy', 'Hoy'], ['sem', 'Próximos 7 días'], ['luego', 'Más adelante'], ['sin', 'Sin fecha']].forEach(([k, l]) => {
    if (g[k].length) out += sec(l, g[k].length) + group(g[k].map(t => rowTarea(t)), '');
  });
  if (hechas.length) out += sec('Hechas', null) + group(hechas.map(t => rowTarea(t)), '');
  return out;
}

function vProyectos() {
  const items = list('proyectos').filter(enFiltro).sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || a.nombre.localeCompare(b.nombre));
  if (!items.length) return `<p class="calm">Anoten aquí los arreglos y mejoras de la casa: pintar el dormitorio, armar un mueble, arreglar la llave del baño. Cada proyecto puede tener pasos y gastos asociados.</p>`;
  const out = [];
  Object.keys(ESTADOS).sort((a, b) => ORDEN_ESTADO[a] - ORDEN_ESTADO[b]).forEach(k => {
    const xs = items.filter(p => p.estado === k);
    if (xs.length) out.push(sec(ESTADOS[k], xs.length) + group(xs.map(p => rowProyecto(p)), ''));
  });
  return out.join('');
}

/** Gastos de un mes según el periodo que cubren, con el filtro de categoría de la pestaña. */
function gastosMes(ym, conFiltro = true) {
  return gastosDelMes(ym).filter(g => !conFiltro || S.filtroCat === 'todas' || (g.categoria || 'Otros') === S.filtroCat);
}

/** Cuentas básicas del mes: pagadas en verde con monto y quién pagó; sin pagar en rojo. */
function bloqueCuentas(ym) {
  const { filas, pagadas } = cuentasDelMes(ym);
  if (!filas.length) return sec('Cuentas del mes', null, 'A.cuentas()') + `<p class="calm">No hay cuentas básicas. Agrégalas para ver cada mes cuáles están pagadas.</p>`;
  const rows = filas.map(({ s, pagos, total, pagada }) => {
    const nombre = `<span class="t">${s.icono} ${esc(s.nombre)}</span>${s.proveedor ? `<span class="prov">${esc(s.proveedor)}</span>` : ''}`;
    if (!pagada) return `<div class="row cuenta sinpagar">
      <div class="row-main" style="cursor:default">${nombre}<span class="s"><span class="tag bad">Sin pagar</span></span></div>
      <button class="mini rojo" onclick="A.pagarCuenta('${s.id}')">Marcar pagada</button></div>`;
    const ult = pagos[0];
    return `<div class="row cuenta pagada">
      <button class="row-main" onclick="A.editar('gastos','${ult.id}')">${nombre}
        <span class="s"><span class="tag ok">Pagada</span>${who(ult.pagadoPor)}${ult.fecha ? `<span>${fechaCorta(ult.fecha)}</span>` : ''}${pagos.length > 1 ? `<span>${pagos.length} pagos</span>` : ''}${ult.division === 'personal' ? '<span class="tag">Personal</span>' : ''}</span>
      </button><span class="amount">${clp(total)}</span></div>`;
  });
  const nombreMes = MESES[Number(ym.slice(5, 7)) - 1];
  return `<h2 class="sec" title="Cuentas de ${nombreMes}">Cuentas <span class="n ${pagadas === filas.length ? 'verde' : 'rojo'}" style="white-space:nowrap">${pagadas} de ${filas.length} pagadas</span><button class="add" onclick="A.cuentas()">Editar</button></h2>
    <div class="group">${rows.join('')}</div>`;
}

function vGastos() {
  const [y, m] = S.mes.split('-').map(Number);
  const orden = (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || 0) - (a.creado || 0);
  const gs = gastosMes(S.mes).sort(orden);
  const todas = S.filtroCat === 'todas';
  const total = gs.reduce((a, g) => a + num(g.monto), 0);
  let out = `<div class="month"><button class="icon-btn" onclick="A.mes(-1)" aria-label="Mes anterior">${ICON.prev}</button><b>${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}</b><button class="icon-btn" onclick="A.mes(1)" aria-label="Mes siguiente">${ICON.next}</button></div>`;
  out += `<p class="total">${clp(total)}</p><p class="total-l">${gs.length} ${gs.length === 1 ? 'gasto' : 'gastos'}${todas ? '' : ' en ' + esc(S.filtroCat)}</p>`;

  // Balance entre los dos: todo el mes, solo gastos compartidos, mitad y mitad
  if (todas) {
    const [a, b] = cfg.nombres;
    const comp = gs.filter(g => g.division !== 'personal');
    const pa = comp.filter(g => g.pagadoPor === a).reduce((s, g) => s + num(g.monto), 0);
    const pb = comp.filter(g => g.pagadoPor === b).reduce((s, g) => s + num(g.monto), 0);
    const dif = (pa - pb) / 2;
    if (comp.length) {
      out += `<div class="balance"><p><b>${Math.abs(dif) < 1 ? 'Están a mano este mes' : `${esc(dif > 0 ? b : a)} le debe ${clp(Math.abs(dif))} a ${esc(dif > 0 ? a : b)}`}</b></p>
        <p class="d">${esc(a)} pagó ${clp(pa)} y ${esc(b)} pagó ${clp(pb)} en gastos compartidos.</p></div>`;
    }
  }

  const conCuentas = todas || S.filtroCat === CUENTAS;
  if (conCuentas) out += bloqueCuentas(S.mes);

  // Lo que ya aparece en "Cuentas del mes" no se repite abajo
  const resto = conCuentas ? gs.filter(g => !(g.categoria === CUENTAS && g.servicio && get('servicios', g.servicio))) : gs;
  if (!gs.length && !conCuentas) return out + `<p class="calm">Sin gastos de ${esc(S.filtroCat)} en este mes.</p>`;
  if (!gs.length) return out + `<p class="calm" style="margin-top:12px">Sin otros gastos este mes. Registra compras, arriendo y arreglos con el botón Gasto.</p>`;

  if (todas) {
    const porCat = {};
    gs.forEach(g => { porCat[g.categoria || 'Otros'] = (porCat[g.categoria || 'Otros'] || 0) + num(g.monto); });
    const max = Math.max(...Object.values(porCat));
    out += sec('Por categoría', null) + `<div class="group">${Object.entries(porCat).sort((x, z) => z[1] - x[1]).map(([k, v]) =>
      `<button class="cat" onclick="A.filtroCat('${esc(k)}')"><span>${esc(k)}</span><b>${clp(v)}</b><span class="bar"><i style="width:${max ? v / max * 100 : 0}%"></i></span></button>`).join('')}</div>`;
  }

  // Detalle agrupado por categoría, en el orden de la lista de categorías
  const grupos = {};
  resto.forEach(g => { (grupos[g.categoria || 'Otros'] = grupos[g.categoria || 'Otros'] || []).push(g); });
  const ordenCat = [...CATEGORIAS, ...Object.keys(grupos).filter(k => !CATEGORIAS.includes(k))];
  ordenCat.filter(k => grupos[k]).forEach(k => {
    const sub = grupos[k].reduce((a, g) => a + num(g.monto), 0);
    out += `<h2 class="sec">${esc(k)} <span class="n">${clp(sub)}</span></h2>${group(grupos[k].map(g => rowGasto(g, false)), '')}`;
  });
  return out;
}

const VIEWS = { inicio: vInicio, inventario: vInventario, compras: vCompras, tareas: vTareas, proyectos: vProyectos, gastos: vGastos };

export { render, scheduleRender, pintarEstado, gastosMes };
