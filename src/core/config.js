// Constantes del dominio y configuración de ESTE teléfono (localStorage 'casa.cfg', no se sincroniza).
import { load, save } from './utils.js';
const COLS = ['espacios', 'inventario', 'compras', 'tareas', 'proyectos', 'gastos', 'actividad'];
const DEF_ESPACIOS = [
  ['cocina', '🍳', 'Cocina'], ['despensa', '🥫', 'Despensa'], ['bano', '🛁', 'Baño'],
  ['dormitorio', '🛏️', 'Dormitorio'], ['living', '🛋️', 'Living'], ['lavanderia', '🧺', 'Lavandería'],
  ['patio', '🌿', 'Patio'], ['general', '🏠', 'General']
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

export { COLS, DEF_ESPACIOS, CATEGORIAS, FRECUENCIAS, ESTADOS, ORDEN_ESTADO, cfg, saveCfg, yo };
