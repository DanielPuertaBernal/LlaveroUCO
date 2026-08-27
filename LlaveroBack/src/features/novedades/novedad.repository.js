'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { applyPagination } = require('../../shared/utils/pagination.helper');
const comunidadRepository = require('../comunidad/comunidad.repository');
const salonRepository = require('../salones/salon.repository');
const elementoAfectadoService = require('../elementos-afectados/elementoAfectado.service');

/**
 * Repositorio de `novedades` (Fase S6 de la migración Mongo → Postgres).
 * Reemplaza el modelo Mongoose `Novedad` (novedad.schema.js).
 *
 * Capability `novedad-resource-reference` del spec: el discriminador
 * polimórfico `tipo_recurso`('llave'|'equipo') + `recurso_id` (ObjectId sin
 * FK real) se reemplaza por dos columnas FK excluyentes nullable
 * (`llave_id`, `equipo_id`) + `CHECK (num_nonnulls(llave_id, equipo_id) = 1)`.
 * El API HTTP (novedad.routes.js/novedad.controller.js) sigue enviando
 * `tipo_recurso`+`recurso_id` sin cambios — este repositorio traduce, mismo
 * patrón que `llave.repository.js`/`reserva.repository.js`. A diferencia de
 * esas FKs, aquí NO hace falta un lookup: `recurso_id` YA es el id real de
 * la fila de `registros_llaves`/`equipos` (antes era el ObjectId Mongo del
 * mismo documento), así que se asigna directo a `llave_id`/`equipo_id`.
 *
 * `prestamo_ref` se elimina como campo de API (ver nota en la migración
 * 007): el único productor lo llenaba con el mismo id que `recurso_id`, una
 * referencia real a la tabla `registros_llaves`, no a `prestamos` (préstamo
 * de equipo) como el nombre sugería. La columna `prestamo_id` (FK real a
 * `prestamos`, per design) queda disponible sin poblar hasta que exista un
 * flujo que la necesite.
 */
class NovedadRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  _readQuery() {
    return this.db(TABLES.NOVEDADES)
      .leftJoin(`${TABLES.COMUNIDAD} as c_rep`, 'c_rep.id', `${TABLES.NOVEDADES}.reportado_por_comunidad_id`)
      .leftJoin(`${TABLES.SALONES} as s`, 's.id', `${TABLES.NOVEDADES}.salon_id`)
      .leftJoin(`${TABLES.ELEMENTOS_AFECTADOS} as ea`, 'ea.id', `${TABLES.NOVEDADES}.elemento_afectado_id`)
      .whereNull(`${TABLES.NOVEDADES}.deleted_at`)
      .select(
        `${TABLES.NOVEDADES}.*`,
        'ea.clave as elemento_afectado_clave',
        'ea.nombre as elemento_afectado_nombre',
        this.db.raw(`
          CASE
            WHEN ${TABLES.NOVEDADES}.llave_id IS NOT NULL THEN 'llave'
            WHEN ${TABLES.NOVEDADES}.equipo_id IS NOT NULL THEN 'equipo'
            ELSE 'general'
          END as tipo_recurso
        `),
        this.db.raw(`coalesce(${TABLES.NOVEDADES}.llave_id, ${TABLES.NOVEDADES}.equipo_id) as recurso_id`)
      );
  }

  /** Traduce el payload de negocio (tipo_recurso/recurso_id, reportado_por, salon) a las columnas reales. */
  async _buildPayload(data) {
    const payload = {};
    for (const col of ['categoria', 'descripcion', 'estado', 'resolucion', 'fecha_resolucion', 'notificacion_admin_enviada', 'reportado_por_nombre', 'en_revision_por', 'en_revision_en', 'resuelto_por']) {
      if (data[col] !== undefined) payload[col] = data[col];
    }

    if (data.tipo_recurso !== undefined || data.recurso_id !== undefined) {
      if (data.tipo_recurso === 'llave') {
        payload.llave_id = data.recurso_id || null;
        payload.equipo_id = null;
      } else if (data.tipo_recurso === 'equipo') {
        payload.equipo_id = data.recurso_id || null;
        payload.llave_id = null;
      } else {
        // 'general': novedad sin llave/equipo vinculado (ej. daño a un
        // salón/frontón sin préstamo activo involucrado).
        payload.llave_id = null;
        payload.equipo_id = null;
      }
    }

    if (data.reportado_por !== undefined) {
      payload.reportado_por = data.reportado_por;
      const persona = data.reportado_por ? await comunidadRepository.findByDocumento(data.reportado_por) : null;
      payload.reportado_por_comunidad_id = persona ? persona.id : null;
    }

    if (data.salon !== undefined) {
      payload.salon = data.salon;
      const salon = data.salon ? await salonRepository.findByNombre(data.salon) : null;
      payload.salon_id = salon ? salon.id : null;
    }

    // El API acepta id o clave del catálogo (`elementoAfectadoService.resolverId`)
    // para que el front no tenga que hacer un lookup previo.
    if (data.elemento_afectado !== undefined || data.elemento_afectado_id !== undefined) {
      const ref = data.elemento_afectado_id ?? data.elemento_afectado;
      payload.elemento_afectado_id = await elementoAfectadoService.resolverId(ref);
    }

    if (data.cantidad_afectada !== undefined) {
      const cantidad = Number.parseInt(data.cantidad_afectada, 10);
      payload.cantidad_afectada = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
    }

    return payload;
  }

  /** @param {object} data @returns {Promise<object>} */
  async create(data) {
    const payload = await this._buildPayload(data);
    const [row] = await this.db(TABLES.NOVEDADES).insert({ id: newId(), ...payload }).returning('*');
    return this.findById(row.id);
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) {
    const row = await this._readQuery().where(`${TABLES.NOVEDADES}.id`, id).first();
    return row || null;
  }

  /** @param {string} id @param {object} updates @returns {Promise<object|null>} */
  async updateById(id, updates) {
    const payload = await this._buildPayload(updates);
    if (!Object.keys(payload).length) return this.findById(id);
    const [row] = await this.db(TABLES.NOVEDADES)
      .where({ id })
      .whereNull('deleted_at')
      .update(payload)
      .returning('*');
    if (!row) return null;
    return this.findById(id);
  }

  /**
   * @param {string} llaveId - id de la llave (`registros_llaves.id`) —
   * antes llamado `prestamoId` (nombre heredado y ambiguo del Mongo
   * original, ver nota de bug en apply-progress: `prestamo._id` en
   * `notificacion.service.js` en realidad siempre fue un id de llave).
   * @returns {Promise<object|null>}
   */
  async findByPrestamoRef(llaveId) {
    const row = await this._readQuery().where(`${TABLES.NOVEDADES}.llave_id`, llaveId).first();
    return row || null;
  }

  async findAll(filters = {}, pagination = null) {
    const query = this._readQuery();
    if (filters.tipo_recurso === 'llave') query.whereNotNull(`${TABLES.NOVEDADES}.llave_id`);
    if (filters.tipo_recurso === 'equipo') query.whereNotNull(`${TABLES.NOVEDADES}.equipo_id`);
    if (filters.tipo_recurso === 'general') {
      query.whereNull(`${TABLES.NOVEDADES}.llave_id`).whereNull(`${TABLES.NOVEDADES}.equipo_id`);
    }
    if (filters.estado) query.andWhere(`${TABLES.NOVEDADES}.estado`, filters.estado);
    if (filters.categoria) query.andWhere(`${TABLES.NOVEDADES}.categoria`, filters.categoria);
    // Se filtra por clave y no por id: la clave es estable y legible en la
    // URL, el id es un uuid que el front tendría que resolver primero.
    if (filters.elemento_afectado) query.andWhere('ea.clave', filters.elemento_afectado);
    if (filters.reportado_por) query.andWhere(`${TABLES.NOVEDADES}.reportado_por`, filters.reportado_por);
    if (filters.busqueda) {
      const b = `%${filters.busqueda}%`;
      query.andWhere((qb) =>
        qb.whereILike(`${TABLES.NOVEDADES}.reportado_por`, b)
          .orWhereILike(`${TABLES.NOVEDADES}.reportado_por_nombre`, b)
          .orWhereILike(`${TABLES.NOVEDADES}.salon`, b)
          .orWhereILike(`${TABLES.NOVEDADES}.descripcion`, b)
          .orWhereILike('ea.nombre', b)
      );
    }
    if (filters.desde) query.andWhere(`${TABLES.NOVEDADES}.fecha_reporte`, '>=', new Date(`${filters.desde}T00:00:00`));
    if (filters.hasta) query.andWhere(`${TABLES.NOVEDADES}.fecha_reporte`, '<=', new Date(`${filters.hasta}T23:59:59.999`));
    query.orderBy(`${TABLES.NOVEDADES}.fecha_reporte`, 'desc');
    return applyPagination(query, pagination);
  }

  async estadisticas() {
    const [porEstado, porCategoria] = await Promise.all([
      this.db(TABLES.NOVEDADES).whereNull('deleted_at').groupBy('estado').select('estado').count({ total: '*' }),
      this.db(TABLES.NOVEDADES).whereNull('deleted_at').groupBy('categoria').select('categoria').count({ total: '*' }),
    ]);
    const tipoRecursoCase = `
      CASE
        WHEN llave_id IS NOT NULL THEN 'llave'
        WHEN equipo_id IS NOT NULL THEN 'equipo'
        ELSE 'general'
      END
    `;
    const porTipoRows = await this.db(TABLES.NOVEDADES)
      .whereNull('deleted_at')
      .select(this.db.raw(`${tipoRecursoCase} as tipo_recurso`))
      .count({ total: '*' })
      .groupByRaw(tipoRecursoCase);

    // El punto del catálogo: cuántas sillas/ventanas rotas hay, no cuántos
    // "daños físicos". Se suma `cantidad_afectada` en vez de contar filas —
    // un reporte de "3 sillas rotas" es una novedad pero tres sillas.
    const porElementoRows = await this.db(`${TABLES.NOVEDADES} as n`)
      .innerJoin(`${TABLES.ELEMENTOS_AFECTADOS} as ea`, 'ea.id', 'n.elemento_afectado_id')
      .whereNull('n.deleted_at')
      .groupBy('ea.clave', 'ea.nombre')
      .select('ea.clave', 'ea.nombre')
      .count({ reportes: '*' })
      .sum({ unidades: 'n.cantidad_afectada' });

    const mapReduce = (arr, key) => arr.reduce((acc, r) => ({ ...acc, [r[key]]: Number(r.total) }), {});
    return {
      por_estado: mapReduce(porEstado, 'estado'),
      por_categoria: mapReduce(porCategoria, 'categoria'),
      por_tipo: mapReduce(porTipoRows, 'tipo_recurso'),
      por_elemento: porElementoRows.map((r) => ({
        clave: r.clave,
        nombre: r.nombre,
        reportes: Number(r.reportes),
        unidades: Number(r.unidades),
      })),
      total: porEstado.reduce((s, r) => s + Number(r.total), 0),
    };
  }
}

module.exports = new NovedadRepository();
