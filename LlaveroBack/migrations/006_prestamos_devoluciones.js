'use strict';

/**
 * Fase S5 de la migración Mongo → Postgres: préstamos/devoluciones de
 * equipos.
 *
 * Reemplaza:
 *  - La colección Mongoose `prestamos` (prestamo.schema.js), con su array
 *    embebido `equipos` (detalleEquipoSchema) → tabla `prestamo_equipos`.
 *  - La colección Mongoose `devoluciones` (mismo archivo de schema), con su
 *    array embebido `equipos_devueltos` (equipoDevueltoSchema) → tabla
 *    `devolucion_equipos`.
 *
 * Primera fase con un `knex.transaction()` real de múltiples sentencias
 * (header + line items) — el código Mongo original no usaba transacciones
 * de Mongo aquí tampoco (usaba `mongoose.startSession()` con
 * `withTransactionalRetry` manual); este es el primer uso de transacciones
 * *Postgres* reales en la base de código migrada.
 *
 * Desviaciones respecto a la tabla literal del design doc (documentadas
 * también en apply-progress):
 *  - `prestamos.solicitante_tipo` amplía el CHECK a
 *    ('docente','estudiante','empleado','') en vez de solo
 *    ('docente','estudiante') — el runtime actual (prestamo.service.js /
 *    prestamo.routes.js) acepta 'empleado' y '' como valor por defecto; la
 *    tabla del design parece una simplificación editorial, no un cambio de
 *    comportamiento explícito (a diferencia de otros drops sí anotados en
 *    el design, p. ej. `notificaciones.prestamo_llave_id`).
 *  - `devoluciones.auxiliar_que_recibio text` se preserva como columna de
 *    cabecera aunque no aparece en la tabla literal del design — el
 *    servicio actual (`registrarDevolucion`) sí lo persiste
 *    (`auxiliar_que_recibio || 'Auxiliar'`) a nivel de devolución (no por
 *    equipo); se trata como el mismo tipo de omisión editorial.
 *  - `prestamos.fecha_prestamo` / `devoluciones.fecha_devolucion` de Mongo
 *    (ambos `default: Date.now`, nunca leídos por otro feature —
 *    verificado por grep) se abandonan en favor de la columna universal
 *    `created_at`, que ya cumple exactamente ese rol; ningún consumidor
 *    depende del nombre de campo original.
 *  - `prestamo_equipos.equipo_codigo` conserva el nombre de columna
 *    original de `detalleEquipoSchema` (no se renombra a
 *    `equipo_codigo_inventario` pese a que el design doc usa esa grafía) —
 *    la instrucción de la tarea pide preservar la lista de campos del
 *    snapshot "exactamente como existen hoy"; el nombre real de columna en
 *    el catálogo (`equipos.codigo_inventario`) no aplica aquí porque este
 *    es un snapshot histórico, no una FK. `equipo_consecutivo` es `text`
 *    (no `int`): el catálogo `equipos.consecutivo` ya es `text` desde S1
 *    (002_catalogos.js), pese a que el schema Mongo original tipaba
 *    `equipo_consecutivo` como Number — se prioriza la coherencia con el
 *    snapshot fuente.
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- prestamos (cabecera) --------------------------------------------------
  await knex.raw(`
    CREATE TABLE prestamos (
      ${UNIVERSAL_COLUMNS_SQL},
      docente_comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      docente_codigo_nfc text NOT NULL,
      docente_nombre text DEFAULT '',
      solicitante_tipo text DEFAULT '' CHECK (solicitante_tipo IN ('docente', 'estudiante', 'empleado', '')),
      docente_responsable_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      docente_responsable_nombre text DEFAULT '',
      auxiliar_prestamista text DEFAULT 'Auxiliar',
      ubicacion_prestamo_id uuid NULL REFERENCES ubicaciones_operativas(id) ON DELETE RESTRICT,
      estado text NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'parcialmente_devuelto', 'completamente_devuelto'))
    )
  `);
  await knex.raw('CREATE INDEX idx_prestamos_docente_codigo_nfc ON prestamos (docente_codigo_nfc)');
  await knex.raw('CREATE INDEX idx_prestamos_estado ON prestamos (estado)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON prestamos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- prestamo_equipos (línea, reemplaza prestamos.equipos[]) ---------------
  // Snapshot del equipo al momento del préstamo, preservado intencionalmente
  // (misma razón que S4 con las columnas snapshot de `monitores`): la
  // historia de un préstamo no debe cambiar si luego se edita el equipo
  // maestro.
  await knex.raw(`
    CREATE TABLE prestamo_equipos (
      ${UNIVERSAL_COLUMNS_SQL},
      prestamo_id uuid NOT NULL REFERENCES prestamos(id) ON DELETE RESTRICT,
      equipo_id uuid NOT NULL REFERENCES equipos(id) ON DELETE RESTRICT,
      equipo_nombre text DEFAULT '',
      equipo_marca text DEFAULT '',
      equipo_codigo text DEFAULT '',
      equipo_consecutivo text DEFAULT '',
      equipo_codigo_barras text DEFAULT '',
      estado_equipo text NOT NULL DEFAULT 'entregado' CHECK (estado_equipo IN ('entregado', 'devuelto')),
      fecha_entrega timestamptz NULL,
      fecha_devolucion timestamptz NULL,
      auxiliar_que_recibio_devolucion text DEFAULT '',
      tipo_entrega text DEFAULT '' CHECK (tipo_entrega IN ('manual', 'carnet', ''))
    )
  `);
  await knex.raw('CREATE INDEX idx_prestamo_equipos_prestamo_id ON prestamo_equipos (prestamo_id)');
  await knex.raw('CREATE INDEX idx_prestamo_equipos_equipo_id ON prestamo_equipos (equipo_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON prestamo_equipos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- devoluciones (cabecera) -------------------------------------------------
  await knex.raw(`
    CREATE TABLE devoluciones (
      ${UNIVERSAL_COLUMNS_SQL},
      prestamo_id uuid NOT NULL REFERENCES prestamos(id) ON DELETE RESTRICT,
      docente_comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      docente_codigo_nfc text DEFAULT '',
      docente_nombre text DEFAULT '',
      ubicacion_devolucion_id uuid NULL REFERENCES ubicaciones_operativas(id) ON DELETE RESTRICT,
      auxiliar_que_recibio text DEFAULT 'Auxiliar',
      es_devolucion_completa bool NOT NULL DEFAULT false
    )
  `);
  await knex.raw('CREATE INDEX idx_devoluciones_prestamo_id ON devoluciones (prestamo_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON devoluciones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- devolucion_equipos (línea, reemplaza devoluciones.equipos_devueltos[]) --
  await knex.raw(`
    CREATE TABLE devolucion_equipos (
      ${UNIVERSAL_COLUMNS_SQL},
      devolucion_id uuid NOT NULL REFERENCES devoluciones(id) ON DELETE RESTRICT,
      equipo_id uuid NOT NULL REFERENCES equipos(id) ON DELETE RESTRICT,
      nombre text DEFAULT '',
      cantidad int NOT NULL DEFAULT 1,
      estado text DEFAULT 'bueno'
    )
  `);
  await knex.raw('CREATE INDEX idx_devolucion_equipos_devolucion_id ON devolucion_equipos (devolucion_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON devolucion_equipos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- guardas de soft-delete --------------------------------------------------

  // prestamos gana sus primeros hijos (prestamo_equipos, devoluciones).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON prestamos
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'prestamo_equipos', 'prestamo_id', 'devoluciones', 'prestamo_id')
  `);

  // devoluciones gana su primer hijo (devolucion_equipos).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON devoluciones
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'devolucion_equipos', 'devolucion_id')
  `);

  // equipos gana sus primeros hijos (prestamo_equipos, devolucion_equipos).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON equipos
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'prestamo_equipos', 'equipo_id', 'devolucion_equipos', 'equipo_id')
  `);

  // comunidad gana 3 nuevos hijos (prestamos x2, devoluciones x1) además de
  // los ya vigilados desde S3/S4.
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
        'monitores', 'monitor_comunidad_id',
        'prestamos', 'docente_comunidad_id',
        'prestamos', 'docente_responsable_id',
        'devoluciones', 'docente_comunidad_id')
  `);

  // ubicaciones_operativas gana 2 nuevos hijos (prestamos, devoluciones)
  // además de los ya vigilados desde S4 (registros_llaves x2).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON ubicaciones_operativas');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON ubicaciones_operativas
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'registros_llaves', 'ubicacion_prestamo_id',
        'registros_llaves', 'ubicacion_devolucion_id',
        'prestamos', 'ubicacion_prestamo_id',
        'devoluciones', 'ubicacion_devolucion_id')
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON ubicaciones_operativas');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON ubicaciones_operativas
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'registros_llaves', 'ubicacion_prestamo_id', 'registros_llaves', 'ubicacion_devolucion_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON comunidad');
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

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON equipos');
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON devoluciones');
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON prestamos');

  await knex.raw('DROP TABLE IF EXISTS devolucion_equipos');
  await knex.raw('DROP TABLE IF EXISTS devoluciones');
  await knex.raw('DROP TABLE IF EXISTS prestamo_equipos');
  await knex.raw('DROP TABLE IF EXISTS prestamos');
};
