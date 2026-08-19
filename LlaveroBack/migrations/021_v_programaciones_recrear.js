'use strict';

/**
 * `v_programaciones` (definida en 004_programacion.js) hace `SELECT p.*, ...`
 * — en Postgres esto se expande a la lista explícita de columnas de
 * `programaciones` en el momento del CREATE VIEW, no se actualiza sola
 * cuando la tabla base gana columnas nuevas. Las migraciones 019 y 020
 * agregaron `es_intensivo`/`sin_entrega_llave` a `programaciones` pero la
 * vista se quedó con la lista vieja — el repositorio lee de la vista, así
 * que ambas columnas llegaban `undefined` a la app pese a estar pobladas en
 * la tabla base. Se recrea la vista idéntica a como quedó en
 * 004_programacion.js, agregando las dos columnas nuevas al final.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw('DROP VIEW IF EXISTS v_programaciones');
  await knex.raw(`
    CREATE VIEW v_programaciones AS
    SELECT p.*,
           r.programacion_id IS NOT NULL AS es_regular,
           s.consecutivo, s.cancelada, s.fecha_cancelacion, s.motivo_cancelacion,
           s.grupo_id, s.creado_manualmente, s.tipo_solicitante,
           s.responsable_id, s.responsable_nombre, s.bloque_id,
           f.fantasma_de_programacion_id, f.fantasma_de_codigo_materia
    FROM programaciones p
    LEFT JOIN programaciones_regulares  r ON r.programacion_id = p.id AND r.deleted_at IS NULL
    LEFT JOIN programaciones_semestrales s ON s.programacion_id = p.id AND s.deleted_at IS NULL
    LEFT JOIN programaciones_fantasma    f ON f.programacion_id = p.id AND f.deleted_at IS NULL
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP VIEW IF EXISTS v_programaciones');
  await knex.raw(`
    CREATE VIEW v_programaciones AS
    SELECT p.*,
           r.programacion_id IS NOT NULL AS es_regular,
           s.consecutivo, s.cancelada, s.fecha_cancelacion, s.motivo_cancelacion,
           s.grupo_id, s.creado_manualmente, s.tipo_solicitante,
           s.responsable_id, s.responsable_nombre, s.bloque_id,
           f.fantasma_de_programacion_id, f.fantasma_de_codigo_materia
    FROM programaciones p
    LEFT JOIN programaciones_regulares  r ON r.programacion_id = p.id AND r.deleted_at IS NULL
    LEFT JOIN programaciones_semestrales s ON s.programacion_id = p.id AND s.deleted_at IS NULL
    LEFT JOIN programaciones_fantasma    f ON f.programacion_id = p.id AND f.deleted_at IS NULL
  `);
};
