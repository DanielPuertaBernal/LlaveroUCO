'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');

/**
 * Repositorio de `prestamos`/`prestamo_equipos`/`devoluciones`/
 * `devolucion_equipos` (Fase S5 de la migración Mongo → Postgres).
 *
 * Reemplaza los modelos Mongoose `Prestamo`/`Devolucion` (prestamo.schema.js)
 * y sus arrays embebidos `equipos`/`equipos_devueltos`.
 *
 * Cada método de escritura y de lectura-para-escritura acepta un `executor`
 * opcional (una transacción Knex, `trx`) — mismo rol que el parámetro
 * `session` de Mongoose que tenían estos repositorios antes de la
 * migración. Por defecto usa la conexión global (`this.db`). Esta es la
 * primera fase con un `knex.transaction()` real de múltiples sentencias:
 * `prestamo.service.js` abre la transacción y pasa `trx` a cada llamada del
 * repositorio que participa en la escritura atómica header+líneas.
 */
class PrestamoRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  /**
   * Query de lectura de cabecera: JOIN con `comunidad` (docente y
   * responsable) y `ubicaciones_operativas` para re-exponer los antiguos
   * nombres de campo `docente_responsable_codigo`/`ubicacion_prestamo` que
   * el resto del código (service, controller) sigue consumiendo por ese
   * nombre — mismo patrón usado por `llave.repository.js` en S4.
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   */
  _headerQuery(executor = this.db) {
    return executor(TABLES.PRESTAMOS)
      .leftJoin(`${TABLES.COMUNIDAD} as c_responsable`, 'c_responsable.id', `${TABLES.PRESTAMOS}.docente_responsable_id`)
      .leftJoin(TABLES.UBICACIONES_OPERATIVAS, `${TABLES.UBICACIONES_OPERATIVAS}.id`, `${TABLES.PRESTAMOS}.ubicacion_prestamo_id`)
      .whereNull(`${TABLES.PRESTAMOS}.deleted_at`)
      .select(
        `${TABLES.PRESTAMOS}.*`,
        'c_responsable.numero_documento as docente_responsable_codigo',
        `${TABLES.UBICACIONES_OPERATIVAS}.clave as ubicacion_prestamo`
      );
  }

  /**
   * Adjunta el array `equipos` (líneas de `prestamo_equipos`) a cada
   * préstamo — preserva la forma de respuesta que el frontend consumía
   * cuando `equipos` era un array embebido de Mongo.
   * @param {object[]} prestamos
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object[]>}
   */
  async _attachEquipos(prestamos, executor = this.db) {
    if (!prestamos.length) return prestamos;
    const ids = prestamos.map((p) => p.id);
    const lineas = await executor(TABLES.PRESTAMO_EQUIPOS)
      .whereIn('prestamo_id', ids)
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');

    const porPrestamo = new Map();
    for (const linea of lineas) {
      if (!porPrestamo.has(linea.prestamo_id)) porPrestamo.set(linea.prestamo_id, []);
      porPrestamo.get(linea.prestamo_id).push(linea);
    }

    return prestamos.map((p) => ({ ...p, equipos: porPrestamo.get(p.id) || [] }));
  }

  /** @returns {Promise<object[]>} */
  async findAll() {
    const rows = await this._headerQuery();
    return this._attachEquipos(rows);
  }

  /** @returns {Promise<object[]>} Préstamos activos o parcialmente devueltos */
  async findActivos() {
    const rows = await this._headerQuery().whereIn(`${TABLES.PRESTAMOS}.estado`, ['activo', 'parcialmente_devuelto']);
    return this._attachEquipos(rows);
  }

  /**
   * @param {string} id
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async findById(id, executor = this.db) {
    const row = await this._headerQuery(executor).where(`${TABLES.PRESTAMOS}.id`, id).first();
    if (!row) return null;
    const [withEquipos] = await this._attachEquipos([row], executor);
    return withEquipos;
  }

  /** @param {string} codigoNfc @returns {Promise<object[]>} */
  async findByDocente(codigoNfc) {
    const rows = await this._headerQuery().where(`${TABLES.PRESTAMOS}.docente_codigo_nfc`, codigoNfc);
    return this._attachEquipos(rows);
  }

  /**
   * Préstamos gestionados (creados/actualizados) por un usuario logueado
   * concreto — reutilizable desde un futuro historial por usuario.
   * @param {string} usuarioId @returns {Promise<object[]>}
   */
  async findByGestionadoPor(usuarioId) {
    const rows = await this._headerQuery().where(`${TABLES.PRESTAMOS}.gestionado_por_usuario_id`, usuarioId);
    return this._attachEquipos(rows);
  }

  /**
   * @param {string} codigoNfc
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async findActivoByDocente(codigoNfc, executor = this.db) {
    const row = await this._headerQuery(executor)
      .where(`${TABLES.PRESTAMOS}.docente_codigo_nfc`, codigoNfc)
      .whereIn(`${TABLES.PRESTAMOS}.estado`, ['activo', 'parcialmente_devuelto'])
      .first();
    if (!row) return null;
    const [withEquipos] = await this._attachEquipos([row], executor);
    return withEquipos;
  }

  /**
   * @param {object} data
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object>}
   */
  async create(data, executor = this.db) {
    const [row] = await executor(TABLES.PRESTAMOS).insert({ id: newId(), ...data }).returning('*');
    return row;
  }

  /**
   * @param {string} id @param {object} updates
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async update(id, updates, executor = this.db) {
    const [row] = await executor(TABLES.PRESTAMOS)
      .where({ id })
      .whereNull('deleted_at')
      .update(updates)
      .returning('*');
    return row || null;
  }

  /**
   * Inserta una o varias líneas de `prestamo_equipos` para un préstamo.
   * @param {string} prestamoId
   * @param {object[]} detalles - Cada uno sin `id`/`prestamo_id` (se generan aquí)
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object[]>}
   */
  async addEquiposLinea(prestamoId, detalles, executor = this.db) {
    if (!detalles.length) return [];
    const payload = detalles.map((detalle) => ({ id: newId(), prestamo_id: prestamoId, ...detalle }));
    return executor(TABLES.PRESTAMO_EQUIPOS).insert(payload).returning('*');
  }

  /**
   * Actualiza una línea de `prestamo_equipos` por su propio `id` (no el del
   * préstamo) — usado al marcar un equipo como devuelto.
   * @param {string} lineaId @param {object} updates
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async updateEquipoLinea(lineaId, updates, executor = this.db) {
    const [row] = await executor(TABLES.PRESTAMO_EQUIPOS)
      .where({ id: lineaId })
      .whereNull('deleted_at')
      .update(updates)
      .returning('*');
    return row || null;
  }

  /**
   * Ids de equipo actualmente prestados (estado_equipo='entregado' en un
   * préstamo activo/parcialmente_devuelto), entre el conjunto `equiposIds`.
   * Equivale al antiguo `Prestamo.find({ equipos: { $elemMatch: ... } })`.
   * @param {string[]} equiposIds
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<string[]>}
   */
  async findEquiposPrestados(equiposIds = [], executor = this.db) {
    if (!equiposIds.length) return [];
    const rows = await executor(TABLES.PRESTAMO_EQUIPOS)
      .join(TABLES.PRESTAMOS, `${TABLES.PRESTAMOS}.id`, `${TABLES.PRESTAMO_EQUIPOS}.prestamo_id`)
      .whereIn(`${TABLES.PRESTAMO_EQUIPOS}.equipo_id`, equiposIds)
      .andWhere(`${TABLES.PRESTAMO_EQUIPOS}.estado_equipo`, 'entregado')
      .whereNull(`${TABLES.PRESTAMO_EQUIPOS}.deleted_at`)
      .whereIn(`${TABLES.PRESTAMOS}.estado`, ['activo', 'parcialmente_devuelto'])
      .whereNull(`${TABLES.PRESTAMOS}.deleted_at`)
      .distinct(`${TABLES.PRESTAMO_EQUIPOS}.equipo_id as equipo_id`);
    return rows.map((r) => r.equipo_id);
  }

  /**
   * @param {string} equipoId
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<boolean>}
   */
  async verificarEquipoPrestado(equipoId, executor = this.db) {
    const ids = await this.findEquiposPrestados([equipoId], executor);
    return ids.length > 0;
  }
}

class DevolucionRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  /** @param {import('knex').Knex|import('knex').Knex.Transaction} [executor] */
  _headerQuery(executor = this.db) {
    return executor(TABLES.DEVOLUCIONES)
      .leftJoin(TABLES.UBICACIONES_OPERATIVAS, `${TABLES.UBICACIONES_OPERATIVAS}.id`, `${TABLES.DEVOLUCIONES}.ubicacion_devolucion_id`)
      .whereNull(`${TABLES.DEVOLUCIONES}.deleted_at`)
      .select(
        `${TABLES.DEVOLUCIONES}.*`,
        `${TABLES.UBICACIONES_OPERATIVAS}.clave as ubicacion_devolucion`
      );
  }

  /**
   * @param {object[]} devoluciones
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   */
  async _attachEquiposDevueltos(devoluciones, executor = this.db) {
    if (!devoluciones.length) return devoluciones;
    const ids = devoluciones.map((d) => d.id);
    const lineas = await executor(TABLES.DEVOLUCION_EQUIPOS)
      .whereIn('devolucion_id', ids)
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');

    const porDevolucion = new Map();
    for (const linea of lineas) {
      if (!porDevolucion.has(linea.devolucion_id)) porDevolucion.set(linea.devolucion_id, []);
      porDevolucion.get(linea.devolucion_id).push(linea);
    }

    return devoluciones.map((d) => ({ ...d, equipos_devueltos: porDevolucion.get(d.id) || [] }));
  }

  /**
   * @param {object} data
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object>}
   */
  async create(data, executor = this.db) {
    const [row] = await executor(TABLES.DEVOLUCIONES).insert({ id: newId(), ...data }).returning('*');
    return row;
  }

  /**
   * @param {string} devolucionId @param {object[]} detalles
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object[]>}
   */
  async addEquiposLinea(devolucionId, detalles, executor = this.db) {
    if (!detalles.length) return [];
    const payload = detalles.map((detalle) => ({ id: newId(), devolucion_id: devolucionId, ...detalle }));
    return executor(TABLES.DEVOLUCION_EQUIPOS).insert(payload).returning('*');
  }

  /**
   * @param {string} id
   * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor]
   * @returns {Promise<object|null>}
   */
  async findById(id, executor = this.db) {
    const row = await this._headerQuery(executor).where(`${TABLES.DEVOLUCIONES}.id`, id).first();
    if (!row) return null;
    const [withEquipos] = await this._attachEquiposDevueltos([row], executor);
    return withEquipos;
  }

  /** @param {string} prestamoId @returns {Promise<object[]>} */
  async findByPrestamo(prestamoId) {
    const rows = await this._headerQuery().where(`${TABLES.DEVOLUCIONES}.prestamo_id`, prestamoId);
    return this._attachEquiposDevueltos(rows);
  }

  /**
   * Devoluciones gestionadas por un usuario logueado concreto — reutilizable
   * desde un futuro historial por usuario.
   * @param {string} usuarioId @returns {Promise<object[]>}
   */
  async findByGestionadoPor(usuarioId) {
    const rows = await this._headerQuery().where(`${TABLES.DEVOLUCIONES}.gestionado_por_usuario_id`, usuarioId);
    return this._attachEquiposDevueltos(rows);
  }
}

module.exports = {
  prestamoRepository: new PrestamoRepository(),
  devolucionRepository: new DevolucionRepository(),
};
