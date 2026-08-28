'use strict';

/**
 * Reintroduce `prestamos.fecha_prestamo`.
 *
 * La 006 la abandonó en favor de `created_at` con este argumento:
 *
 *   "ambos `default: Date.now`, nunca leídos por otro feature —
 *    verificado por grep"
 *
 * El grep cubrió el backend, no el cliente: `PrestamosPage.jsx` la usa en dos
 * columnas de tabla y `PrestamosDetallePanel.jsx` para la fecha del préstamo y
 * el "lleva en préstamo", así que desde entonces esos campos renderizan vacío.
 *
 * Se repone como columna propia en vez de alias de `created_at` porque son
 * cosas distintas: `created_at` es auditoría de fila (cuándo se insertó el
 * registro) y `fecha_prestamo` es el dato de negocio (cuándo salió el equipo).
 * Hoy coinciden, pero una carga histórica o un préstamo retroactivo los separa,
 * y un alias haría imposible representarlo.
 *
 * Backfill desde `created_at`: para las filas existentes son, efectivamente,
 * el mismo instante.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw('ALTER TABLE prestamos ADD COLUMN fecha_prestamo timestamptz NULL');
  await knex.raw('UPDATE prestamos SET fecha_prestamo = created_at WHERE fecha_prestamo IS NULL');
  await knex.raw(`
    ALTER TABLE prestamos
      ALTER COLUMN fecha_prestamo SET DEFAULT now(),
      ALTER COLUMN fecha_prestamo SET NOT NULL
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE prestamos DROP COLUMN IF EXISTS fecha_prestamo');
};
