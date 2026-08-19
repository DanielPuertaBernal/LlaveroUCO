'use strict';

/**
 * El Excel de programación trae una hoja "INTENSIVO" (cursos intensivos de
 * 5 semanas, mismas columnas que la hoja principal) que hasta ahora se
 * ignoraba en la importación (`parseExcel` solo leía la primera hoja del
 * workbook). Se decidió NO crear un subtipo nuevo tipo `programaciones_*`
 * (el patrón table-per-type de 004_programacion.js) porque un intensivo es,
 * en todo lo demás, una clase regular más — mismo flujo de detección de
 * fantasmas, mismo cálculo de ocupación, mismo `tipo='regular'` para que el
 * reemplazo atómico en `bulkInsert` (que borra por `tipo='regular'` al
 * reimportar un semestre) siga funcionando sin tocarlo. Solo se necesita
 * distinguirlos en la UI (tab propio "Intensivos"), así que basta un flag
 * en la tabla base.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE programaciones
      ADD COLUMN es_intensivo boolean NOT NULL DEFAULT false
  `);
  await knex.raw(`
    CREATE INDEX idx_programaciones_es_intensivo ON programaciones (es_intensivo)
      WHERE es_intensivo
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_programaciones_es_intensivo');
  await knex.raw('ALTER TABLE programaciones DROP COLUMN IF EXISTS es_intensivo');
};
