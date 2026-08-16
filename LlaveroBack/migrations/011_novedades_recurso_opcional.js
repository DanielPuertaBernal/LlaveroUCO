'use strict';

/**
 * Relaja `ck_novedades_recurso_exclusivo`: antes exigía exactamente uno de
 * `llave_id`/`equipo_id` no nulo; ahora permite también que ambos sean NULL
 * ("novedad general", ej. reportar un salón/frontón dañado sin que exista
 * un préstamo de llave activo ni un equipo específico involucrado).
 */
exports.up = async function up(knex) {
  await knex.raw('ALTER TABLE novedades DROP CONSTRAINT ck_novedades_recurso_exclusivo');
  await knex.raw(`
    ALTER TABLE novedades
      ADD CONSTRAINT ck_novedades_recurso_exclusivo
      CHECK (num_nonnulls(llave_id, equipo_id) <= 1)
  `);
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE novedades DROP CONSTRAINT IF EXISTS ck_novedades_recurso_exclusivo');
  await knex.raw(`
    ALTER TABLE novedades
      ADD CONSTRAINT ck_novedades_recurso_exclusivo
      CHECK (num_nonnulls(llave_id, equipo_id) = 1)
  `);
};
