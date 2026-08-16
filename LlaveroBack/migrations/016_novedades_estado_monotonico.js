'use strict';

/**
 * Soporta transiciones de estado monótonas para `novedades`
 * (abierta → en_revision → resuelta, nunca hacia atrás) con trazabilidad de
 * quién hizo cada transición: hasta ahora el `estado` se podía mover
 * libremente en cualquier dirección (incluso resuelta → abierta) sin dejar
 * rastro de quién lo cambió — la validación de "no retroceder" vive en
 * `novedad.service.js#actualizarEstado`, esta migración solo agrega las
 * columnas de auditoría que necesita para registrar quién y cuándo.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE novedades
      ADD COLUMN en_revision_por text NULL,
      ADD COLUMN en_revision_en timestamptz NULL,
      ADD COLUMN resuelto_por text NULL
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE novedades
      DROP COLUMN IF EXISTS en_revision_por,
      DROP COLUMN IF EXISTS en_revision_en,
      DROP COLUMN IF EXISTS resuelto_por
  `);
};
