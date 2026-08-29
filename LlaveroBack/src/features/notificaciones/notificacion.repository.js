'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { applyPagination } = require('../../shared/utils/pagination.helper');
const ApiError = require('../../shared/errors/api.error');
const { rangoDelDiaEnBogota } = require('../../shared/utils/date.helper');

/** Rango del día de Bogotá, o 400 si la fecha del filtro no es parseable. */
function rangoDelDia(fechaStr) {
  const rango = rangoDelDiaEnBogota(fechaStr);
  if (!rango) throw ApiError.badRequest(`Fecha inválida: ${fechaStr}`);
  return rango;
}
const salonRepository = require('../salones/salon.repository');

/**
 * Repositorio de `notificaciones` (Fase S6 de la migración Mongo →
 * Postgres). Reemplaza el modelo Mongoose `Notificacion`
 * (notificacion.schema.js).
 *
 * `prestamo_llave_id` se ELIMINA (duplicaba `llave_id`, spec
 * `notificaciones-dedupe`). El único parámetro que los callers seguían
 * llamando "prestamoLlaveId"/`prestamo._id` en realidad siempre fue el id
 * de una fila de `registros_llaves` (préstamo de LLAVE, no de equipo) — se
 * renombra a `llaveId` en la firma de los métodos de este repositorio para
 * eliminar la ambigüedad que la propia exploración S0 había señalado; los
 * callers en `notificacion.service.js` se actualizan para pasar
 * `prestamo.id` (antes `prestamo._id`, que ya no existe desde que
 * `llave.repository.js` devuelve filas Postgres — ver nota de bug en
 * apply-progress).
 *
 * Dedupe: antes lo garantizaban 2 índices únicos sparse de Mongo
 * (prestamo_llave_id+tipo+numero_recordatorio) y (reserva_id+tipo). Ahora
 * son 2 índices únicos parciales de Postgres
 * (`ux_notificaciones_dedupe_llave`, `ux_notificaciones_dedupe_reserva`,
 * ambos `WHERE deleted_at IS NULL AND <fk> IS NOT NULL`) — `createMany`
 * ignora violaciones de esos índices (23505) igual que antes ignoraba
 * `E11000`, para no romper el batch por duplicados ya enviados.
 */
class NotificacionRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  _readQuery() {
    return this.db(TABLES.NOTIFICACIONES)
      .leftJoin(`${TABLES.SALONES} as s`, 's.id', `${TABLES.NOTIFICACIONES}.salon_id`)
      .whereNull(`${TABLES.NOTIFICACIONES}.deleted_at`)
      .select(`${TABLES.NOTIFICACIONES}.*`);
  }

  /** Resuelve `salon` (nombre de texto) -> `salon_id`, tolerante (NULL si no hay match). */
  async _resolveSalonId(nombreSalon) {
    if (!nombreSalon) return null;
    const salon = await salonRepository.findByNombre(nombreSalon);
    return salon ? salon.id : null;
  }

  /** @param {object} data @returns {Promise<object>} */
  async create(data) {
    const payload = await this._buildPayload(data);
    const [row] = await this.db(TABLES.NOTIFICACIONES).insert({ id: newId(), ...payload }).returning('*');
    return row;
  }

  /**
   * @param {object[]} docs
   * @returns {Promise<object[]>} filas insertadas (omite duplicados de las
   * guardas de dedupe, igual que `insertMany({ordered:false})` + catch de
   * `E11000` en la versión Mongo)
   */
  async createMany(docs) {
    if (!docs?.length) return [];
    const payloads = await Promise.all(docs.map((d) => this._buildPayload(d)));
    const insertadas = [];
    // Insert uno por uno: una violación de índice único parcial (23505) en
    // un INSERT multi-fila abortaría el statement completo; insertar de a
    // una preserva el comportamiento "ignorar solo la fila duplicada".
    for (const payload of payloads) {
      try {
        const [row] = await this.db(TABLES.NOTIFICACIONES).insert({ id: newId(), ...payload }).returning('*');
        insertadas.push(row);
      } catch (err) {
        if (err.code !== '23505') throw err;
      }
    }
    return insertadas;
  }

  /** Traduce el payload de negocio (llave_id/salon texto) a las columnas reales. */
  async _buildPayload(data) {
    const payload = { ...data };
    delete payload.prestamo_llave_id; // campo eliminado (spec notificaciones-dedupe)

    if (data.salon !== undefined) {
      payload.salon_id = await this._resolveSalonId(data.salon);
    }
    return payload;
  }

  async findHistorial(filters = {}, pagination = null) {
    const query = this._readQuery();
    if (filters.fecha) query.andWhereBetween('fecha_envio', rangoDelDia(filters.fecha));
    if (filters.desde || filters.hasta) {
      const desde = filters.desde ? rangoDelDia(filters.desde)[0] : new Date(0);
      const hasta = filters.hasta ? rangoDelDia(filters.hasta)[1] : new Date();
      query.andWhereBetween('fecha_envio', [desde, hasta]);
    }
    if (filters.documento) query.andWhere('destinatario_documento', filters.documento);
    if (filters.estado_envio) query.andWhere('estado_envio', filters.estado_envio);
    if (filters.tipo_notificacion) query.andWhere('tipo_notificacion', filters.tipo_notificacion);
    if (filters.busqueda) {
      const b = `%${filters.busqueda}%`;
      query.andWhere((qb) => qb.whereILike('destinatario_nombre', b).orWhereILike('destinatario_documento', b));
    }
    query.orderBy('fecha_envio', 'desc');
    return applyPagination(query, pagination);
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) {
    const row = await this._readQuery().where(`${TABLES.NOTIFICACIONES}.id`, id).first();
    return row || null;
  }

  /** @param {string} id @param {object} updates @returns {Promise<object|null>} */
  async updateById(id, updates) {
    const payload = await this._buildPayload(updates);
    if (!Object.keys(payload).length) return this.findById(id);
    const [row] = await this.db(TABLES.NOTIFICACIONES)
      .where({ id })
      .whereNull('deleted_at')
      .update(payload)
      .returning('*');
    if (!row) return null;
    return this.findById(id);
  }

  /** @param {string} llaveId @param {string} tipoNotificacion @returns {Promise<number>} */
  async countByPrestamoAndTipo(llaveId, tipoNotificacion) {
    const [{ count }] = await this.db(TABLES.NOTIFICACIONES)
      .whereNull('deleted_at')
      .andWhere({ llave_id: llaveId, tipo_notificacion: tipoNotificacion })
      .count({ count: '*' });
    return Number(count);
  }

  /** Devuelve un mapa { [llave_id]: count } con los recordatorios enviados por préstamo (llave). */
  async contarRecordatoriosPorLlaves() {
    const rows = await this.db(TABLES.NOTIFICACIONES)
      .whereNull('deleted_at')
      .andWhere({ tipo_notificacion: 'recordatorio', estado_envio: 'enviado' })
      .whereNotNull('llave_id')
      .groupBy('llave_id')
      .select('llave_id')
      .count({ count: '*' });
    return rows.reduce((acc, r) => {
      acc[r.llave_id] = Number(r.count);
      return acc;
    }, {});
  }

  /** @param {string} llaveId @returns {Promise<object|null>} */
  async findLastByPrestamo(llaveId) {
    const row = await this._readQuery().where(`${TABLES.NOTIFICACIONES}.llave_id`, llaveId).orderBy('fecha_envio', 'desc').first();
    return row || null;
  }

  async findPendienteByReserva(reservaId) {
    const row = await this._readQuery()
      .where({ reserva_id: reservaId, tipo_notificacion: 'reserva_no_reclamada', estado_envio: 'pendiente' })
      .first();
    return row || null;
  }

  /** @param {string} llaveId @param {string} tipo @returns {Promise<object|null>} */
  async findLastByPrestamoAndTipo(llaveId, tipo) {
    const row = await this._readQuery()
      .where({ llave_id: llaveId, tipo_notificacion: tipo })
      .orderBy('fecha_envio', 'desc')
      .first();
    return row || null;
  }

  async findPendientesReintento(ahora) {
    return this._readQuery()
      .where('estado_envio', 'pendiente')
      .andWhere('intentos_envio', '>', 0)
      .andWhere('intentos_envio', '<', 3)
      .andWhere('proximo_reintento', '<=', ahora);
  }

  /**
   * Devuelve hasta `limit` notificaciones listas para enviar:
   * estado pendiente Y (sin reintento programado OR reintento ya vencido).
   */
  async findPendientesEnvio(limit = 50) {
    const ahora = new Date();
    return this._readQuery()
      .where('estado_envio', 'pendiente')
      .andWhereNot('tipo_notificacion', 'reserva_no_reclamada')
      .andWhere((qb) => qb.whereNull('proximo_reintento').orWhere('proximo_reintento', '<=', ahora))
      .orderBy('fecha_envio', 'asc')
      .limit(limit);
  }

  async estadisticas() {
    const [porEstado, porTipo] = await Promise.all([
      this.db(TABLES.NOTIFICACIONES).whereNull('deleted_at').groupBy('estado_envio').select('estado_envio').count({ total: '*' }),
      this.db(TABLES.NOTIFICACIONES).whereNull('deleted_at').groupBy('tipo_notificacion').select('tipo_notificacion').count({ total: '*' }),
    ]);
    return {
      por_estado: Object.fromEntries(porEstado.map((r) => [r.estado_envio, Number(r.total)])),
      por_tipo: Object.fromEntries(porTipo.map((r) => [r.tipo_notificacion, Number(r.total)])),
    };
  }
}

module.exports = new NotificacionRepository();
