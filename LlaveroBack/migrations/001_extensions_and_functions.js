'use strict';

/**
 * Extensiones y funciones compartidas usadas por todas las migraciones
 * siguientes:
 *  - pg_trgm: búsqueda difusa por trigrama (usada en comunidad.nombre)
 *  - unaccent: normalización de acentos para búsquedas insensibles a tildes
 *  - set_updated_at(): trigger genérico BEFORE UPDATE que mantiene updated_at
 *  - block_soft_delete_with_active_children(): trigger genérico BEFORE UPDATE
 *    que impide el soft-delete de un padre con hijos activos (deleted_at
 *    NULL); recibe pares (tabla_hija, columna_fk) como argumentos del
 *    trigger.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS unaccent');

  await knex.raw(`
    CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE FUNCTION block_soft_delete_with_active_children() RETURNS trigger AS $$
    DECLARE
      i int;
      child_table text;
      child_col text;
      n bigint;
    BEGIN
      FOR i IN 0..(TG_NARGS - 1) BY 2 LOOP
        child_table := TG_ARGV[i];
        child_col := TG_ARGV[i + 1];
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE %I = $1 AND deleted_at IS NULL',
          child_table, child_col
        ) INTO n USING OLD.id;
        IF n > 0 THEN
          RAISE EXCEPTION 'No se puede eliminar: % registro(s) activo(s) en %', n, child_table
            USING ERRCODE = 'restrict_violation';
        END IF;
      END LOOP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Índice funcional inmutable para búsquedas insensibles a tildes
  // (usado por 002_catalogos.js sobre comunidad.nombre).
  //
  // El cuerpo va calificado por esquema (`public.unaccent`) y con cast
  // explícito a `regdictionary` a propósito: al usar esta función dentro de
  // una expresión de índice, Postgres reescribe (inline) el cuerpo con un
  // search_path restringido, y un `unaccent` sin calificar falla ahí con
  // "function unaccent(unknown, text) does not exist during inlining" aunque
  // la llamada directa funcione.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
      SELECT public.unaccent('public.unaccent'::regdictionary, $1)
    $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP FUNCTION IF EXISTS immutable_unaccent(text)');
  await knex.raw('DROP FUNCTION IF EXISTS block_soft_delete_with_active_children()');
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at()');
  await knex.raw('DROP EXTENSION IF EXISTS unaccent');
  await knex.raw('DROP EXTENSION IF EXISTS pg_trgm');
};
