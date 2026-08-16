'use strict';

/**
 * `ux_reservas_slot` (migración 007) solo dedupea reservas con el MISMO
 * `hora_inicio` exacto — dos reservas para el mismo `(salon_id, fecha)` con
 * horarios que se solapan pero arrancan en minutos distintos (ej. 08:00-10:00
 * y 09:00-11:00) pasan `reserva.repository.js#findConflictos` (un
 * check-then-insert con ventana de carrera) y ambas se insertan sin choque.
 *
 * Esta migración agrega una restricción `EXCLUDE USING gist` que Postgres
 * valida de forma atómica en cada INSERT/UPDATE, cerrando esa ventana de
 * carrera independientemente de lo que haya verificado la capa de aplicación
 * antes del insert.
 *
 * `fecha` es `date` y `hora_inicio`/`hora_fin` son `time` (sin zona horaria,
 * ver 007) — no hay operator class GiST nativo para `timerange`, así que el
 * rango a excluir se construye como `tsrange(fecha + hora_inicio, fecha +
 * hora_fin)` (`fecha + hora` en Postgres devuelve `timestamp`), evitando
 * cualquier problema de zona horaria: sigue comparando los mismos valores
 * naive que ya vive en la fila. `btree_gist` habilita los operator classes
 * `=` para `uuid`/`date` dentro del índice GiST (los rangos por sí solos ya
 * tienen soporte GiST nativo).
 *
 * El predicado replica exactamente el de `ux_reservas_slot`
 * (`estado IN ('pendiente','aprobada') AND deleted_at IS NULL`) para no
 * bloquear reservas canceladas/rechazadas/completadas ni filas borradas
 * lógicamente.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await knex.raw(`
    ALTER TABLE reservas
      ADD CONSTRAINT ex_reservas_no_overlap
      EXCLUDE USING gist (
        salon_id WITH =,
        fecha WITH =,
        tsrange(fecha + hora_inicio, fecha + hora_fin) WITH &&
      )
      WHERE (estado IN ('pendiente', 'aprobada') AND deleted_at IS NULL)
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  // Se deja `btree_gist` habilitada (podría estar en uso por otra
  // extensión/constraint futura); solo se revierte la restricción agregada
  // por esta migración.
  await knex.raw('ALTER TABLE reservas DROP CONSTRAINT IF EXISTS ex_reservas_no_overlap');
};
