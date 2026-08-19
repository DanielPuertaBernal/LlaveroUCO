'use strict';

/**
 * El Excel de programación trae en la hoja pivote "DATOS TABLA" un grupo
 * TIPO='COLEGIO' (clases del Colegio Mauj dictadas en aulas de la
 * universidad) que no existe en ninguna otra hoja. Ocupan aula física real
 * (deben contar para el cálculo de ocupación), pero a diferencia de una
 * clase normal no se les debe entregar llave directamente al docente
 * registrado — son solo indicativas de que el aula está ocupada por el
 * colegio. Se agrega un flag en la base, igual patrón que `es_intensivo`
 * (ver 019_programaciones_es_intensivo.js).
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE programaciones
      ADD COLUMN sin_entrega_llave boolean NOT NULL DEFAULT false
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE programaciones DROP COLUMN IF EXISTS sin_entrega_llave');
};
