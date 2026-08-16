'use strict';

/**
 * Cierra la carrera de concurrencia del feature `prestamos`: hasta ahora la
 * disponibilidad de un equipo se garantizaba solo a nivel de aplicación
 * (`prestamo.service.js#_validarDisponibilidad` hace un SELECT y luego un
 * INSERT en pasos separados dentro de la misma transacción, sin bloqueo de
 * fila) — dos requests concurrentes podían leer "disponible" antes de que
 * cualquiera de las dos insertara su línea, y ambas terminaban prestando el
 * mismo equipo físico.
 *
 * Este índice único parcial añade la guarda real a nivel de base de datos:
 * un mismo `equipo_id` no puede tener más de una fila con
 * `estado_equipo = 'entregado'` en `prestamo_equipos` (el valor real de la
 * columna, ver CHECK en 006_prestamos_devoluciones.js). Al violar la
 * restricción, Postgres devuelve el código de error `23505`
 * (unique_violation), que `prestamo.service.js` mapea a
 * `ApiError.conflict('Este equipo ya está prestado')` — mismo patrón que
 * `persistirPrestamoConDedupe` en `llave.workflows.js` (S4/S5) usa para
 * `23505` en `registros_llaves`.
 *
 * No se filtra por `deleted_at`: no hay flujo actual de soft-delete de
 * líneas `prestamo_equipos` (solo se marcan como `estado_equipo='devuelto'`
 * vía `updateEquipoLinea`), así que no hace falta esa condición adicional
 * en el índice parcial.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    CREATE UNIQUE INDEX ux_prestamo_equipos_equipo_activo
      ON prestamo_equipos (equipo_id) WHERE estado_equipo = 'entregado'
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS ux_prestamo_equipos_equipo_activo');
};
