'use strict';

/**
 * Ajusta la guarda de duplicado de `registros_llaves` para permitir varios
 * registros del mismo docente+salón+día siempre que sean franjas horarias
 * distintas (ej. clase de 07:00-10:00 y clase de 10:00-12:00 en la misma
 * aula) — antes de este cambio, `agruparClasesConsecutivas` (llave.domain.js)
 * fusionaba esas clases consecutivas en un solo registro con horario
 * combinado para no violar `ux_registros_llaves_dedupe_dia`. Ahora se generan
 * varios registros encadenados (uno por clase original, con cierre/apertura
 * automático en el límite de cada clase — ver `construirRegistrosPrestamo`),
 * y la guarda de duplicado real pasa a ser docente+salón+día+horario: sigue
 * bloqueando una entrega repetida para la MISMA franja, pero ya no bloquea
 * dos franjas distintas del mismo día.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw('DROP INDEX IF EXISTS ux_registros_llaves_dedupe_dia');
  await knex.raw(`
    CREATE UNIQUE INDEX ux_registros_llaves_dedupe_dia_horario
      ON registros_llaves (comunidad_id, salon_id, dia_entrega, horario) WHERE deleted_at IS NULL
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS ux_registros_llaves_dedupe_dia_horario');
  await knex.raw(`
    CREATE UNIQUE INDEX ux_registros_llaves_dedupe_dia
      ON registros_llaves (comunidad_id, salon_id, dia_entrega) WHERE deleted_at IS NULL
  `);
};
