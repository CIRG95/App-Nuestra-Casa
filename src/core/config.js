// Constantes del dominio y configuración de ESTE teléfono (localStorage 'casa.cfg', no se sincroniza).
import { load, save } from './utils.js';
const VERSION = '0.2';
const COLS = ['espacios', 'inventario', 'compras', 'tareas', 'proyectos', 'gastos', 'actividad', 'servicios'];
const DEF_ESPACIOS = [
  ['cocina', '🍳', 'Cocina'], ['despensa', '🥫', 'Despensa'], ['bano', '🛁', 'Baño'],
  ['dormitorio', '🛏️', 'Dormitorio'], ['living', '🛋️', 'Living'], ['lavanderia', '🧺', 'Lavandería'],
  ['patio', '🌿', 'Patio'], ['general', '🏠', 'General']
];
const CUENTAS = 'Cuentas básicas';
/** Cuentas básicas iniciales: [id, ícono, nombre]. El proveedor lo completa cada hogar. */
const DEF_SERVICIOS = [
  ['luz', '💡', 'Luz'], ['agua', '💧', 'Agua'], ['gas', '🔥', 'Gas'],
  ['internet', '📶', 'Internet'], ['celular', '📱', 'Celular'], ['comunes', '🏢', 'Gastos comunes']
];
const CATEGORIAS = ['Supermercado', 'Cuentas básicas', 'Arriendo / dividendo', 'Mantención', 'Proyectos', 'Aseo', 'Mascotas', 'Salidas', 'Otros'];
const FRECUENCIAS = {
  una: 'Una vez', diaria: 'Todos los días', semanal: 'Cada semana', quincenal: 'Cada 2 semanas',
  mensual: 'Cada mes', trimestral: 'Cada 3 meses', semestral: 'Cada 6 meses', anual: 'Cada año', dias: 'Cada N días'
};
const ESTADOS = { curso: 'En curso', idea: 'Idea', pausa: 'En pausa', listo: 'Terminado' };
const ORDEN_ESTADO = { curso: 0, idea: 1, pausa: 2, listo: 3 };

const cfg = Object.assign({ yo: '', nombres: ['Camilo', 'Yael'], drive: null, tema: 'sistema' }, load('casa.cfg') || {});
const saveCfg = () => save('casa.cfg', cfg);

const yo = () => cfg.yo || cfg.nombres[0];

export { VERSION, CUENTAS, DEF_SERVICIOS, COLS, DEF_ESPACIOS, CATEGORIAS, FRECUENCIAS, ESTADOS, ORDEN_ESTADO, cfg, saveCfg, yo };
