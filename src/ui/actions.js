// Acciones del usuario (lo que llaman los botones con onclick="A.xxx()").
// Escriben SOLO a través de db (dbInterface); nunca tocan Google directamente,
// salvo el alta del hogar, que orquesta los servicios.
import { $, esc, uid, clean, pad, hoy, relDias, num, norm, clp, fechaCorta } from '../core/utils.js';
import { COLS, cfg, saveCfg, yo, ESTADOS, CUENTAS, VERSION } from '../core/config.js';
import { list, get, espacios, esp, stockBajo, enCompras, siguienteFecha, servicios, nombreServicio } from '../core/dominio.js';
import { db } from '../services/dbInterface.js';
import { googleAuth, redirectUri } from '../services/googleAuth.js';
import { googleDriveService } from '../services/googleDriveService.js';
import { recordatorios as Rec } from '../services/remindersService.js';
import { S } from './state.js';
import { render } from './views.js';
import { FORMS, openForm } from './forms.js';
import { openSheet, closeSheet, confirmar, toast } from './sheet.js';
import { seg, opt, rowGasto, who, haceCuanto } from './components.js';
import { actividad } from '../services/actividadService.js';
import { aplicarTema } from './tema.js';

export const A = {
  tab(k) { S.tab = k; S.espacio = null; render(); window.scrollTo(0, 0); },
  filtro(id) { S.filtro = id; render(); },
  filtroCat(c) { S.filtroCat = c; render(); },
  invVista(k) { S.invVista = k; render(); },
  irInventario(v) { S.invVista = v; S.filtro = 'todos'; A.tab('inventario'); },
  tarVista(k) { S.tarVista = k; render(); },
  mes(d) { const [y, m] = S.mes.split('-').map(Number); const x = new Date(y, m - 1 + d, 1); S.mes = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; render(); },
  verEspacio(id) { S.espacio = id; history.pushState({ esp: id }, ''); render(); window.scrollTo(0, 0); },

  nuevo(col, preset) { openForm(col, null, preset || {}); },
  editar(col, id) { const o = get(col, id); if (o) openForm(col, o); },
  frmShow() {
    const f = $('#frm'); if (!f) return;
    f.querySelectorAll('[data-show]').forEach(l => {
      const regla = l.dataset.show, neg = regla.includes('!=');
      const [k, val] = regla.split(neg ? '!=' : '=');
      const igual = (f.elements[k] || {}).value === val;
      l.hidden = neg ? igual : !igual;
    });
  },
  guardar(ev, col, id) {
    ev.preventDefault();
    const f = ev.target, F = FORMS[col];
    const visible = c => { const el = f.elements[c.k]; return el && !el.closest('label')?.hidden; };
    for (const c of F.campos) {
      if (c.req && visible(c) && !String(f.elements[c.k].value).trim()) { f.elements[c.k].focus(); return toast(`Falta completar: ${c.l}.`); }
    }
    const o = id ? { ...get(col, id) } : { id: uid() };
    F.campos.forEach(c => {
      const el = f.elements[c.k]; if (!el) return;
      if (!visible(c)) { if (c.show) delete o[c.k]; return; }   // campo que no aplica (p. ej. descripción en una cuenta básica)
      let x = el.value;
      if (c.t === 'switch') x = el.checked ? c.on : c.off;
      else if (c.t === 'number') x = x === '' ? null : num(x);
      else if (typeof x === 'string') x = x.trim();
      o[c.k] = x;
    });
    if (col === 'gastos') {
      if (o.categoria === CUENTAS) { const s = get('servicios', o.servicio); o.descripcion = nombreServicio(s) || 'Cuenta básica'; }
      if (!o.fecha) o.fecha = hoy();          // día en que se registró el pago
      delete o.espacio;
    }
    if (col === 'servicios' && o.orden === undefined) o.orden = list('servicios').length;
    if (col === 'compras' && o.comprado === undefined) o.comprado = false;
    if (col === 'tareas') { if (!id) o.hecha = false; if (o.hecha && o.frecuencia !== 'una') o.hecha = false; }
    if (col === 'espacios' && o.orden === undefined) o.orden = list('espacios').length;
    db.put(col, o); toast('Guardado');
    if (col === 'servicios') return A.cuentas();   // vuelve a la lista de cuentas (mismo panel)
    if (col === 'gastos') S.borrador = null;
    closeSheet();
  },
  async borrar(col, id) {
    const o = get(col, id); if (!o) return;
    let msg = '¿Eliminar este registro? Se borra para los dos.';
    if (col === 'servicios') msg = `¿Eliminar la cuenta ${o.nombre}? Los pagos ya registrados se mantienen. Si solo dejaron de pagarla, mejor apaga "Se paga todos los meses".`;
    if (col === 'espacios') {
      const n = ['inventario', 'compras', 'tareas', 'proyectos', 'gastos'].reduce((a, c) => a + list(c).filter(x => x.espacio === id).length, 0);
      msg = `¿Eliminar el espacio ${o.nombre}?` + (n ? ` Sus ${n} registros quedarán como “Sin espacio”.` : '');
    }
    if (!(await confirmar(msg))) return;
    db.remove(col, id);
    if (col === 'servicios') { A.cuentas(); return toast('Cuenta eliminada', { label: 'Deshacer', fn: () => db.put(col, o) }); }
    closeSheet();
    if (col === 'espacios' && S.espacio === id) { S.espacio = null; }
    toast('Eliminado', { label: 'Deshacer', fn: () => db.put(col, o) });
  },

  /* Inventario */
  cant(id, d) {
    const i = get('inventario', id); if (!i) return;
    const n = { ...i, cantidad: Math.max(0, Math.round((num(i.cantidad) + d) * 100) / 100) };   // sin mutar: la actividad compara con el valor previo
    db.put('inventario', n);
    if (stockBajo(n) && !enCompras(i.nombre)) toast(`Queda poco de ${i.nombre}`, { label: 'A compras', fn: () => A.aCompras(id) });
  },
  aCompras(id) {
    const i = get('inventario', id); if (!i) return;
    if (enCompras(i.nombre)) return toast(`${i.nombre} ya está en la lista.`);
    db.put('compras', { id: uid(), nombre: i.nombre, cantidad: 1, unidad: i.unidad || '', espacio: i.espacio, comprado: false, invId: i.id });
    toast(`${i.nombre} agregado a compras`);
  },

  /* Compras */
  quickCompra(ev) {
    ev.preventDefault();
    const inp = $('#qc'); let txt = inp.value.trim(); if (!txt) return;
    inp.value = '';
    let cantidad = 1, unidad = '';
    const m = txt.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|lts|ml|un|u|cc)?\.?\s+(.+)$/i);
    if (m) { cantidad = num(m[1]); unidad = m[2] || ''; txt = m[3]; }
    const nombre = txt[0].toUpperCase() + txt.slice(1);
    if (enCompras(nombre)) return toast(`${nombre} ya está en la lista.`);
    const inv = list('inventario').find(i => norm(i.nombre) === norm(nombre));
    const espacio = S.filtro !== 'todos' ? S.filtro : inv ? inv.espacio : (get('espacios', 'despensa') ? 'despensa' : 'general');
    db.put('compras', { id: uid(), nombre, cantidad, unidad: unidad || (inv && inv.unidad) || '', espacio, comprado: false, invId: inv ? inv.id : null });
  },
  toggleCompra(id) { const c = get('compras', id); if (!c) return; db.put('compras', { ...c, comprado: !c.comprado }); },
  finalizar() {
    const items = list('compras').filter(c => c.comprado);
    if (!items.length) return;
    openSheet(`<h2>Finalizar compra</h2>
      <p class="hint">Lo marcado pasa al inventario. Si tiene fecha de vencimiento, anótala y aparecerá en Inicio antes de vencer.</p>
      <div>${items.map(c => `<div class="finrow"><label><input type="checkbox" data-inv="${c.id}" checked>${esc(c.nombre)}</label>
        <input type="date" data-vence="${c.id}" aria-label="Vencimiento de ${esc(c.nombre)}"></div>`).join('')}</div>
      <h3>Registrar el gasto</h3>
      <div class="two"><label class="f">Total pagado (CLP)<input type="number" id="finMonto" inputmode="numeric" min="0" placeholder="Opcional"></label>
      <label class="f">Pagó<select id="finPor">${cfg.nombres.map(n => opt(n, n, yo())).join('')}</select></label></div>
      <label class="f">Dónde<input id="finDesc" placeholder="Supermercado"></label>
      <div class="acts"><span class="sp"></span><button class="ghost" onclick="closeSheet()">Cancelar</button><button class="pri" onclick="A.confirmarFin()">Guardar compra</button></div>`);
  },
  confirmarFin() {
    const items = list('compras').filter(c => c.comprado);
    const monto = num($('#finMonto').value);
    let nInv = 0;
    actividad.lote(`finalizó una compra de ${items.length} ${items.length === 1 ? 'producto' : 'productos'}${monto > 0 ? ' por ' + clp(monto) : ''}`, () => {
    items.forEach(c => {
      const aInv = $(`[data-inv="${c.id}"]`)?.checked;
      const vence = $(`[data-vence="${c.id}"]`)?.value || '';
      if (aInv) {
        const ex = (c.invId && get('inventario', c.invId)) || list('inventario').find(i => norm(i.nombre) === norm(c.nombre));
        if (ex) {
          const n = { ...ex, cantidad: num(ex.cantidad) + (num(c.cantidad) || 1) };
          if (vence) n.vence = ex.vence && num(ex.cantidad) > 0 && ex.vence < vence ? ex.vence : vence;
          db.put('inventario', n);
        } else {
          db.put('inventario', { id: uid(), nombre: c.nombre, cantidad: num(c.cantidad) || 1, unidad: c.unidad || '', espacio: c.espacio, minimo: null, vence });
        }
        nInv++;
      }
      db.remove('compras', c.id);
    });
    if (monto > 0) {
      db.put('gastos', { id: uid(), descripcion: $('#finDesc').value.trim() || 'Compra supermercado', monto, fecha: hoy(), periodo: hoy().slice(0, 7),
        categoria: 'Supermercado', pagadoPor: $('#finPor').value, division: 'compartido', proyecto: '' });
    }
    });
    closeSheet();
    toast(`Compra guardada. ${nInv} ${nInv === 1 ? 'producto' : 'productos'} al inventario${monto > 0 ? ' y gasto registrado' : ''}.`);
  },

  /* ---------- Cuentas básicas (v0.2) ---------- */
  /** Lista de cuentas para editar nombre, ícono y proveedor. Si se abre desde el formulario de gasto, guarda lo escrito y lo restaura al volver. */
  cuentas(desdeForm = false) {
    if (desdeForm) {
      const f = $('#frm');
      if (f) {
        const vals = {};
        FORMS.gastos.campos.forEach(c => { const el = f.elements[c.k]; if (el) vals[c.k] = c.t === 'switch' ? (el.checked ? c.on : c.off) : (c.t === 'number' && el.value !== '' ? num(el.value) : el.value); });
        const m = f.getAttribute('onsubmit').match(/'gastos','([^']*)'/);
        S.borrador = { id: m ? m[1] : '', vals };
      }
    }
    const ss = servicios(false);
    openSheet(`<h2>Cuentas básicas</h2>
      <p class="hint">Son las que aparecen en Gastos para marcar como pagadas cada mes. Agrega el proveedor para saber a quién se le paga.</p>
      ${ss.length ? `<div class="group">${ss.map(s => `<div class="list-esp"><span>${s.icono} ${esc(s.nombre)}${s.proveedor ? `<small class="prov">${esc(s.proveedor)}</small>` : ''}${s.activo === false ? '<small class="prov">No se paga ahora</small>' : ''}</span>
        <button class="ghost" onclick="A.editar('servicios','${s.id}')">Editar</button></div>`).join('')}</div>` : '<p class="calm">No hay cuentas. Agrega la primera.</p>'}
      <div class="acts"><button class="ghost" onclick="A.nuevo('servicios')">Agregar cuenta</button><span class="sp"></span>
      <button class="pri" onclick="A.cerrarCuentas()">${S.borrador ? 'Volver al gasto' : 'Listo'}</button></div>`);
  },
  cerrarCuentas() {
    const b = S.borrador;
    if (!b) return closeSheet();
    S.borrador = null;
    const obj = b.id ? get('gastos', b.id) : null;
    openForm('gastos', obj ? { ...obj, ...b.vals } : null, b.vals);
  },
  /** Abre el formulario de gasto ya listo para pagar una cuenta del mes visible. */
  pagarCuenta(servicioId) {
    openForm('gastos', null, { categoria: CUENTAS, servicio: servicioId, periodo: S.mes });
  },

  /* Novedades (campana) */
  novedades() {
    const xs = actividad.recientes();
    const visto = cfg.notifVisto || 0;
    const dia = ms => { const d = new Date(ms), h = new Date(), a = new Date(); a.setDate(h.getDate() - 1);
      return d.toDateString() === h.toDateString() ? 'Hoy' : d.toDateString() === a.toDateString() ? 'Ayer' : d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }); };
    let html = '<h2>Novedades</h2>', ultimo = '';
    if (!xs.length) html += '<p class="calm">Aquí aparece lo que cada uno va haciendo en la casa: tareas completadas, compras, gastos y cambios en el inventario.</p>';
    xs.forEach(x => {
      const d = dia(x.fecha);
      if (d !== ultimo) { html += `${ultimo ? '</div>' : ''}<h3 class="cap">${esc(d)}</h3><div class="group">`; ultimo = d; }
      const nueva = x.quien !== yo() && x.fecha > visto;
      html += `<div class="notif ${nueva ? 'nueva' : ''}"><span class="t">${who(x.quien)} ${esc(x.texto)}</span><span class="h">${haceCuanto(x.fecha)}</span></div>`;
    });
    if (ultimo) html += '</div>';
    html += '<p class="hint" style="margin-top:12px">Los cambios del otro teléfono llegan al sincronizar. Se guardan los últimos 30 días.</p><div class="acts"><span class="sp"></span><button class="pri" onclick="closeSheet()">Listo</button></div>';
    openSheet(html);
    actividad.marcarLeidas(); render();
  },

  /* Tareas */
  hecha(id) {
    const t = get('tareas', id); if (!t) return;
    const prev = clean(t);
    const n = { ...t };
    if (t.hecha) { n.hecha = false; n.proxima = n.proxima || hoy(); db.put('tareas', n); return; }
    const h = hoy();
    n.ultima = h; n.ultimaPor = yo();
    n.historial = [{ fecha: h, por: yo() }, ...(t.historial || [])].slice(0, 20);
    const sig = siguienteFecha(h, t);
    if (sig) n.proxima = sig; else n.hecha = true;
    db.put('tareas', n);
    toast(sig ? `Hecha. Próxima vez: ${relDias(sig)}.` : 'Tarea hecha.', { label: 'Deshacer', fn: () => db.put('tareas', prev) });
  },

  /* Proyectos */
  verProyecto(id) {
    const p = get('proyectos', id); if (!p) return;
    const pasos = p.pasos || [];
    const gastos = list('gastos').filter(g => g.proyecto === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const gastado = gastos.reduce((a, g) => a + num(g.monto), 0), pres = num(p.presupuesto);
    const pct = pres ? Math.min(100, gastado / pres * 100) : 0;
    openSheet(`<h2>${esc(p.nombre)}</h2>
      <p class="hint">${esp(p.espacio).icono} ${esc(esp(p.espacio).nombre)}. ${ESTADOS[p.estado] || ''}${p.fechaMeta ? '. Meta: ' + fechaCorta(p.fechaMeta) : ''}</p>
      <h3>Pasos</h3>
      <ul class="pasos">${pasos.map((s, i) => `<li><button class="check ${s.hecho ? 'on' : ''}" onclick="A.paso('${id}',${i})" aria-label="Marcar paso"></button>
        <span class="${s.hecho ? 'done' : ''}">${esc(s.texto)}</span><button class="x" onclick="A.quitarPaso('${id}',${i})" aria-label="Quitar paso">×</button></li>`).join('')}</ul>
      <form class="quick" onsubmit="A.nuevoPaso(event,'${id}')"><input id="np" placeholder="Agregar paso" autocomplete="off" aria-label="Nuevo paso"><button class="ghost">Agregar</button></form>
      <h3>Plata</h3>
      ${pres ? `<div class="bar ${gastado > pres ? 'over' : ''}"><i style="width:${pct}%"></i></div>` : ''}
      <p style="margin:8px 0">${clp(gastado)} gastado${pres ? ' de ' + clp(pres) + ' presupuestados' : ''}</p>
      ${gastos.length ? `<div class="group">${gastos.map(rowGasto).join('')}</div>` : ''}
      ${p.notas ? `<h3>Notas</h3><p style="white-space:pre-wrap;margin:0">${esc(p.notas)}</p>` : ''}
      <div class="acts"><button class="ghost" onclick="A.nuevo('gastos',{proyecto:'${id}',categoria:'Proyectos'})">Registrar gasto</button>
      <button class="ghost" onclick="A.editar('proyectos','${id}')">Editar</button><span class="sp"></span><button class="pri" onclick="closeSheet()">Listo</button></div>`);
  },
  paso(id, i) { const p = clean(get('proyectos', id)); p.pasos[i].hecho = !p.pasos[i].hecho; db.put('proyectos', p); A.verProyecto(id); },
  quitarPaso(id, i) { const p = clean(get('proyectos', id)); p.pasos.splice(i, 1); db.put('proyectos', p); A.verProyecto(id); },
  nuevoPaso(ev, id) {
    ev.preventDefault();
    const t = $('#np').value.trim(); if (!t) return;
    const p = clean(get('proyectos', id)); p.pasos = [...(p.pasos || []), { texto: t, hecho: false }];
    if (p.estado === 'idea') p.estado = 'curso';
    db.put('proyectos', p); A.verProyecto(id);
    setTimeout(() => $('#np')?.focus(), 30);
  },

  /* Ajustes */
  ajustes() {
    const d = cfg.drive;
    const codigo = d?.fileId ? btoa(JSON.stringify({ c: d.clientId, f: d.fileId, k: d.calendarId })) : '';
    const horas = Array.from({ length: 17 }, (_, i) => i + 6);
    let sync;
    if (!d?.fileId) {
      sync = `<p class="hint" style="margin-top:0">Ahora los datos viven solo en este teléfono. Conecta Google para compartirlos y recibir recordatorios en Google Calendar.</p>
        <div class="seg" style="margin-bottom:12px"><button class="${S.modoAlta !== 'unirse' ? 'on' : ''}" onclick="A.modoAlta('crear')">Crear hogar</button><button class="${S.modoAlta === 'unirse' ? 'on' : ''}" onclick="A.modoAlta('unirse')">Unirme con un código</button></div>
        ${S.modoAlta === 'unirse' ? `
        <label class="f">Código de conexión<textarea id="gcod" rows="3" placeholder="Pídeselo a quien creó el hogar"></textarea></label>
        <div class="acts"><button class="pri" onclick="A.unirse()">Conectar con Google</button></div>` : `
        <label class="f">ID de cliente OAuth de Google<input id="gcid" placeholder="123…apps.googleusercontent.com" autocomplete="off"></label>
        <label class="f">Correo de Google de ${esc(cfg.nombres.find(n => n !== yo()) || 'tu pareja')}<input id="gpareja" type="email" placeholder="nombre@gmail.com"></label>
        <p class="hint">Se crea un archivo en tu Drive y un calendario "Nuestra Casa", y ambos se comparten con ese correo. En Google Cloud, este ID de cliente debe tener como URI de redirección autorizado:</p>
        <code class="k">${esc(redirectUri())}</code>
        <div class="acts"><button class="pri" onclick="A.crearHogar()">Conectar con Google</button></div>`}`;
    } else {
      sync = `<p style="margin:0 0 4px">Conectado como <b>${esc(d.email || '…')}</b>.</p>
        <p class="hint" style="margin:0 0 10px">${db.ultimaSync() ? 'Última sincronización: ' + new Date(db.ultimaSync()).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : 'Aún no sincroniza en esta sesión.'} El acceso a Google dura una hora; al renovarlo la app pasa un momento por Google y vuelve.</p>
        <div class="acts" style="margin-top:0"><button class="pri" onclick="A.login()">Sincronizar ahora</button><button class="ghost bad" onclick="A.desconectar()">Desconectar</button></div>
        <h3>Recordatorios</h3>
        <div class="two"><label class="f">Hora del aviso<select id="ghora" onchange="A.recordatorios()">${horas.map(h => opt(h, pad(h) + ':00', d.hora ?? 9)).join('')}</select></label>
        <label class="f">Avisar vencimientos<select id="gaviso" onchange="A.recordatorios()">${[0, 1, 2, 3, 5, 7].map(n => opt(n, n === 0 ? 'El mismo día' : n === 1 ? '1 día antes' : n + ' días antes', d.aviso ?? 2)).join('')}</select></label></div>
        <p class="hint">Llegan como notificación de Google Calendar a los dos, aunque la app esté cerrada.</p>
        <h3>Compartir con otra persona</h3>
        <div class="quick"><input id="gpareja" type="email" placeholder="nombre@gmail.com" aria-label="Correo"><button class="ghost" onclick="A.compartir()">Compartir</button></div>
        <h3>Código para el otro teléfono</h3>
        <p class="hint">Primero compártele el hogar con su correo. Luego pega este código en Ajustes de su teléfono, en "Unirme con un código".</p>
        <code class="k">${codigo}</code>
        <div class="acts"><button class="ghost" onclick="A.copiarCodigo()">Copiar código</button></div>`;
    }
    openSheet(`<h2>Ajustes</h2>
      <h3>¿Quién usa este teléfono?</h3>
      ${seg(cfg.nombres.map(n => [n, n]), yo(), 'A.soy')}
      <h3>Apariencia en este teléfono</h3>
      ${seg([['sistema', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']], cfg.tema || 'sistema', 'A.tema')}
      <p class="hint" style="margin-top:6px">Cada uno elige el suyo; no cambia el teléfono del otro.</p>
      <h3>Nombres</h3>
      <div class="two"><label class="f">Persona 1<input id="n0" value="${esc(cfg.nombres[0])}"></label><label class="f">Persona 2<input id="n1" value="${esc(cfg.nombres[1])}"></label></div>
      <div class="acts" style="margin-top:0"><button class="ghost" onclick="A.guardarNombres()">Guardar nombres</button></div>
      <h3>Espacios</h3>
      <div class="group">${espacios().map(e => `<div class="list-esp"><span>${e.icono} ${esc(e.nombre)}</span><button class="ghost" onclick="A.editar('espacios','${e.id}')">Editar</button></div>`).join('')}</div>
      <div class="acts"><button class="ghost" onclick="A.nuevo('espacios')">Agregar espacio</button></div>
      <h3>Cuentas básicas</h3>
      <div class="acts" style="margin-top:0"><button class="ghost" onclick="A.cuentas()">Editar cuentas y proveedores</button></div>
      <h3>Google Drive y Calendar</h3>${sync}
      <h3>Respaldo</h3>
      <div class="acts" style="margin-top:0"><button class="ghost" onclick="A.exportar()">Descargar respaldo</button>
      <label class="ghost" style="display:inline-flex;align-items:center">Importar respaldo<input type="file" accept="application/json,.json" hidden onchange="A.importar(this)"></label></div>
      <div class="acts"><span class="hint" style="margin:0">Versión ${VERSION}</span><span class="sp"></span><button class="pri" onclick="closeSheet()">Listo</button></div>`);
  },
  modoAlta(m) { S.modoAlta = m; A.ajustes(); },
  tema(t) { cfg.tema = t; saveCfg(); aplicarTema(); A.ajustes(); },
  soy(n) { cfg.yo = n; saveCfg(); A.ajustes(); render(); },
  guardarNombres() {
    const nuevos = [$('#n0').value.trim() || 'Persona 1', $('#n1').value.trim() || 'Persona 2'];
    const viejos = cfg.nombres.slice();
    nuevos.forEach((n, i) => {
      const v = viejos[i]; if (v === n) return;
      [['tareas', 'asignado'], ['gastos', 'pagadoPor']].forEach(([c, k]) => list(c).filter(o => o[k] === v).forEach(o => db.put(c, { ...o, [k]: n })));
      if (cfg.yo === v) cfg.yo = n;
    });
    cfg.nombres = nuevos; saveCfg(); toast('Nombres guardados'); A.ajustes(); render();
  },
  /* ---------- Alta del hogar (sale a Google y vuelve: ver main.js) ---------- */
  crearHogar() {
    const clientId = $('#gcid').value.trim(), pareja = $('#gpareja').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) return toast('El ID de cliente debe terminar en .apps.googleusercontent.com');
    if (pareja && !pareja.includes('@')) return toast('Revisa el correo de tu pareja.');
    cfg.drive = { clientId, hora: 9, aviso: 2 }; saveCfg();
    googleAuth.iniciarLogin({ clientId, consentimiento: true, intencion: { accion: 'crear', pareja } });
  },
  async completarCrear(pareja) {
    toast('Creando el hogar en tu Drive…');
    try {
      cfg.drive.email = await googleDriveService.quienSoy();
      const calendarId = await Rec.crearCalendario();
      const fileId = await googleDriveService.crearArchivo(db.exportar(), { calendarId });
      Object.assign(cfg.drive, { fileId, calendarId }); saveCfg();
      if (pareja) await A.compartir(pareja);
      await db.conectar(googleDriveService);
      Rec.reprogramarTodo(); await db.sync();
      toast('Hogar creado. Ahora pasa el código al otro teléfono.'); A.ajustes();
    } catch (e) {
      if (!cfg.drive?.fileId) { cfg.drive = null; saveCfg(); }
      toast(e.detalle || e.message);
    }
  },
  unirse() {
    let j;
    try { j = JSON.parse(atob($('#gcod').value.trim())); } catch (e) { return toast('Ese código no es válido. Cópialo completo desde el otro teléfono.'); }
    if (!j.c || !j.f) return toast('Ese código no es válido. Cópialo completo desde el otro teléfono.');
    cfg.drive = { clientId: j.c, hora: 9, aviso: 2 }; saveCfg();
    googleAuth.iniciarLogin({ clientId: j.c, consentimiento: true, intencion: { accion: 'unirse', f: j.f, k: j.k } });
  },
  async completarUnirse({ f, k }) {
    try {
      cfg.drive.email = await googleDriveService.quienSoy();
      await googleDriveService.verificarAcceso(f).catch(() => { throw new Error(`${cfg.drive.email} no tiene acceso al archivo. Pide que lo compartan con ese correo.`); });
      Object.assign(cfg.drive, { fileId: f, calendarId: k }); saveCfg();
      if (k) await Rec.suscribir(k).catch(() => toast('El calendario aún no está compartido contigo. Los datos sí se sincronizan.'));
      await db.conectar(googleDriveService);
      Rec.reprogramarTodo(); await db.sync();
      toast('Conectado'); A.ajustes();
    } catch (e) { cfg.drive = null; saveCfg(); toast(e.detalle || e.message); }
  },
  async compartir(correo) {
    const email = correo || $('#gpareja')?.value.trim();
    if (!email || !email.includes('@')) return toast('Escribe un correo de Google.');
    if (!googleAuth.valido()) return toast('Toca Sincronizar ahora y vuelve a intentar.');
    try {
      await googleDriveService.compartirArchivo(cfg.drive.fileId, email);
      if (cfg.drive.calendarId) await Rec.compartirCalendario(cfg.drive.calendarId, email);
      toast(`Compartido con ${email}`);
    } catch (e) { toast('No se pudo compartir: ' + (e.detalle || e.message)); }
  },
  recordatorios() {
    cfg.drive.hora = Number($('#ghora').value); cfg.drive.aviso = Number($('#gaviso').value); saveCfg();
    Rec.reprogramarTodo(); db.sync(); toast('Recordatorios actualizados');
  },
  syncTap() { if (db.estado() === 'sin-sesion') A.login(); else A.ajustes(); },
  login() {
    if (!cfg.drive?.fileId) return A.ajustes();
    if (googleAuth.valido()) return db.sync();
    db.login();   // navega a Google y vuelve
  },
  async desconectar() {
    if (!await confirmar('¿Desconectar este teléfono? El archivo en Drive y el calendario no se borran; aquí queda una copia local.', 'Desconectar')) return;
    await db.desconectar(); Rec.limpiarCola();
    A.ajustes(); render();
  },
  copiarCodigo() {
    const t = document.querySelector('code.k').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Código copiado'), () => toast('Mantén presionado el código para copiarlo.'));
  },
  exportar() {
    const blob = new Blob([JSON.stringify({ app: 'nuestra-casa', fecha: new Date().toISOString(), data: db.exportar() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `casa-respaldo-${hoy()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importar(input) {
    const f = input.files[0]; if (!f) return;
    f.text().then(async t => {
      const j = JSON.parse(t); const d = j.data || j;
      const n = COLS.reduce((a, c) => a + Object.keys(d[c] || {}).length, 0);
      if (!(await confirmar(`¿Importar ${n} registros? Los que tengan el mismo identificador se reemplazan.`, 'Importar'))) return;
      db.importar(d); toast(`${n} registros importados`); closeSheet();
    }).catch(() => toast('Ese archivo no es un respaldo válido.'));
  }
};

window.A = A;   // los onclick del HTML generado llaman a A.xxx()
