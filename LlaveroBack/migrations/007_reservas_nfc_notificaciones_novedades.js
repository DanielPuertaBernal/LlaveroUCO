'use strict';

/**
 * Fase S6 de la migración Mongo → Postgres: reservas, nfc_eventos,
 * notificaciones, novedades — últimas 4 features unmigradas antes de S7
 * (cutover cleanup).
 *
 * PRIORIDAD dentro de esta fase (per apply-progress S4/S5): `reservas` se
 * migra primero porque `reserva.service.js` seguía escribiendo directo al
 * modelo Mongoose `Llave` (llave.schema.js) mientras `registros_llaves` ya
 * vivía en Postgres desde S4 — un "split-brain" de escritura real (llaves
 * creadas al aprobar una reserva eran invisibles en Postgres). Esta
 * migración + el rewrite de `reserva.repository.js`/`reserva.service.js`
 * cierran esa brecha.
 *
 * Reemplaza:
 *  - `reservas` (reserva.schema.js) — reservas de salón (distinto de
 *    préstamos de llave/equipo).
 *  - `nfc_eventos` (nfc.schema.js) — idempotencia de lecturas NFC del ESP32.
 *  - `notificaciones` (notificacion.schema.js) — cola de envío de correos +
 *    dedupe de recordatorios. `prestamo_llave_id` se ELIMINA (duplicaba
 *    `llave_id`, ambigüedad ya señalada en la exploración S0) — `llave_id`
 *    es la única referencia a `registros_llaves`.
 *  - `novedades` (novedad.schema.js) — reportes de incidentes sobre llave o
 *    equipo. El discriminador polimórfico `tipo_recurso`/`recurso_id` se
 *    reemplaza por dos FKs excluyentes nullable (`llave_id`, `equipo_id`)
 *    más `CHECK (num_nonnulls(llave_id, equipo_id) = 1)`.
 *
 * Desviaciones respecto a la tabla literal del design doc:
 *  - `reservas.aprobado_por_usuario_id` FK→usuarios se resuelve directo
 *    desde `req.user.sub` (ya es el id Postgres del usuario autenticado
 *    desde S2) — no hace falta un lookup tolerante como en otras FKs de
 *    negocio; se conserva además `aprobado_por_nombre text` como snapshot
 *    para no romper la respuesta HTTP actual (`aprobado_por` de texto).
 *  - `novedades.prestamo_id` (FK→prestamos, per design) se crea pero ningún
 *    productor actual del código lo puebla: el único flujo automático
 *    (`notificacion.service.js._construirNovedadDemora`, demora de
 *    devolución de LLAVE) seteaba `prestamo_ref` = el mismo id que
 *    `recurso_id`/`llave_id` (duplicado, no una referencia real a la tabla
 *    `prestamos` de préstamos de EQUIPO) — se elimina `prestamo_ref` como
 *    campo de API (era redundante) y la columna `prestamo_id` queda
 *    disponible para un futuro flujo de novedades sobre préstamos de
 *    equipo, sin uso hoy.
 *  - `notificaciones.salon`/`novedades.salon` (texto libre snapshot en el
 *    design) se resuelven además a `salon_id` FK→salones de forma
 *    tolerante (NULL si no hay match), mismo patrón de `llave.repository.js`
 *    (S4) — el texto se sigue exponiendo vía JOIN de lectura para no romper
 *    la respuesta HTTP actual.
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- reservas ------------------------------------------------------------
  await knex.raw(`
    CREATE TABLE reservas (
      ${UNIVERSAL_COLUMNS_SQL},
      solicitante_comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      solicitante_nombre text NOT NULL DEFAULT '',
      bloque_id uuid NOT NULL REFERENCES bloques(id) ON DELETE RESTRICT,
      salon_id uuid NOT NULL REFERENCES salones(id) ON DELETE RESTRICT,
      fecha date NOT NULL,
      hora_inicio time NOT NULL,
      hora_fin time NOT NULL,
      motivo text DEFAULT '',
      estado text NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada', 'completada', 'no_reclamada')),
      entregar_llave bool NOT NULL DEFAULT true,
      llave_entregada bool NOT NULL DEFAULT false,
      registro_llave_id uuid NULL REFERENCES registros_llaves(id) ON DELETE RESTRICT,
      checkin_estado text NOT NULL DEFAULT 'pendiente_nfc'
        CHECK (checkin_estado IN ('entregado_oficina', 'pendiente_nfc', 'nfc_anticipado', 'nfc_en_tiempo', 'nfc_retraso', 'no_show')),
      checkin_canal text DEFAULT '' CHECK (checkin_canal IN ('oficina', 'nfc', '')),
      checkin_at timestamptz NULL,
      tipo_solicitante text DEFAULT 'docente' CHECK (tipo_solicitante IN ('docente', 'estudiante')),
      responsable_comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      responsable_nombre text DEFAULT '',
      aprobado_por_usuario_id uuid NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      aprobado_por_nombre text DEFAULT '',
      creado_por_rol text DEFAULT ''
    )
  `);
  await knex.raw('CREATE INDEX idx_reservas_solicitante_comunidad_id ON reservas (solicitante_comunidad_id)');
  await knex.raw('CREATE INDEX idx_reservas_salon_id ON reservas (salon_id)');
  await knex.raw('CREATE INDEX idx_reservas_fecha ON reservas (fecha)');
  await knex.raw('CREATE INDEX idx_reservas_estado ON reservas (estado)');
  await knex.raw('CREATE INDEX idx_reservas_checkin_estado ON reservas (checkin_estado)');
  await knex.raw(`
    CREATE UNIQUE INDEX ux_reservas_slot
      ON reservas (salon_id, fecha, hora_inicio)
      WHERE estado IN ('pendiente', 'aprobada') AND deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON reservas
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- nfc_eventos -----------------------------------------------------------
  // payload_resultado: Mongoose Schema.Types.Mixed -> JSONB (mapeo directo).
  await knex.raw(`
    CREATE TABLE nfc_eventos (
      ${UNIVERSAL_COLUMNS_SQL},
      evento_id text NOT NULL,
      id_carnet text NOT NULL DEFAULT '',
      ubicacion_id uuid NULL REFERENCES ubicaciones_operativas(id) ON DELETE RESTRICT,
      ok bool NOT NULL DEFAULT false,
      tipo_resultado text DEFAULT '',
      mensaje_resultado text DEFAULT '',
      payload_resultado jsonb NULL,
      procesado_en timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_nfc_eventos_evento_id
      ON nfc_eventos (evento_id) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_nfc_eventos_id_carnet ON nfc_eventos (id_carnet)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON nfc_eventos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- notificaciones ----------------------------------------------------------
  // `prestamo_llave_id` ELIMINADO (duplicaba `llave_id`, ver capability
  // notificaciones-dedupe del spec). Dedupe de recordatorios: partial unique
  // (llave_id, tipo_notificacion, numero_recordatorio); dedupe de aviso de
  // reserva no reclamada: partial unique (reserva_id, tipo_notificacion).
  await knex.raw(`
    CREATE TABLE notificaciones (
      ${UNIVERSAL_COLUMNS_SQL},
      destinatario_nombre text NOT NULL,
      destinatario_documento text NOT NULL,
      destinatario_correo text NOT NULL,
      tipo_mensaje text NOT NULL DEFAULT 'predeterminado' CHECK (tipo_mensaje IN ('predeterminado', 'personalizado')),
      asunto text NOT NULL,
      mensaje text DEFAULT '',
      llave_id uuid NULL REFERENCES registros_llaves(id) ON DELETE RESTRICT,
      reserva_id uuid NULL REFERENCES reservas(id) ON DELETE RESTRICT,
      salon_id uuid NULL REFERENCES salones(id) ON DELETE RESTRICT,
      salon text DEFAULT '',
      tipo_notificacion text NOT NULL DEFAULT 'manual'
        CHECK (tipo_notificacion IN ('manual', 'vencimiento_inicial', 'recordatorio', 'reserva_no_reclamada', 'delegado_vencimiento', 'delegado_recordatorio')),
      es_delegado bool NOT NULL DEFAULT false,
      nombre_docente_representado text DEFAULT '',
      numero_recordatorio int NOT NULL DEFAULT 0,
      numero_contacto_destinatario text DEFAULT '',
      estado_envio text NOT NULL DEFAULT 'pendiente' CHECK (estado_envio IN ('pendiente', 'enviado', 'fallido', 'descartado')),
      intentos_envio int NOT NULL DEFAULT 0,
      proximo_reintento timestamptz NULL,
      error_envio text DEFAULT '',
      enviado_por text DEFAULT '',
      fecha_envio timestamptz NOT NULL DEFAULT now(),
      fecha_hora_prestamo timestamptz NULL,
      reserva_fecha text DEFAULT '',
      reserva_hora_inicio text DEFAULT '',
      reserva_hora_fin text DEFAULT '',
      horario_clase text DEFAULT '',
      materia text DEFAULT ''
    )
  `);
  await knex.raw('CREATE INDEX idx_notificaciones_fecha_envio ON notificaciones (fecha_envio DESC)');
  await knex.raw('CREATE INDEX idx_notificaciones_destinatario_documento ON notificaciones (destinatario_documento, fecha_envio DESC)');
  await knex.raw('CREATE INDEX idx_notificaciones_estado_envio_reintento ON notificaciones (estado_envio, proximo_reintento)');
  await knex.raw(`
    CREATE UNIQUE INDEX ux_notificaciones_dedupe_llave
      ON notificaciones (llave_id, tipo_notificacion, numero_recordatorio)
      WHERE deleted_at IS NULL AND llave_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_notificaciones_dedupe_reserva
      ON notificaciones (reserva_id, tipo_notificacion)
      WHERE deleted_at IS NULL AND reserva_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON notificaciones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- novedades ------------------------------------------------------------
  // `tipo_recurso`/`recurso_id` (discriminador polimórfico) ELIMINADOS -> dos
  // FKs excluyentes nullable + CHECK. `prestamo_id` existe per design pero
  // ningún productor actual lo puebla (ver nota arriba); `prestamo_ref` no
  // se migra como campo de API.
  await knex.raw(`
    CREATE TABLE novedades (
      ${UNIVERSAL_COLUMNS_SQL},
      llave_id uuid NULL REFERENCES registros_llaves(id) ON DELETE RESTRICT,
      equipo_id uuid NULL REFERENCES equipos(id) ON DELETE RESTRICT,
      prestamo_id uuid NULL REFERENCES prestamos(id) ON DELETE RESTRICT,
      reportado_por_comunidad_id uuid NULL REFERENCES comunidad(id) ON DELETE RESTRICT,
      reportado_por text NOT NULL DEFAULT '',
      reportado_por_nombre text DEFAULT '',
      salon_id uuid NULL REFERENCES salones(id) ON DELETE RESTRICT,
      salon text DEFAULT '',
      categoria text NOT NULL CHECK (categoria IN ('sin_novedad', 'daño_fisico', 'no_funciona', 'perdida', 'otro', 'demora_entrega')),
      descripcion varchar(500) DEFAULT '',
      estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_revision', 'resuelta', 'cerrada')),
      resolucion text DEFAULT '',
      fecha_reporte timestamptz NOT NULL DEFAULT now(),
      fecha_resolucion timestamptz NULL,
      notificacion_admin_enviada bool NOT NULL DEFAULT false,
      CONSTRAINT ck_novedades_recurso_exclusivo CHECK (num_nonnulls(llave_id, equipo_id) = 1)
    )
  `);
  await knex.raw('CREATE INDEX idx_novedades_estado ON novedades (estado)');
  await knex.raw('CREATE INDEX idx_novedades_fecha_reporte ON novedades (fecha_reporte)');
  await knex.raw('CREATE INDEX idx_novedades_reportado_por_comunidad_id ON novedades (reportado_por_comunidad_id)');
  await knex.raw('CREATE INDEX idx_novedades_llave_id ON novedades (llave_id)');
  await knex.raw('CREATE INDEX idx_novedades_equipo_id ON novedades (equipo_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON novedades
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- guardas de soft-delete --------------------------------------------------

  // reservas gana su primer hijo (notificaciones.reserva_id).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON reservas
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('notificaciones', 'reserva_id')
  `);

  // registros_llaves gana sus primeros hijos independientes (reservas,
  // notificaciones).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON registros_llaves
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'reservas', 'registro_llave_id', 'notificaciones', 'llave_id', 'novedades', 'llave_id')
  `);

  // equipos gana un nuevo hijo (novedades.equipo_id) además de los ya
  // vigilados desde S5 (prestamo_equipos, devolucion_equipos).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON equipos');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON equipos
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'prestamo_equipos', 'equipo_id', 'devolucion_equipos', 'equipo_id', 'novedades', 'equipo_id')
  `);

  // prestamos gana un nuevo hijo (novedades.prestamo_id) además de los ya
  // vigilados desde S5 (prestamo_equipos, devoluciones).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON prestamos');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON prestamos
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'prestamo_equipos', 'prestamo_id', 'devoluciones', 'prestamo_id', 'novedades', 'prestamo_id')
  `);

  // bloques gana un nuevo hijo (reservas.bloque_id) además de los ya
  // vigilados desde S3 (salones.bloque_id, programaciones_semestrales.bloque_id).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON bloques');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON bloques
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'salones', 'bloque_id', 'programaciones_semestrales', 'bloque_id', 'reservas', 'bloque_id')
  `);

  // salones gana 2 nuevos hijos (reservas.salon_id, notificaciones.salon_id,
  // novedades.salon_id) además de los ya vigilados (programaciones.salon_id,
  // registros_llaves.salon_id).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON salones');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON salones
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'programaciones', 'salon_id',
        'registros_llaves', 'salon_id',
        'reservas', 'salon_id',
        'notificaciones', 'salon_id',
        'novedades', 'salon_id')
  `);

  // comunidad gana 3 nuevos hijos (reservas x2, novedades x1) además de los
  // ya vigilados desde S3/S4/S5.
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
        'devoluciones', 'docente_comunidad_id',
        'reservas', 'solicitante_comunidad_id',
        'reservas', 'responsable_comunidad_id',
        'novedades', 'reportado_por_comunidad_id')
  `);

  // ubicaciones_operativas gana su primer hijo (nfc_eventos.ubicacion_id)
  // además de los ya vigilados desde S4/S5.
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON ubicaciones_operativas');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON ubicaciones_operativas
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'registros_llaves', 'ubicacion_prestamo_id',
        'registros_llaves', 'ubicacion_devolucion_id',
        'prestamos', 'ubicacion_prestamo_id',
        'devoluciones', 'ubicacion_devolucion_id',
        'nfc_eventos', 'ubicacion_id')
  `);

  // usuarios gana su primer hijo (reservas.aprobado_por_usuario_id).
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON usuarios
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('reservas', 'aprobado_por_usuario_id')
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON usuarios');

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON ubicaciones_operativas');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON ubicaciones_operativas
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'registros_llaves', 'ubicacion_prestamo_id',
        'registros_llaves', 'ubicacion_devolucion_id',
        'prestamos', 'ubicacion_prestamo_id',
        'devoluciones', 'ubicacion_devolucion_id')
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
        'monitores', 'monitor_comunidad_id',
        'prestamos', 'docente_comunidad_id',
        'prestamos', 'docente_responsable_id',
        'devoluciones', 'docente_comunidad_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON salones');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON salones
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'programaciones', 'salon_id', 'registros_llaves', 'salon_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON bloques');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON bloques
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'salones', 'bloque_id', 'programaciones_semestrales', 'bloque_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON prestamos');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON prestamos
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'prestamo_equipos', 'prestamo_id', 'devoluciones', 'prestamo_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON equipos');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON equipos
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'prestamo_equipos', 'equipo_id', 'devolucion_equipos', 'equipo_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON registros_llaves');
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON reservas');

  await knex.raw('DROP TABLE IF EXISTS novedades');
  await knex.raw('DROP TABLE IF EXISTS notificaciones');
  await knex.raw('DROP TABLE IF EXISTS nfc_eventos');
  await knex.raw('DROP TABLE IF EXISTS reservas');
};
