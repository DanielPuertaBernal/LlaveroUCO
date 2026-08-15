'use strict';

/**
 * Fase S4 de la migración Mongo → Postgres: llaves + monitores (slice de
 * mayor riesgo per diseño).
 *
 * Reemplaza:
 *  - La colección Mongoose `registros_llaves` (llave.schema.js) — único
 *    documento detrás de todo el split de aplicación (domain/read-model/
 *    write-model/workflows/context, que se conserva tal cual: es solo
 *    organización de código, no un concepto de base de datos).
 *  - La colección Mongoose `monitores` (monitor.schema.js).
 *
 * El cambio central de esta fase: `llave.context.js` resolvía el rol
 * (docente/monitor) y las clases disponibles de un monitor comparando
 * strings en memoria (numero_documento, materia, dia, horario) entre
 * `registros_llaves`, `programacion` y `monitores`. Con `comunidad`/
 * `programaciones` ya como tablas reales con FK (S1-S3), esa comparación se
 * reemplaza por JOINs SQL reales:
 *   - `registros_llaves.comunidad_id` FK→comunidad (antes numero_documento string)
 *   - `registros_llaves.programacion_id` FK→programaciones (antes match por
 *     dia/horario/aula/materia)
 *   - `registros_llaves.salon_id` FK→salones (antes aula string)
 *   - `monitores.programacion_id` FK→programaciones — reemplaza por completo
 *     el antiguo compuesto (materia, aula, horario, dia) como texto libre en
 *     `monitores`: cada asignación de monitor ahora apunta a UNA fila
 *     concreta de `programaciones`, no a un patrón de string a comparar.
 *
 * `duracion`/`tiempo_retraso`/`tiempo_retraso_devolucion` pasan de texto
 * formateado ("2h 15min") a enteros en minutos (`duracion_minutos`,
 * `tiempo_retraso_minutos`, `tiempo_retraso_devolucion_minutos`); el
 * formateo para el cliente se sigue haciendo en `llave.domain.js`
 * (`toClientFormat`), la forma de la respuesta HTTP no cambia.
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- registros_llaves ----------------------------------------------------
  await knex.raw(`
    CREATE TABLE registros_llaves (
      ${UNIVERSAL_COLUMNS_SQL},
      comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      docente_nombre text DEFAULT '',
      programacion_id uuid NULL REFERENCES programaciones(id) ON DELETE RESTRICT,
      salon_id uuid NULL REFERENCES salones(id) ON DELETE RESTRICT,
      aula text DEFAULT '',
      dia text DEFAULT '',
      horario text DEFAULT '',
      facultad text DEFAULT '',
      materia text DEFAULT '',
      fecha_hora_entrega timestamptz NOT NULL,
      fecha_hora_devolucion timestamptz NULL,
      duracion_minutos int NULL,
      se_reclamo_a_tiempo bool DEFAULT false,
      tiempo_retraso_minutos int NULL,
      retraso_entrega bool DEFAULT false,
      tiempo_retraso_devolucion_minutos int NULL,
      tipo_entrega text DEFAULT '' CHECK (tipo_entrega IN ('manual', 'carnet', '')),
      tipo_devolucion text DEFAULT '' CHECK (tipo_devolucion IN ('manual', 'carnet', '')),
      origen_registro text DEFAULT '' CHECK (origen_registro IN ('individual', 'programacion', 'reserva_semestral', '')),
      ubicacion_prestamo_id uuid NULL REFERENCES ubicaciones_operativas(id) ON DELETE RESTRICT,
      ubicacion_devolucion_id uuid NULL REFERENCES ubicaciones_operativas(id) ON DELETE RESTRICT,
      quien_reclama text DEFAULT '' CHECK (quien_reclama IN ('docente', 'monitor', 'otra_persona', '')),
      reclama_comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      nombre_reclama text DEFAULT '',
      quien_entrega text DEFAULT '' CHECK (quien_entrega IN ('docente', 'monitor', '')),
      entrega_comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      nombre_entrega text DEFAULT '',
      numero_contacto text DEFAULT '',
      estado text NOT NULL DEFAULT 'en_prestamo'
        CHECK (estado IN ('en_prestamo', 'en_mora', 'demora_entrega', 'entregado')),
      dia_entrega date NULL
    )
  `);
  await knex.raw('CREATE INDEX idx_registros_llaves_comunidad_id ON registros_llaves (comunidad_id)');
  await knex.raw('CREATE INDEX idx_registros_llaves_estado ON registros_llaves (estado)');
  await knex.raw('CREATE INDEX idx_registros_llaves_fecha_hora_entrega ON registros_llaves (fecha_hora_entrega)');
  await knex.raw('CREATE INDEX idx_registros_llaves_programacion_id ON registros_llaves (programacion_id)');
  // Guarda de duplicado: misma persona + mismo salón + mismo día. NULLs son
  // distintos entre sí en un índice único de Postgres (a diferencia del
  // índice sparse de Mongo, esto ya es automático) — ver nota de riesgo en
  // apply-progress: si comunidad_id o salon_id no se resuelven (persona/aula
  // ausente del catálogo), la guarda de duplicado no aplica para esa fila.
  await knex.raw(`
    CREATE UNIQUE INDEX ux_registros_llaves_dedupe_dia
      ON registros_llaves (comunidad_id, salon_id, dia_entrega) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON registros_llaves
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- monitores -------------------------------------------------------------
  // El antiguo compuesto único (docente, monitor, materia, dia, horario) —
  // todo texto libre — se reemplaza por (docente_comunidad_id,
  // monitor_comunidad_id, programacion_id): cada asignación de monitor
  // vincula a una fila concreta de `programaciones`, no a un patrón de texto.
  await knex.raw(`
    CREATE TABLE monitores (
      ${UNIVERSAL_COLUMNS_SQL},
      docente_comunidad_id uuid NOT NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      monitor_comunidad_id uuid NOT NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      monitor_nombre text DEFAULT '',
      monitor_id_carnet text DEFAULT '',
      monitor_facultad text DEFAULT '',
      monitor_correo text DEFAULT '',
      programacion_id uuid NULL REFERENCES programaciones(id) ON DELETE RESTRICT,
      activo bool NOT NULL DEFAULT true
    )
  `);
  await knex.raw('CREATE INDEX idx_monitores_docente_comunidad_id ON monitores (docente_comunidad_id)');
  await knex.raw('CREATE INDEX idx_monitores_monitor_comunidad_id ON monitores (monitor_comunidad_id)');
  await knex.raw('CREATE INDEX idx_monitores_programacion_id ON monitores (programacion_id)');
  await knex.raw(`
    CREATE UNIQUE INDEX ux_monitores_docente_monitor_programacion
      ON monitores (docente_comunidad_id, monitor_comunidad_id, programacion_id) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON monitores
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- extender guardas de soft-delete con los nuevos hijos -----------------

  // programaciones gana sus primeros hijos independientes (registros_llaves,
  // monitores) — a diferencia de sus propias tablas de subtipo (S3, sin
  // guarda deliberadamente), estos SÍ son hijos independientes reales.
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON programaciones
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'registros_llaves', 'programacion_id', 'monitores', 'programacion_id')
  `);

  // salones gana un nuevo hijo (registros_llaves.salon_id) además del ya
  // vigilado (programaciones.salon_id, desde S3).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON salones');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON salones
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'programaciones', 'salon_id', 'registros_llaves', 'salon_id')
  `);

  // comunidad gana 5 nuevos hijos (registros_llaves x3, monitores x2) además
  // de los ya vigilados desde S3 (programaciones.docente_id,
  // programaciones_semestrales.responsable_id).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON comunidad');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON comunidad
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'programaciones', 'docente_id',
        'programaciones_semestrales', 'responsable_id',
        'registros_llaves', 'comunidad_id',
        'registros_llaves', 'reclama_comunidad_id',
        'registros_llaves', 'entrega_comunidad_id',
        'monitores', 'docente_comunidad_id',
        'monitores', 'monitor_comunidad_id')
  `);

  // ubicaciones_operativas gana sus primeros hijos (registros_llaves x2).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON ubicaciones_operativas
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'registros_llaves', 'ubicacion_prestamo_id', 'registros_llaves', 'ubicacion_devolucion_id')
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON ubicaciones_operativas');

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON comunidad');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON comunidad
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'programaciones', 'docente_id', 'programaciones_semestrales', 'responsable_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON salones');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON salones
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('programaciones', 'salon_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON programaciones');

  await knex.raw('DROP TABLE IF EXISTS monitores');
  await knex.raw('DROP TABLE IF EXISTS registros_llaves');
};
