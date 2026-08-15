'use strict';

/**
 * Tablas de catálogo / referencia (Fase S1 de la migración Mongo → Postgres):
 * bloques, tipos_silleteria, salones, configuracion_bloques,
 * ubicaciones_operativas, comunidad, equipos.
 *
 * Estas son tablas hoja (sin FKs entrantes de otras tablas nuevas) o con FKs
 * únicamente entre sí, por lo que pueden crearse antes que el resto del
 * esquema. Todas incluyen las columnas universales (id uuid v7 generado por
 * la app, created_at/updated_at/deleted_at) y el trigger set_updated_at
 * creado en 001_extensions_and_functions.js.
 *
 * Los triggers block_soft_delete_with_active_children solo referencian, por
 * ahora, a las tablas hijas que ya existen en esta fase (salones,
 * configuracion_bloques). Fases posteriores (S3+) que agreguen nuevas tablas
 * hijas (programaciones, registros_llaves, reservas, prestamo_equipos,
 * novedades, etc.) deben hacer DROP TRIGGER + CREATE TRIGGER sobre estas
 * mismas tablas para ampliar la lista de columnas/hijas vigiladas.
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- bloques ------------------------------------------------------------
  await knex.raw(`
    CREATE TABLE bloques (
      ${UNIVERSAL_COLUMNS_SQL},
      nombre_bloque text NOT NULL
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_bloques_nombre_bloque
      ON bloques (nombre_bloque) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON bloques
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- tipos_silleteria -----------------------------------------------------
  await knex.raw(`
    CREATE TABLE tipos_silleteria (
      ${UNIVERSAL_COLUMNS_SQL},
      nombre text NOT NULL
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_tipos_silleteria_nombre
      ON tipos_silleteria (nombre) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON tipos_silleteria
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- salones --------------------------------------------------------------
  await knex.raw(`
    CREATE TABLE salones (
      ${UNIVERSAL_COLUMNS_SQL},
      nombre_salon text NOT NULL,
      bloque_id uuid NOT NULL REFERENCES bloques(id) ON DELETE RESTRICT,
      capacidad_estudiantes int,
      tipo_silleteria_id uuid NULL REFERENCES tipos_silleteria(id) ON DELETE RESTRICT
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_salones_nombre_salon
      ON salones (nombre_salon) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_salones_bloque_id ON salones (bloque_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON salones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // bloques / tipos_silleteria ya tienen hijos (salones): activar guardas.
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON bloques
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('salones', 'bloque_id')
  `);
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON tipos_silleteria
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('salones', 'tipo_silleteria_id')
  `);

  // --- configuracion_bloques --------------------------------------------
  // Deviation from design doc: bloque_id is NULLABLE here, not NOT NULL.
  // The original Mongoose collection kept a sentinel row keyed by the
  // literal string '__defaults__' representing global (no-bloque) defaults,
  // used by ConfiguracionService.obtenerDefaults(). A NOT NULL FK to
  // bloques cannot represent "no bloque". bloque_id is therefore nullable
  // and the partial unique index treats NULL as its own single slot via
  // COALESCE, preserving the at-most-one-defaults-row invariant while still
  // giving every real bloque a proper FK (see apply-progress notes).
  await knex.raw(`
    CREATE TABLE configuracion_bloques (
      ${UNIVERSAL_COLUMNS_SQL},
      bloque_id uuid NULL REFERENCES bloques(id) ON DELETE RESTRICT,
      tiempo_maximo_prestamo_minutos int NOT NULL DEFAULT 120,
      intervalo_recordatorio_minutos int NOT NULL DEFAULT 30,
      max_recordatorios int NOT NULL DEFAULT 5,
      notificaciones_activas bool NOT NULL DEFAULT true
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_configuracion_bloques_bloque_id
      ON configuracion_bloques (COALESCE(bloque_id::text, '__defaults__'))
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON configuracion_bloques
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- ubicaciones_operativas ------------------------------------------
  await knex.raw(`
    CREATE TABLE ubicaciones_operativas (
      ${UNIVERSAL_COLUMNS_SQL},
      clave text NOT NULL,
      nombre text NOT NULL,
      descripcion text,
      activa bool NOT NULL DEFAULT true,
      permite_identificacion bool NOT NULL DEFAULT false,
      permite_prestamo_llaves bool NOT NULL DEFAULT false,
      permite_devolucion_llaves bool NOT NULL DEFAULT false,
      permite_prestamo_equipos bool NOT NULL DEFAULT false,
      creado_por text,
      actualizado_por text,
      CONSTRAINT chk_ubicaciones_clave_lower CHECK (clave = lower(clave))
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_ubicaciones_operativas_clave
      ON ubicaciones_operativas (clave) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_ubicaciones_operativas_activa ON ubicaciones_operativas (activa)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON ubicaciones_operativas
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- comunidad -----------------------------------------------------------
  await knex.raw(`
    CREATE TABLE comunidad (
      ${UNIVERSAL_COLUMNS_SQL},
      numero_documento text NOT NULL,
      nombre text NOT NULL,
      tipo text NOT NULL CHECK (tipo IN ('docente', 'estudiante', 'empleado')),
      facultad text,
      correo text,
      id_carnet text,
      numero_contacto text
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_comunidad_numero_documento
      ON comunidad (numero_documento) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_comunidad_tipo ON comunidad (tipo)');
  await knex.raw('CREATE INDEX idx_comunidad_id_carnet ON comunidad (id_carnet)');
  // Búsqueda difusa e insensible a tildes sobre comunidad.nombre (Requirement:
  // "Trigram search on comunidad.nombre" del spec), usando el wrapper
  // immutable_unaccent() creado en 001_extensions_and_functions.js para que
  // el índice funcional sea válido (unaccent() plano no es IMMUTABLE).
  await knex.raw(`
    CREATE INDEX idx_comunidad_nombre_trgm
      ON comunidad USING gin (immutable_unaccent(nombre) gin_trgm_ops)
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON comunidad
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- equipos ---------------------------------------------------------
  await knex.raw(`
    CREATE TABLE equipos (
      ${UNIVERSAL_COLUMNS_SQL},
      nombre text NOT NULL,
      marca text,
      consecutivo text,
      codigo_inventario text NULL,
      codigo_barras text,
      descripcion text,
      estado text NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'inactivo', 'mantenimiento'))
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_equipos_codigo_inventario
      ON equipos (codigo_inventario) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_equipos_codigo_barras ON equipos (codigo_barras)');
  await knex.raw('CREATE INDEX idx_equipos_estado ON equipos (estado)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON equipos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS equipos');
  await knex.raw('DROP TABLE IF EXISTS comunidad');
  await knex.raw('DROP TABLE IF EXISTS ubicaciones_operativas');
  await knex.raw('DROP TABLE IF EXISTS configuracion_bloques');
  await knex.raw('DROP TABLE IF EXISTS salones');
  await knex.raw('DROP TABLE IF EXISTS tipos_silleteria');
  await knex.raw('DROP TABLE IF EXISTS bloques');
};
