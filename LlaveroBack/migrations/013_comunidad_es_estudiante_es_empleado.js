'use strict';

/**
 * Prepara `comunidad` para el ETL institucional que sincronizará la
 * comunidad universitaria completa desde 2 sistemas fuente independientes
 * (estudiantes y empleados/RRHH). Una misma persona puede ser estudiante Y
 * empleado a la vez, y el sistema de empleados no indica quién es docente
 * (eso se deriva cruzando contra `programaciones.docente_id`).
 *
 * `comunidad.tipo` deja de ser la única fuente de verdad: se agregan dos
 * flags booleanos independientes, uno por fuente de sincronización.
 * `tipo` (columna + CHECK `comunidad_tipo_check`) NO se elimina — se
 * mantiene por compatibilidad con el resto del código que ya la usa
 * (frontend, `crearPersona` manual, `upsertOne`/`upsertMany` genéricos). Para
 * las filas gestionadas por los sync nuevos, el repositorio recalcula `tipo`
 * en cada lectura (docente > empleado > estudiante) en vez de confiar en el
 * valor crudo de esta columna.
 *
 * Backfill: los docentes ya existentes (creados por el fallback de
 * importación de Excel en `programacion.service.js`, o manualmente) se
 * tratan como empleados desde ahora, ya que "docente" pasa a ser un estado
 * derivado y no una fuente de dato propia.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE comunidad
      ADD COLUMN es_estudiante boolean NOT NULL DEFAULT false,
      ADD COLUMN es_empleado boolean NOT NULL DEFAULT false
  `);

  await knex.raw(`
    UPDATE comunidad SET
      es_estudiante = (tipo = 'estudiante'),
      es_empleado = (tipo IN ('empleado', 'docente'))
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE comunidad
      DROP COLUMN es_estudiante,
      DROP COLUMN es_empleado
  `);
};
