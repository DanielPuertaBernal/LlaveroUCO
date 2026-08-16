'use strict';

/**
 * Fusiona los estados 'resuelta' y 'cerrada' de `novedades` en uno solo
 * ('resuelta'): en la práctica eran equivalentes (mismo efecto secundario
 * en el servicio, `fecha_resolucion`), la única diferencia era que
 * 'cerrada' bloqueaba la edición del estado en el frontend — se elimina
 * esa distinción a pedido del usuario.
 */
exports.up = async function up(knex) {
  await knex('novedades').where({ estado: 'cerrada' }).update({ estado: 'resuelta' });

  await knex.raw('ALTER TABLE novedades DROP CONSTRAINT novedades_estado_check');
  await knex.raw(`
    ALTER TABLE novedades
      ADD CONSTRAINT novedades_estado_check
      CHECK (estado IN ('abierta', 'en_revision', 'resuelta'))
  `);
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE novedades DROP CONSTRAINT IF EXISTS novedades_estado_check');
  await knex.raw(`
    ALTER TABLE novedades
      ADD CONSTRAINT novedades_estado_check
      CHECK (estado IN ('abierta', 'en_revision', 'resuelta', 'cerrada'))
  `);
};
