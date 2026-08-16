'use strict';

/**
 * Renombra `portero_bloques.permite_prestamo_equipos` →
 * `permite_recepcion_equipos`.
 *
 * Contexto (regla de negocio nueva): portería nunca puede PRESTAR equipos —
 * solo admin/aux pueden entregar equipos en préstamo. Portería solo puede
 * REGISTRAR LA DEVOLUCIÓN (recepción) de un equipo ya prestado, si tiene
 * este flag habilitado en al menos un bloque (`porterosService.tienePermisoGlobal`,
 * `prestamo.service.js`). El nombre anterior (`permite_prestamo_equipos`)
 * sugería que habilitaba préstamos, lo cual ya no ocurre nunca para
 * portería; se renombra para reflejar el único uso real que le queda.
 *
 * No se toca `ubicaciones_operativas.permite_prestamo_equipos` (tabla y
 * columna distintas, ver `ubicacion.service.js` — sigue siendo histórico,
 * ya no autoriza nada desde que el gate pasó a ser rol+bloque).
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw('ALTER TABLE portero_bloques RENAME COLUMN permite_prestamo_equipos TO permite_recepcion_equipos');
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE portero_bloques RENAME COLUMN permite_recepcion_equipos TO permite_prestamo_equipos');
};
