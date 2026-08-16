'use strict';

/**
 * Agrega 'automatica' al CHECK de `tipo_devolucion`: cuando el sistema
 * fusiona clases consecutivas del mismo docente+aula en varios registros
 * encadenados (ver `construirRegistrosPrestamo` en llave.domain.js), los
 * registros intermedios se cierran solos en el límite de cada clase — sin
 * que el docente haya devuelto físicamente la llave — y necesitan un valor
 * de `tipo_devolucion` distinto de 'manual'/'carnet' para no dar a entender
 * que hubo una devolución física real en ese instante.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw('ALTER TABLE registros_llaves DROP CONSTRAINT registros_llaves_tipo_devolucion_check');
  await knex.raw(`
    ALTER TABLE registros_llaves
      ADD CONSTRAINT registros_llaves_tipo_devolucion_check
        CHECK (tipo_devolucion IN ('manual', 'carnet', 'automatica', ''))
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE registros_llaves DROP CONSTRAINT IF EXISTS registros_llaves_tipo_devolucion_check');
  await knex.raw(`
    ALTER TABLE registros_llaves
      ADD CONSTRAINT registros_llaves_tipo_devolucion_check
        CHECK (tipo_devolucion IN ('manual', 'carnet', ''))
  `);
};
