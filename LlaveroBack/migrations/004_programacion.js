'use strict';

/**
 * Fase S3 de la migración Mongo → Postgres: programación (table-per-type).
 *
 * Reemplaza la colección Mongoose `programacion` (un único documento con
 * discriminador `tipo: 'programacion' | 'semestral' | 'fantasma'`, definida
 * en src/features/programacion/programacion.schema.js) y la colección
 * `programacion_semestres` (metadatos de semestre cargado, sin colección
 * propia para `reservas_semestrales`: ese feature solo filtraba `programacion`
 * por `tipo: 'semestral'`) por:
 *
 *   - programacion_semestres: metadatos de cada semestre académico cargado.
 *   - programaciones: tabla base con las columnas comunes a los 3 subtipos.
 *   - programaciones_regulares: subtipo 1:1 (sin columnas propias hoy; existe
 *     por simetría de tipos, per Decision 8 del diseño).
 *   - programaciones_semestrales: subtipo 1:1 — es la verdadera
 *     `reservas_semestrales` (ya no es un filtro `tipo:'semestral'`, es una
 *     tabla propia).
 *   - programaciones_fantasma: subtipo 1:1 para grupos fantasma.
 *   - v_programaciones: vista de lectura que hace LEFT JOIN de la base con
 *     los 3 subtipos, para que los repositorios lean sin tener que
 *     ensamblar el join en cada query.
 *
 * FK policy: toda FK es ON DELETE RESTRICT. Los antiguos joins por string
 * (`nombre_bloque`/`aula`, `numero_documento`) se reemplazan por FKs reales
 * a `salones`/`comunidad` donde ya existen esos catálogos (S1/S2). `aula` y
 * `docente_nombre` se conservan como columnas de snapshot/texto libre para
 * tolerar filas del Excel que no calzan con ningún salón/persona existente
 * (igual que `docente_id` nullable, ver nota de diseño más abajo).
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- programacion_semestres --------------------------------------------
  await knex.raw(`
    CREATE TABLE programacion_semestres (
      ${UNIVERSAL_COLUMNS_SQL},
      codigo_raw text,
      codigo text NOT NULL,
      anio int NOT NULL,
      periodo text NOT NULL CHECK (periodo IN ('1', '2')),
      fecha_inicio date NOT NULL,
      fecha_fin date NOT NULL,
      fecha_carga timestamptz,
      cargado_por text,
      total_registros int
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_programacion_semestres_codigo
      ON programacion_semestres (codigo) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_programacion_semestres_fechas
      ON programacion_semestres (fecha_inicio, fecha_fin)
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON programacion_semestres
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- programaciones (base) ----------------------------------------------
  // Nota de diseño: fecha_inicio_semestre/fecha_fin_semestre se ELIMINAN de
  // la tabla base (duplicaban programacion_semestres) — las lecturas hacen
  // join en su lugar; cambio de forma de API intencional.
  // docente_id es NULLABLE con docente_nombre retenido porque el importador
  // de Excel puede referenciar personas ausentes de `comunidad`; el
  // importador resuelve el FK cuando puede y lo deja NULL en caso contrario,
  // así la ingesta nunca falla por huecos en el directorio.
  await knex.raw(`
    CREATE TABLE programaciones (
      ${UNIVERSAL_COLUMNS_SQL},
      tipo text NOT NULL CHECK (tipo IN ('regular', 'semestral', 'fantasma')),
      semestre_id uuid NULL REFERENCES programacion_semestres(id) ON DELETE RESTRICT,
      docente_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      docente_nombre text DEFAULT '',
      dia text CHECK (dia IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo')),
      horario text DEFAULT '',
      hora_inicio time NULL,
      hora_fin time NULL,
      salon_id uuid NULL REFERENCES salones(id) ON DELETE RESTRICT,
      aula text DEFAULT '',
      facultad text DEFAULT '',
      materia text DEFAULT '',
      codigo_materia text DEFAULT '',
      grupo text DEFAULT '',
      nivel_grupo text DEFAULT '',
      estudiantes_prematriculados int DEFAULT 0,
      estudiantes_matriculados int DEFAULT 0,
      total_estudiantes int DEFAULT 0,
      observaciones text DEFAULT ''
    )
  `);
  await knex.raw('CREATE INDEX idx_programaciones_tipo ON programaciones (tipo)');
  await knex.raw('CREATE INDEX idx_programaciones_semestre_id ON programaciones (semestre_id)');
  await knex.raw('CREATE INDEX idx_programaciones_semestre_id_tipo ON programaciones (semestre_id, tipo)');
  await knex.raw('CREATE INDEX idx_programaciones_semestre_id_dia ON programaciones (semestre_id, dia)');
  await knex.raw('CREATE INDEX idx_programaciones_tipo_dia ON programaciones (tipo, dia)');
  await knex.raw('CREATE INDEX idx_programaciones_dia ON programaciones (dia)');
  await knex.raw('CREATE INDEX idx_programaciones_docente_id ON programaciones (docente_id)');
  await knex.raw('CREATE INDEX idx_programaciones_salon_id ON programaciones (salon_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON programaciones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- programaciones_regulares (subtipo 1:1) -----------------------------
  await knex.raw(`
    CREATE TABLE programaciones_regulares (
      programacion_id uuid PRIMARY KEY REFERENCES programaciones(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL
    )
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON programaciones_regulares
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- programaciones_semestrales (subtipo 1:1 — es la real reservas_semestrales) ---
  await knex.raw(`
    CREATE TABLE programaciones_semestrales (
      programacion_id uuid PRIMARY KEY REFERENCES programaciones(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL,
      consecutivo int NULL,
      cancelada bool NOT NULL DEFAULT false,
      fecha_cancelacion timestamptz NULL,
      motivo_cancelacion text DEFAULT '',
      grupo_id uuid NULL,
      creado_manualmente bool NOT NULL DEFAULT false,
      tipo_solicitante text NULL CHECK (tipo_solicitante IN ('docente', 'estudiante')),
      responsable_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      responsable_nombre text DEFAULT '',
      bloque_id uuid NULL REFERENCES bloques(id) ON DELETE RESTRICT
    )
  `);
  await knex.raw('CREATE INDEX idx_programaciones_semestrales_grupo_id ON programaciones_semestrales (grupo_id)');
  await knex.raw('CREATE INDEX idx_programaciones_semestrales_consecutivo ON programaciones_semestrales (consecutivo)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON programaciones_semestrales
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- programaciones_fantasma (subtipo 1:1) ------------------------------
  await knex.raw(`
    CREATE TABLE programaciones_fantasma (
      programacion_id uuid PRIMARY KEY REFERENCES programaciones(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL,
      fantasma_de_programacion_id uuid NULL REFERENCES programaciones(id) ON DELETE RESTRICT,
      fantasma_de_codigo_materia text DEFAULT ''
    )
  `);
  await knex.raw('CREATE INDEX idx_programaciones_fantasma_de ON programaciones_fantasma (fantasma_de_programacion_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON programaciones_fantasma
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- v_programaciones (vista de lectura) --------------------------------
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

  // --- extender guardas de soft-delete con los nuevos hijos ---------------
  // programacion_semestres pasa a ser padre de programaciones.semestre_id.
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON programacion_semestres
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('programaciones', 'semestre_id')
  `);
  // salones pasa a ser padre de programaciones.salon_id (además de sus hijos
  // ya vigilados desde 002_catalogos.js: ninguno, salones no tenía trigger).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON salones
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('programaciones', 'salon_id')
  `);
  // comunidad pasa a ser padre de programaciones.docente_id y
  // programaciones_semestrales.responsable_id.
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON comunidad
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'programaciones', 'docente_id', 'programaciones_semestrales', 'responsable_id')
  `);
  // bloques gana un nuevo hijo (programaciones_semestrales.bloque_id) además
  // del ya vigilado (salones.bloque_id) — hay que recrear el trigger con la
  // lista de hijos ampliada.
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON bloques');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON bloques
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'salones', 'bloque_id', 'programaciones_semestrales', 'bloque_id')
  `);

  // Nota: NO se agrega guarda block_soft_delete de `programaciones` hacia
  // sus propias tablas de subtipo (programaciones_regulares/_semestrales/
  // _fantasma). Esas 3 tablas son la composición 1:1 de una misma fila
  // lógica de "programación" (siempre existe exactamente una), no hijos
  // independientes — el repositorio siempre soft-elimina primero la fila de
  // subtipo y luego la base, en la misma transacción, así que agregar la
  // guarda haría imposible eliminar cualquier programación aun cuando el
  // repositorio respeta ese orden.
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP VIEW IF EXISTS v_programaciones');
  await knex.raw('DROP TABLE IF EXISTS programaciones_fantasma');
  await knex.raw('DROP TABLE IF EXISTS programaciones_semestrales');
  await knex.raw('DROP TABLE IF EXISTS programaciones_regulares');
  await knex.raw('DROP TABLE IF EXISTS programaciones');
  await knex.raw('DROP TABLE IF EXISTS programacion_semestres');

  // Revertir los triggers de bloques/salones/comunidad a su estado previo.
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON comunidad');
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON salones');
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON bloques');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON bloques
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('salones', 'bloque_id')
  `);
};
