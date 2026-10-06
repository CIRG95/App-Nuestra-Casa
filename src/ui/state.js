// Estado de la INTERFAZ en este teléfono (pestaña, filtro, mes visible…). No son datos del hogar.
import { hoy } from '../core/utils.js';

export const S = { tab: 'inicio', filtro: 'todos', espacio: null, mes: hoy().slice(0, 7), invVista: 'todo', tarVista: 'todas', modoAlta: 'crear' };
export const enFiltro = o => S.filtro === 'todos' || o.espacio === S.filtro;
