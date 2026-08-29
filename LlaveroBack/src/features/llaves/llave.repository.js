'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { applyPagination } = require('../../shared/utils/pagination.helper');
const ApiError = require('../../shared/errors/api.error');
const { rangoDelDiaEnBogota } = require('../../shared/utils/date.helper');
const comunidadRepository = require('../comunidad/comunidad.repository');
const salonRepository = require('../salones/salon.repository');
const ubicacionRepository = require('../ubicaciones/ubicacion.repository');

/**
 * Repositorio de `registros_llaves` (Fase S4 de la migración Mongo →
 * Postgres — slice de mayor riesgo).
 *
 * Reemplaza el modelo Mongoose `Llave` (llave.schema.js — eliminado en S6,
 * único requerimiento restante era `reservas/reserva.repository.js`/
 * `reserva.service.js`, ambos migrados a este repositorio en S6, cerrando
 * el split-brain de escritura documentado en apply-progress S4/S5).
 *
 * Invariante de la capa de repositorio (design doc): `llave.domain.js`/
 * `llave.write-model.js`/`llave.workflows.js` siguen construyendo objetos
 * "de negocio" con los mismos nombres de campo que antes usaba Mongo
 * (`numero_documento`, `docente`, `ubicacion_prestamo` como clave string,
 * `numero_documento_reclama`, etc.) — es este repositorio el que traduce
 * esos campos a las columnas/FK reales de Postgres
 * (`comunidad_id`/`reclama_comunidad_id`/`entrega_comunidad_id`,
 * `salon_id`, `ubicacion_prestamo_id`/`ubicacion_devolucion_id`), igual
 * patrón que `salon.repository.js` (bloque_id/tipo_silleteria_id) y
 * `programacion.repository.js` (docente_id) en fases anteriores. Todas las
 * resoluciones de FK son tolerantes (NULL si no hay match) — una llave no
 * debe fallar en crearse porque la persona/aula/ubicación no calce
 * exactamente con un catálogo existente.
 */

/**
 * Campos que se pasan tal cual (sin resolución de FK) a `registros_llaves`.
 *
 * S6 bugfix: `quien_reclama`/`quien_entrega` faltaban en esta lista desde
 * S4 — `llave.domain.js` los sigue construyendo en cada registro
 * (construirRegistroPrestamo/construirDatosDevolucion) pero, al no estar
 * aquí, `create`/`update` los descartaba silenciosamente y la columna
 * quedaba siempre en su default `''`. Detectado al migrar `reservas`
 * (S6), que depende de que `quien_reclama` se persista correctamente al
 * entregar una llave al aprobar/crear una reserva.
 */
const PASSTHROUGH_COLUMNS = [
  'dia', 'horario', 'aula', 'facultad', 'materia',
  'fecha_hora_entrega', 'fecha_hora_devolucion',
  'duracion_minutos', 'se_reclamo_a_tiempo', 'tiempo_retraso_minutos',
  'retraso_entrega', 'tiempo_retraso_devolucion_minutos',
  'tipo_entrega', 'tipo_devolucion', 'origen_registro',
  'quien_reclama', 'quien_entrega',
  'nombre_reclama', 'nombre_entrega', 'numero_contacto',
  'estado', 'dia_entrega', 'programacion_id',
  'gestionado_por_usuario_id',
  'gestionado_por_devolucion_usuario_id',
];

class LlaveRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  /**
   * Query de lectura: JOIN con `comunidad` 3 veces (persona del préstamo,
   * quien reclama, quien entrega) para exponer los antiguos nombres de
   * campo `numero_documento`/`numero_documento_reclama`/
   * `numero_documento_entrega` que el resto del código (llave.domain.js,
   * llave.context.js, llave.read-model.js) sigue consumiendo por ese
   * nombre — mismo patrón usado por `programacion.repository.js` en S3.
   *
   * También hace LEFT JOIN con `usuarios` sobre `gestionado_por_usuario_id`
   * para exponer `gestionado_por_rol`: `gestionado_por_usuario_id` se
   * guarda igual sea quien sea (portería, admin o aux — ver
   * `llave.workflows.js`), así que la regla de "misma portería devuelve"
   * necesita saber el ROL de quien gestionó, no solo si el campo es NULL,
   * para no aplicar la restricción quien entregó fue admin/aux.
   *
   * `gestionado_por_nombre` sale del mismo join y es lo que la UI muestra
   * como punto de atención: `ubicacion_prestamo`/`ubicacion_devolucion`
   * quedaron congeladas en la oficina desde 009 (ver `normalizarUbicacion`
   * en `llave.service.js`), así que el usuario gestor es el único dato
   * confiable sobre dónde se procesó la operación.
   */
  _readQuery(executor = this.db) {
    return executor(TABLES.REGISTROS_LLAVES)
      .leftJoin(`${TABLES.COMUNIDAD} as c_reg`, 'c_reg.id', `${TABLES.REGISTROS_LLAVES}.comunidad_id`)
      .leftJoin(`${TABLES.COMUNIDAD} as c_reclama`, 'c_reclama.id', `${TABLES.REGISTROS_LLAVES}.reclama_comunidad_id`)
      .leftJoin(`${TABLES.COMUNIDAD} as c_entrega`, 'c_entrega.id', `${TABLES.REGISTROS_LLAVES}.entrega_comunidad_id`)
      .leftJoin(`${TABLES.USUARIOS} as u_gestion`, 'u_gestion.id', `${TABLES.REGISTROS_LLAVES}.gestionado_por_usuario_id`)
      .leftJoin(`${TABLES.USUARIOS} as u_gestion_dev`, 'u_gestion_dev.id', `${TABLES.REGISTROS_LLAVES}.gestionado_por_devolucion_usuario_id`)
      .leftJoin(`${TABLES.UBICACIONES_OPERATIVAS} as uo_prestamo`, 'uo_prestamo.id', `${TABLES.REGISTROS_LLAVES}.ubicacion_prestamo_id`)
      .leftJoin(`${TABLES.UBICACIONES_OPERATIVAS} as uo_devolucion`, 'uo_devolucion.id', `${TABLES.REGISTROS_LLAVES}.ubicacion_devolucion_id`)
      .whereNull(`${TABLES.REGISTROS_LLAVES}.deleted_at`)
      .select(
        `${TABLES.REGISTROS_LLAVES}.*`,
        'c_reg.numero_documento as numero_documento',
        'c_reclama.numero_documento as numero_documento_reclama',
        'c_entrega.numero_documento as numero_documento_entrega',
        'u_gestion.rol as gestionado_por_rol',
        'u_gestion.nombre as gestionado_por_nombre',
        'u_gestion_dev.rol as gestionado_por_devolucion_rol',
        'u_gestion_dev.nombre as gestionado_por_devolucion_nombre',
        'uo_prestamo.clave as ubicacion_prestamo',
        'uo_devolucion.clave as ubicacion_devolucion'
      );
  }

  /**
   * @param {string|null} [filtroUsuarioId] - cuando se pasa, restringe a los
   * registros gestionados por ese `usuario_id` (usado para que una portería
   * solo vea las llaves que ella misma entregó, no las de otra portería).
   * `null`/`undefined` => sin filtro (admin/aux ven todo, comportamiento previo).
   * @returns {Promise<object[]>} Registros con préstamo activo (en_prestamo, en_mora, demora_entrega)
   */
  async findPendientes(filtroUsuarioId = null) {
    const query = this._readQuery().whereIn(`${TABLES.REGISTROS_LLAVES}.estado`, ['en_prestamo', 'en_mora', 'demora_entrega']);
    if (filtroUsuarioId) {
      query.andWhere(`${TABLES.REGISTROS_LLAVES}.gestionado_por_usuario_id`, filtroUsuarioId);
    }
    return query;
  }

  /** @param {string} documento @returns {Promise<object|null>} */
  async findPendienteByDocumento(documento) {
    const row = await this._readQuery()
      .whereIn(`${TABLES.REGISTROS_LLAVES}.estado`, ['en_prestamo', 'en_mora', 'demora_entrega'])
      .andWhere('c_reg.numero_documento', String(documento))
      .first();
    return row || null;
  }

  /** @param {string} documento @returns {Promise<object[]>} Todos los préstamos activos del docente */
  async findPendientesByDocumento(documento) {
    return this._readQuery()
      .whereIn(`${TABLES.REGISTROS_LLAVES}.estado`, ['en_prestamo', 'en_mora', 'demora_entrega'])
      .andWhere('c_reg.numero_documento', String(documento));
  }

  /**
   * @param {string} id
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async findById(id, executor = this.db) {
    const row = await this._readQuery(executor).where(`${TABLES.REGISTROS_LLAVES}.id`, id).first();
    return row || null;
  }

  /** @param {string} fechaStr - Formato YYYY-MM-DD @returns {Promise<object[]>} */
  async findByFecha(fechaStr) {
    const rango = rangoDelDiaEnBogota(fechaStr);
    if (!rango) throw ApiError.badRequest(`Fecha inválida: ${fechaStr}`);
    return this._readQuery().whereBetween(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, rango);
  }

  /**
   * @param {string} fechaStr - Formato YYYY-MM-DD
   * @param {string|null} [filtroUsuarioId] - ver `findPendientes`
   * @returns {Promise<object[]>}
   */
  async findPendientesByFecha(fechaStr, filtroUsuarioId = null) {
    const rango = rangoDelDiaEnBogota(fechaStr);
    if (!rango) throw ApiError.badRequest(`Fecha inválida: ${fechaStr}`);
    const query = this._readQuery()
      .whereIn(`${TABLES.REGISTROS_LLAVES}.estado`, ['en_prestamo', 'en_mora', 'demora_entrega'])
      .andWhereBetween(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, rango);
    if (filtroUsuarioId) {
      query.andWhere(`${TABLES.REGISTROS_LLAVES}.gestionado_por_usuario_id`, filtroUsuarioId);
    }
    return query;
  }

  /** @param {object} filters @param {object|null} pagination @returns {Promise<object>} */
  async findHistorial(filters = {}, pagination = null) {
    const query = this._readQuery();
    if (filters.fecha) {
      const rango = rangoDelDiaEnBogota(filters.fecha);
      if (!rango) throw ApiError.badRequest(`Fecha inválida: ${filters.fecha}`);
      query.whereBetween(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, rango);
    }
    if (filters.documento) query.andWhere('c_reg.numero_documento', String(filters.documento));
    if (filters.estado) query.andWhere(`${TABLES.REGISTROS_LLAVES}.estado`, filters.estado);
    if (filters.gestionado_por) query.andWhere(`${TABLES.REGISTROS_LLAVES}.gestionado_por_usuario_id`, filters.gestionado_por);
    query.orderBy(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, 'desc');
    return applyPagination(query, pagination);
  }

  /**
   * Registros gestionados (entregados/devueltos) por un usuario logueado
   * concreto — reutilizable desde un futuro historial por usuario.
   * @param {string} usuarioId @returns {Promise<object[]>}
   */
  async findByGestionadoPor(usuarioId) {
    return this._readQuery()
      .where(`${TABLES.REGISTROS_LLAVES}.gestionado_por_usuario_id`, usuarioId)
      .orderBy(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, 'desc');
  }

  /**
   * Resuelve los campos "de negocio" (numero_documento/ubicacion como
   * string/aula) a las columnas y FKs reales de `registros_llaves`.
   * Tolerante: cualquier FK que no resuelva queda NULL, nunca bloquea la
   * escritura (igual criterio que el importador de Excel en S3).
   * @param {object} registro
   * @returns {Promise<object>} Payload listo para insertar/actualizar
   */
  async _resolvePayload(registro) {
    const payload = {};
    for (const col of PASSTHROUGH_COLUMNS) {
      if (registro[col] !== undefined) payload[col] = registro[col];
    }

    if (registro.docente !== undefined) payload.docente_nombre = registro.docente;

    if (registro.numero_documento !== undefined) {
      const persona = registro.numero_documento
        ? await comunidadRepository.findByDocumento(registro.numero_documento)
        : null;
      // A diferencia de las resoluciones tolerantes de abajo (salón/
      // ubicación), la identidad del titular del préstamo NO puede quedar en
      // NULL: aparte de ser un problema de integridad de datos por sí solo
      // (un préstamo sin dueño conocido), un `comunidad_id` NULL nunca choca
      // contra el índice único de dedupe (`NULL != NULL` en Postgres),
      // dejando pasar duplicados silenciosamente.
      if (registro.numero_documento && !persona) {
        throw ApiError.badRequest('No se encontró a la persona con ese documento en el sistema');
      }
      payload.comunidad_id = persona ? persona.id : null;
    }
    if (registro.numero_documento_reclama !== undefined) {
      const reclama = registro.numero_documento_reclama
        ? await comunidadRepository.findByDocumento(registro.numero_documento_reclama)
        : null;
      payload.reclama_comunidad_id = reclama ? reclama.id : null;
    }
    if (registro.numero_documento_entrega !== undefined) {
      const entrega = registro.numero_documento_entrega
        ? await comunidadRepository.findByDocumento(registro.numero_documento_entrega)
        : null;
      payload.entrega_comunidad_id = entrega ? entrega.id : null;
    }

    if (registro.aula !== undefined) {
      const salon = registro.aula ? await salonRepository.findByNombre(registro.aula) : null;
      payload.salon_id = salon ? salon.id : null;
    }

    if (registro.ubicacion_prestamo !== undefined) {
      const ubicacion = registro.ubicacion_prestamo
        ? await ubicacionRepository.findByClave(registro.ubicacion_prestamo)
        : null;
      payload.ubicacion_prestamo_id = ubicacion ? ubicacion.id : null;
    }
    if (registro.ubicacion_devolucion !== undefined) {
      const ubicacion = registro.ubicacion_devolucion
        ? await ubicacionRepository.findByClave(registro.ubicacion_devolucion)
        : null;
      payload.ubicacion_devolucion_id = ubicacion ? ubicacion.id : null;
    }

    return payload;
  }

  /**
   * Busca el registro más reciente de un aula/documento con
   * `fecha_hora_entrega` dentro de un rango — usado por `reservas` (S6)
   * para localizar la llave asociada a una reserva histórica que no tiene
   * `registro_llave_id` enlazado directamente (compatibilidad hacia atrás,
   * mismo criterio que usaba `Llave.findOne(...).sort({fecha_hora_entrega:-1})`
   * en el código Mongo original).
   * @param {string} aula @param {string} documento @param {Date} desde @param {Date} hasta
   * @returns {Promise<object|null>}
   */
  async findUltimaByAulaDocumentoFecha(aula, documento, desde, hasta) {
    const row = await this._readQuery()
      .where(`${TABLES.REGISTROS_LLAVES}.aula`, aula)
      .andWhere('c_reg.numero_documento', String(documento))
      .andWhereBetween(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, [desde, hasta])
      .orderBy(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, 'desc')
      .first();
    return row || null;
  }

  /**
   * Llave activa (en_prestamo) para un aula dentro de un rango de fecha —
   * usado por `reservas.disponibilidadSmart` (S6) para saber si un salón
   * programado ya tiene la llave reclamada.
   * @param {string} aula @param {Date} desde @param {Date} hasta
   * @returns {Promise<object|null>}
   */
  async findActivaByAulaFecha(aula, desde, hasta) {
    const row = await this._readQuery()
      .where(`${TABLES.REGISTROS_LLAVES}.aula`, aula)
      .andWhere(`${TABLES.REGISTROS_LLAVES}.estado`, 'en_prestamo')
      .andWhereBetween(`${TABLES.REGISTROS_LLAVES}.fecha_hora_entrega`, [desde, hasta])
      .first();
    return row || null;
  }

  /**
   * @param {object} registro
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor] - trx cuando el
   * insert forma parte de una cadena de préstamos consecutivos que debe
   * confirmarse/revertirse en bloque (ver `persistirPrestamo`/`registrarEntrega`).
   * @returns {Promise<object>}
   */
  async create(registro, executor = this.db) {
    const payload = await this._resolvePayload(registro);
    const [row] = await executor(TABLES.REGISTROS_LLAVES)
      .insert({ id: newId(), ...payload })
      .returning('*');
    return this.findById(row.id, executor);
  }

  /**
   * @param {string} id
   * @param {object} updates
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async update(id, updates, executor = this.db) {
    const payload = await this._resolvePayload(updates);
    if (!Object.keys(payload).length) return this.findById(id, executor);

    const [row] = await executor(TABLES.REGISTROS_LLAVES)
      .where({ id })
      .whereNull('deleted_at')
      .update(payload)
      .returning('*');
    if (!row) return null;
    return this.findById(id, executor);
  }

  /**
   * Variante de `update()` para el flujo de devolución: además de `id` y
   * `deleted_at`, exige `estado = 'en_prestamo'` en la MISMA sentencia SQL
   * (no una lectura previa + update separado). Sin esto, dos solicitudes de
   * devolución concurrentes para el mismo registro pasan ambas la validación
   * en JS (`registro.estado === 'en_prestamo'`, hecha en un SELECT anterior)
   * antes de que ninguna escriba, y la segunda pisa silenciosamente
   * `quien_entrega`/`ubicacion_devolucion` de la primera (lost update).
   * @param {string} id
   * @param {object} updates
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async updateDevolucion(id, updates, executor = this.db) {
    const payload = await this._resolvePayload(updates);
    if (!Object.keys(payload).length) return this.findById(id, executor);

    const rows = await executor(TABLES.REGISTROS_LLAVES)
      .where({ id })
      .whereNull('deleted_at')
      .andWhere('estado', 'en_prestamo')
      .update(payload)
      .returning('*');
    if (!rows.length) {
      throw ApiError.conflict('Esta llave ya fue devuelta');
    }
    return this.findById(id, executor);
  }
}

module.exports = new LlaveRepository();
