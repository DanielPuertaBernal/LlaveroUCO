'use strict';

/**
 * `registros_llaves` guarda préstamo y devolución en la MISMA fila, pero 009
 * le dio una sola columna de trazabilidad: `gestionado_por_usuario_id`.
 * `construirDatosDevolucion` (llave.domain.js) la reescribe al registrar la
 * devolución, así que en cuanto una llave vuelve se pierde quién la entregó.
 *
 * Eso no se notaba mientras el dato solo alimentaba la regla "la misma
 * portería devuelve" (que lo lee ANTES del update). Ahora la UI muestra al
 * usuario gestor como punto de atención — `ubicacion_prestamo`/
 * `ubicacion_devolucion` quedaron congeladas en la oficina desde 009 — y con
 * una sola columna el historial atribuiría la entrega a quien recibió.
 *
 * Se separan los dos momentos: `gestionado_por_usuario_id` queda como gestor
 * del PRÉSTAMO y `gestionado_por_devolucion_usuario_id` registra el de la
 * devolución. `prestamos`/`devoluciones` (equipos) no necesitan esto: ya son
 * tablas distintas, cada una con su propia columna.
 *
 * Backfill: las filas ya devueltas tienen en `gestionado_por_usuario_id` al
 * gestor de la devolución (lo último que se escribió), no al del préstamo. Se
 * copia a la columna nueva para no perderlo, y se anula el original, que a
 * esta altura es un dato incorrecto para el préstamo y no se puede recuperar.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE registros_llaves
      ADD COLUMN gestionado_por_devolucion_usuario_id uuid NULL
        REFERENCES usuarios(id) ON DELETE RESTRICT
  `);
  await knex.raw(`
    CREATE INDEX idx_registros_llaves_gestion_devolucion
      ON registros_llaves (gestionado_por_devolucion_usuario_id)
  `);
  await knex.raw(`
    UPDATE registros_llaves
      SET gestionado_por_devolucion_usuario_id = gestionado_por_usuario_id,
          gestionado_por_usuario_id = NULL
      WHERE fecha_hora_devolucion IS NOT NULL
        AND gestionado_por_usuario_id IS NOT NULL
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`
    UPDATE registros_llaves
      SET gestionado_por_usuario_id = gestionado_por_devolucion_usuario_id
      WHERE gestionado_por_usuario_id IS NULL
        AND gestionado_por_devolucion_usuario_id IS NOT NULL
  `);
  await knex.raw('DROP INDEX IF EXISTS idx_registros_llaves_gestion_devolucion');
  await knex.raw('ALTER TABLE registros_llaves DROP COLUMN IF EXISTS gestionado_por_devolucion_usuario_id');
};
