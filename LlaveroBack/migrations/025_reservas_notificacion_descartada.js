'use strict';

/**
 * Marca de "no notificar" sobre la reserva.
 *
 * `Descartar` en la bandeja de reservas sin reclamar apuntaba a
 * `notificaciones`, buscando una fila pendiente para esa reserva. Pero la
 * bandeja se arma desde `reservas.estado = 'no_reclamada'`, y la notificación
 * solo se crea en el instante exacto de esa transición, dentro de
 * `sincronizarEstadosVencidos`. Una reserva que ya cruzó ese punto sin que la
 * notificación llegara a insertarse nunca vuelve a ser candidata: queda
 * atascada en la bandeja con un botón que responde 404 para siempre.
 *
 * El descarte pasa a vivir en la reserva porque es ahí donde vive el dato que
 * arma la lista. Además desacopla la decisión del auxiliar ("a esta persona no
 * le escribimos") del registro de envío, que es otra cosa: la reserva sigue
 * contando como `no_reclamada` en cualquier reporte, solo deja de pedir acción.
 *
 * Timestamp y no booleano: un `true` no dice cuándo se decidió ni permite
 * distinguir "nunca se revisó" de "se revisó y se decidió no escribir".
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE reservas
      ADD COLUMN notificacion_descartada_at timestamptz NULL,
      ADD COLUMN notificacion_descartada_por_usuario_id uuid NULL
        REFERENCES usuarios(id) ON DELETE SET NULL
  `);
  // Índice parcial: las consultas de la bandeja solo preguntan por las NO
  // descartadas, que además son la enorme mayoría de las filas.
  await knex.raw(`
    CREATE INDEX ix_reservas_notificacion_pendiente
      ON reservas (estado)
      WHERE notificacion_descartada_at IS NULL
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS ix_reservas_notificacion_pendiente');
  await knex.raw(`
    ALTER TABLE reservas
      DROP COLUMN IF EXISTS notificacion_descartada_at,
      DROP COLUMN IF EXISTS notificacion_descartada_por_usuario_id
  `);
};
