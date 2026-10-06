// Arranque: une los servicios con la interfaz. Es el único archivo que conoce a todos.
import { $ } from './core/utils.js';
import { cfg, saveCfg, yo } from './core/config.js';
import { db } from './services/dbInterface.js';
import { googleAuth } from './services/googleAuth.js';
import { googleDriveService } from './services/googleDriveService.js';
import { recordatorios } from './services/remindersService.js';
import { actividad } from './services/actividadService.js';
import { render, scheduleRender, pintarEstado } from './ui/views.js';
import { toast } from './ui/sheet.js';
import { aplicarTema } from './ui/tema.js';
import { A } from './ui/actions.js';

// Backend de nube activo. Para pasar a Firebase: importar firestoreService y ponerlo aquí.
const NUBE = googleDriveService;

(async function iniciar() {
  aplicarTema();

  // 1. ¿Volvemos de Google? (el login es por redirección, la página se recargó)
  const retorno = googleAuth.procesarRetorno();
  if (retorno?.error && cfg.drive && !cfg.drive.fileId) { cfg.drive = null; saveCfg(); }

  // 2. Datos: caché local siempre; nube si este teléfono ya está unido a un hogar
  db.on('cambio', scheduleRender);
  db.on('estado', s => { pintarEstado(s); scheduleRender(); });
  recordatorios.iniciar();
  render();
  await db.iniciar({ adaptador: NUBE, autor: yo });
  actividad.iniciar();
  render();

  // 3. Retomar lo que se estaba haciendo antes de ir a Google
  if (retorno?.error) toast(retorno.error);
  else if (retorno?.intencion?.accion === 'crear') A.completarCrear(retorno.intencion.pareja);
  else if (retorno?.intencion?.accion === 'unirse') A.completarUnirse(retorno.intencion);

  if (!cfg.yo) setTimeout(() => { if ($('#modal').hidden) A.ajustes(); }, 300);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* sin SW */ });
})();
