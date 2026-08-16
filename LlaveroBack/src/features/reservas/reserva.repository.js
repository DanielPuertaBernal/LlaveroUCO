'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { applyPagination } = require('../../shared/utils/pagination.helper');
const { normalizeLookupKey } = require('../../shared/utils/normalize.helper');
const comunidadRepository = require('../comunidad/comunidad.repository');
const salonRepository = require('../salones/salon.repository');
const ApiError = require('../../shared/errors/api.error');

/**
 * Repositorio de `reservas` (Fase S6 de la migración Mongo → Postgres —
 * PRIORIDAD MÁXIMA de esta fase, ver nota de riesgo en apply-progress S4/S5).
 *
 * Reemplaza el modelo Mongoose `Reserva` (reserva.schema.js) Y cierra el
 * split-brain de escritura que dejó abierto S4: antes, `reserva.service.js`
 * creaba/actualizaba llaves directo contra el modelo Mongoose `Llave`
 * mientras `registros_llaves` ya vivía en Postgres — llaves entregadas al
 * aprobar una reserva quedaban invisibles para el resto del sistema. Ahora
 * toda escritura de llave pasa por `llaveRepository` (Postgres, S4).
 *
 * Mismo patrón de traducción "campos de negocio -> FKs reales" que
 * `llave.repository.js`/`salon.repository.js`/`programacion.repository.js`:
 * el resto del código (controller/service/frontend) sigue enviando/
 * recibiendo `solicitante_documento`/`nombre_bloque`/`nombre_salon`/
 * `responsable_documento`/`aprobado_por` como texto; este repositorio
 * resuelve/expone las FKs (`solicitante_comunidad_id`, `bloque_id`,
 * `salon_id`, `responsable_comunidad_id`, `aprobado_por_usuario_id`) por
 * dentro.
 *
 * A diferencia de `llave.repository.js`, `salon_id`/`bloque_id` NO son
 * tolerantes (NULL si no hay match): el design exige `NOT NULL` en ambas
 * columnas porque una reserva sin salón real no tiene sentido de negocio;
 * un salón inexistente se rechaza con 400 antes de llegar a la base de
 * datos (el `NOT NULL` de Postgres sería el mismo resultado pero con un
 * mensaje de error genérico).
 */

const ZONA_HORARIA_APP = 'America/Bogota';
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

class ReservaRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  _readQuery() {
    return this.db(TABLES.RESERVAS)
      .join(TABLES.SALONES, `${TABLES.SALONES}.id`, `${TABLES.RESERVAS}.salon_id`)
      .join(TABLES.BLOQUES, `${TABLES.BLOQUES}.id`, `${TABLES.RESERVAS}.bloque_id`)
      .leftJoin(`${TABLES.COMUNIDAD} as c_sol`, 'c_sol.id', `${TABLES.RESERVAS}.solicitante_comunidad_id`)
      .leftJoin(`${TABLES.COMUNIDAD} as c_resp`, 'c_resp.id', `${TABLES.RESERVAS}.responsable_comunidad_id`)
      .leftJoin(`${TABLES.USUARIOS} as u_aprob`, 'u_aprob.id', `${TABLES.RESERVAS}.aprobado_por_usuario_id`)
      .whereNull(`${TABLES.RESERVAS}.deleted_at`)
      .select(
        `${TABLES.RESERVAS}.*`,
        `${TABLES.SALONES}.nombre_salon as nombre_salon`,
        `${TABLES.BLOQUES}.nombre_bloque as nombre_bloque`,
        'c_sol.numero_documento as solicitante_documento',
        'c_resp.numero_documento as responsable_documento',
        this.db.raw("coalesce(u_aprob.nombre, reservas.aprobado_por_nombre) as aprobado_por")
      );
  }

  /**
   * Resuelve `nombre_salon` -> `{salon_id, bloque_id}` (obligatorio: una
   * reserva sin salón real es un error de negocio, no un dato tolerable).
   * @param {string} nombreSalon @returns {Promise<{salon_id: string, bloque_id: string}>}
   */
  async _resolveSalon(nombreSalon) {
    const salon = await salonRepository.findByNombre(nombreSalon);
    if (!salon) {
      throw ApiError.badRequest(`Salón '${nombreSalon}' no encontrado`);
    }
    return { salon_id: salon.id, bloque_id: salon.bloque_id };
  }

  /** @param {object} data @returns {Promise<object>} */
  async create(data) {
    const { salon_id, bloque_id } = await this._resolveSalon(data.nombre_salon);

    const solicitante = data.solicitante_documento
      ? await comunidadRepository.findByDocumento(data.solicitante_documento)
      : null;
    const responsable = data.responsable_documento
      ? await comunidadRepository.findByDocumento(data.responsable_documento)
      : null;

    const payload = {
      id: newId(),
      solicitante_comunidad_id: solicitante ? solicitante.id : null,
      solicitante_nombre: data.solicitante_nombre || '',
      bloque_id,
      salon_id,
      fecha: data.fecha,
      hora_inicio: data.hora_inicio,
      hora_fin: data.hora_fin,
      motivo: data.motivo || '',
      entregar_llave: data.entregar_llave !== false,
      tipo_solicitante: data.tipo_solicitante || 'docente',
      responsable_comunidad_id: responsable ? responsable.id : null,
      responsable_nombre: data.responsable_nombre || '',
      creado_por_rol: data.creado_por_rol || '',
    };
    if (data.estado !== undefined) payload.estado = data.estado;

    let row;
    try {
      [row] = await this.db(TABLES.RESERVAS).insert(payload).returning('*');
    } catch (err) {
      // `ux_reservas_slot` (007, mismo hora_inicio exacto) dispara 23505;
      // `ex_reservas_no_overlap` (017, cualquier solape de rango horario)
      // dispara 23P01 — mismo patrón de traducción a error de negocio legible
      // que `llave.workflows.js#persistirPrestamoConDedupe`.
      if (err.code === '23505') {
        throw ApiError.conflict('Ya existe una reserva para ese salón, fecha y hora de inicio');
      }
      if (err.code === '23P01') {
        throw ApiError.conflict('Este salón ya tiene una reserva que se cruza con ese horario');
      }
      throw err;
    }
    return this.findById(row.id);
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) {
    const row = await this._readQuery().where(`${TABLES.RESERVAS}.id`, id).first();
    return row || null;
  }

  /**
   * @param {string} id @param {object} updates
   * @returns {Promise<object|null>}
   */
  async updateById(id, updates) {
    const payload = {};

    if (updates.nombre_bloque !== undefined && updates.nombre_salon === undefined) {
      // nombre_bloque solo se actualiza en la práctica junto con nombre_salon
      // (el bloque real siempre viene del salón); se ignora en solitario.
    }
    if (updates.nombre_salon !== undefined) {
      const resolved = await this._resolveSalon(updates.nombre_salon);
      payload.salon_id = resolved.salon_id;
      payload.bloque_id = resolved.bloque_id;
    }
    if (updates.fecha !== undefined) payload.fecha = updates.fecha;
    if (updates.hora_inicio !== undefined) payload.hora_inicio = updates.hora_inicio;
    if (updates.hora_fin !== undefined) payload.hora_fin = updates.hora_fin;
    if (updates.motivo !== undefined) payload.motivo = updates.motivo;
    if (updates.estado !== undefined) payload.estado = updates.estado;
    if (updates.llave_entregada !== undefined) payload.llave_entregada = updates.llave_entregada;
    if (updates.registro_llave_id !== undefined) payload.registro_llave_id = updates.registro_llave_id;
    if (updates.checkin_estado !== undefined) payload.checkin_estado = updates.checkin_estado;
    if (updates.checkin_canal !== undefined) payload.checkin_canal = updates.checkin_canal;
    if (updates.checkin_at !== undefined) payload.checkin_at = updates.checkin_at;
    if (updates.aprobado_por !== undefined) payload.aprobado_por_nombre = updates.aprobado_por;
    if (updates.aprobado_por_usuario_id !== undefined) payload.aprobado_por_usuario_id = updates.aprobado_por_usuario_id;

    if (!Object.keys(payload).length) return this.findById(id);

    const [row] = await this.db(TABLES.RESERVAS)
      .where({ id })
      .whereNull('deleted_at')
      .update(payload)
      .returning('*');
    if (!row) return null;
    return this.findById(id);
  }

  /** @param {object} filters @param {object|null} pagination @returns {Promise<object>} */
  async findHistorial(filters = {}, pagination = null) {
    const query = this._readQuery();
    if (filters.nombre_bloque) query.andWhere(`${TABLES.BLOQUES}.nombre_bloque`, filters.nombre_bloque);
    if (filters.nombre_salon) query.andWhere(`${TABLES.SALONES}.nombre_salon`, filters.nombre_salon);
    if (filters.estado) query.andWhere(`${TABLES.RESERVAS}.estado`, filters.estado);
    if (filters.solicitante_documento) query.andWhere('c_sol.numero_documento', String(filters.solicitante_documento));
    if (filters.fecha) query.andWhere(`${TABLES.RESERVAS}.fecha`, filters.fecha);
    if (filters.busqueda) {
      const b = `%${filters.busqueda}%`;
      query.andWhere((qb) => {
        qb.whereILike(`${TABLES.RESERVAS}.solicitante_nombre`, b)
          .orWhereILike('c_sol.numero_documento', b)
          .orWhereILike(`${TABLES.RESERVAS}.motivo`, b);
      });
    }
    query.orderBy([{ column: `${TABLES.RESERVAS}.fecha`, order: 'desc' }, { column: `${TABLES.RESERVAS}.hora_inicio`, order: 'asc' }]);
    return applyPagination(query, pagination);
  }

  /**
   * Busca reservas activas que se solapen con el rango horario dado en un
   * salón y fecha. `fecha` ya es una columna `date` real — comparación
   * directa, sin la conversión de timezone que hacía falta en Mongo.
   */
  async findConflictos(nombre_salon, fecha, hora_inicio, hora_fin, excludeId = null) {
    const query = this._readQuery()
      .where(`${TABLES.SALONES}.nombre_salon`, nombre_salon)
      .andWhere(`${TABLES.RESERVAS}.fecha`, fecha)
      .whereIn(`${TABLES.RESERVAS}.estado`, ['pendiente', 'aprobada']);
    if (excludeId) query.andWhereNot(`${TABLES.RESERVAS}.id`, excludeId);

    const candidatas = await query;
    return candidatas.filter(
      (r) => toMin(r.hora_inicio) < toMin(hora_fin) && toMin(r.hora_fin) > toMin(hora_inicio)
    );
  }

  /** Todas las reservas activas (pendiente/aprobada) — usado por `bulkCompletarVencidas`. */
  async findActivas() {
    return this._readQuery().whereIn(`${TABLES.RESERVAS}.estado`, ['pendiente', 'aprobada']);
  }

  /**
   * Obtiene todas las reservas no canceladas/rechazadas de un salón en una
   * fecha dada, ordenadas por hora de inicio.
   */
  async findBySalonYFecha(nombre_salon, fecha) {
    return this._readQuery()
      .where(`${TABLES.SALONES}.nombre_salon`, nombre_salon)
      .andWhere(`${TABLES.RESERVAS}.fecha`, fecha)
      .whereNotIn(`${TABLES.RESERVAS}.estado`, ['cancelada', 'rechazada'])
      .orderBy(`${TABLES.RESERVAS}.hora_inicio`, 'asc');
  }

  async findReservaPendienteNFCByDocumento(documento, now = new Date()) {
    const fecha = new Date(now).toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA_APP, year: 'numeric', month: '2-digit', day: '2-digit' });
    const horaActual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const candidatas = await this._readQuery()
      .where('c_sol.numero_documento', String(documento))
      .andWhere(`${TABLES.RESERVAS}.fecha`, fecha)
      .whereIn(`${TABLES.RESERVAS}.estado`, ['pendiente', 'aprobada'])
      .andWhere(`${TABLES.RESERVAS}.entregar_llave`, false)
      .andWhere(`${TABLES.RESERVAS}.llave_entregada`, false)
      .andWhere(`${TABLES.RESERVAS}.checkin_estado`, 'pendiente_nfc')
      .andWhere(`${TABLES.RESERVAS}.hora_fin`, '>=', horaActual)
      .orderBy(`${TABLES.RESERVAS}.hora_inicio`, 'asc');

    if (!candidatas.length) return null;

    const ahoraMin = (now.getHours() * 60) + now.getMinutes();
    let mejor = candidatas[0];
    let mejorScore = Number.POSITIVE_INFINITY;
    for (const reserva of candidatas) {
      const inicio = toMin(reserva.hora_inicio);
      const fin = toMin(reserva.hora_fin);

      let score;
      if (ahoraMin < inicio) score = inicio - ahoraMin;
      else if (ahoraMin <= fin) score = 0;
      else score = Number.POSITIVE_INFINITY;

      if (score < mejorScore) {
        mejorScore = score;
        mejor = reserva;
      }
    }

    return mejor;
  }

  /**
   * Todas las reservas individuales de HOY para un docente en modo de
   * reclamo diferido (`entregar_llave: false`, aún sin reclamar) —
   * a diferencia de `findReservaPendienteNFCByDocumento` (que elige solo la
   * "mejor" para el momento actual), esta trae todas para poder fusionarlas
   * con clases/reservas semestrales antes de agrupar bloques consecutivos
   * (ver `llave.context.js#obtenerFranjasDelDiaDocente`).
   * @param {string} documento @param {string} fecha - YYYY-MM-DD
   * @returns {Promise<object[]>}
   */
  async findPendientesNFCByDocumentoYFecha(documento, fecha) {
    return this._readQuery()
      .where('c_sol.numero_documento', String(documento))
      .andWhere(`${TABLES.RESERVAS}.fecha`, fecha)
      .whereIn(`${TABLES.RESERVAS}.estado`, ['pendiente', 'aprobada'])
      .andWhere(`${TABLES.RESERVAS}.entregar_llave`, false)
      .andWhere(`${TABLES.RESERVAS}.llave_entregada`, false)
      .andWhere(`${TABLES.RESERVAS}.checkin_estado`, 'pendiente_nfc')
      .orderBy(`${TABLES.RESERVAS}.hora_inicio`, 'asc');
  }

  /**
   * Reservas activas (no canceladas/rechazadas) dentro de un rango de
   * fechas cuyo `fecha` cae en un día de la semana dado (0=domingo..6=sábado,
   * convención JS `Date#getDay()`). Usado por
   * `reservas_semestrales.service.js#salonesDisponiblesEnDia` para detectar
   * choques con reservas puntuales de salón dentro de la vigencia de un
   * semestre — reemplaza el `Reserva.find({$expr:{$eq:[{$dayOfWeek:'$fecha'},dowMongo]}})`
   * de Mongo (`$dayOfWeek` es 1=domingo..7=sábado; Postgres `EXTRACT(DOW ...)`
   * es 0=domingo..6=sábado, de ahí el `diaSemana` en convención JS/Postgres).
   * @param {string} fechaIni @param {string} fechaFin @param {number} diaSemana
   * @returns {Promise<object[]>}
   */
  async findEnRangoPorDiaSemana(fechaIni, fechaFin, diaSemana) {
    return this._readQuery()
      .whereNotIn(`${TABLES.RESERVAS}.estado`, ['cancelada', 'rechazada'])
      .andWhereBetween(`${TABLES.RESERVAS}.fecha`, [fechaIni, fechaFin])
      .andWhereRaw('EXTRACT(DOW FROM reservas.fecha) = ?', [diaSemana]);
  }

  /** @param {string[]} ids @returns {Promise<object[]>} Usado por notificacion.service.js#enviarNotificacionManualReservas */
  async findManyByIds(ids) {
    if (!ids?.length) return [];
    return this._readQuery().whereIn(`${TABLES.RESERVAS}.id`, ids);
  }

  async marcarCheckinNFC({ reservaId, llavePrestamoId, checkinEstado, now = new Date() }) {
    const [row] = await this.db(TABLES.RESERVAS)
      .where({ id: reservaId, llave_entregada: false, checkin_estado: 'pendiente_nfc' })
      .update({
        llave_entregada: true,
        registro_llave_id: llavePrestamoId,
        checkin_estado: checkinEstado,
        checkin_canal: 'nfc',
        checkin_at: now,
      })
      .returning('*');
    if (!row) return null;
    return this.findById(row.id);
  }

  // --- Conflictos con programación académica / semestral (S6) ------------
  // `programaciones.aula`/`dia` se conservan como snapshot de texto (S3) —
  // se sigue comparando por texto igual que el código Mongo original hacía
  // contra la colección `programacion`; `fecha_inicio_semestre`/
  // `fecha_fin_semestre` ya no viven en la fila (S3), se leen por JOIN a
  // `programacion_semestres`.

  /** @param {string} aula @param {string} diaNombre @param {string} fecha - YYYY-MM-DD @returns {Promise<object[]>} */
  async findClasesRegulares(aula, diaNombre, fecha) {
    const dia = normalizeLookupKey(diaNombre);
    return this.db(TABLES.PROGRAMACIONES)
      .join(TABLES.PROGRAMACION_SEMESTRES, `${TABLES.PROGRAMACION_SEMESTRES}.id`, `${TABLES.PROGRAMACIONES}.semestre_id`)
      .where(`${TABLES.PROGRAMACIONES}.tipo`, 'regular')
      .andWhere(`${TABLES.PROGRAMACIONES}.aula`, aula)
      .andWhere(`${TABLES.PROGRAMACIONES}.dia`, dia)
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_inicio`, '<=', fecha)
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_fin`, '>=', fecha)
      .whereNull(`${TABLES.PROGRAMACIONES}.deleted_at`)
      .select(`${TABLES.PROGRAMACIONES}.*`);
  }

  /** @param {string} aula @param {string} diaNombre @param {string} fecha - YYYY-MM-DD @returns {Promise<object[]>} */
  async findClasesSemestrales(aula, diaNombre, fecha) {
    const dia = normalizeLookupKey(diaNombre);
    return this.db(TABLES.PROGRAMACIONES)
      .join(TABLES.PROGRAMACIONES_SEMESTRALES, `${TABLES.PROGRAMACIONES_SEMESTRALES}.programacion_id`, `${TABLES.PROGRAMACIONES}.id`)
      .join(TABLES.PROGRAMACION_SEMESTRES, `${TABLES.PROGRAMACION_SEMESTRES}.id`, `${TABLES.PROGRAMACIONES}.semestre_id`)
      .where(`${TABLES.PROGRAMACIONES}.tipo`, 'semestral')
      .andWhere(`${TABLES.PROGRAMACIONES}.aula`, aula)
      .andWhere(`${TABLES.PROGRAMACIONES}.dia`, dia)
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_inicio`, '<=', fecha)
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_fin`, '>=', fecha)
      .andWhere(`${TABLES.PROGRAMACIONES_SEMESTRALES}.cancelada`, false)
      .whereNull(`${TABLES.PROGRAMACIONES}.deleted_at`)
      .whereNull(`${TABLES.PROGRAMACIONES_SEMESTRALES}.deleted_at`)
      .select(`${TABLES.PROGRAMACIONES}.*`);
  }

  /**
   * Devuelve el set de aulas con clase (regular o semestral) que se
   * solapan con el rango horario dado, para un día/fecha — reemplaza el
   * `Programacion.distinct('aula', {$expr: overlap})` de Mongo.
   */
  async findAulasOcupadasOverlap(diaNombre, fecha, horaInicio, horaFin) {
    const dia = normalizeLookupKey(diaNombre);
    const base = () => this.db(TABLES.PROGRAMACIONES)
      .join(TABLES.PROGRAMACION_SEMESTRES, `${TABLES.PROGRAMACION_SEMESTRES}.id`, `${TABLES.PROGRAMACIONES}.semestre_id`)
      .andWhere(`${TABLES.PROGRAMACIONES}.dia`, dia)
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_inicio`, '<=', fecha)
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_fin`, '>=', fecha)
      .andWhere(`${TABLES.PROGRAMACIONES}.hora_inicio`, '<', horaFin)
      .andWhere(`${TABLES.PROGRAMACIONES}.hora_fin`, '>', horaInicio)
      .whereNull(`${TABLES.PROGRAMACIONES}.deleted_at`)
      .whereNotNull(`${TABLES.PROGRAMACIONES}.aula`)
      .andWhereNot(`${TABLES.PROGRAMACIONES}.aula`, '');

    const [regulares, semestrales] = await Promise.all([
      base().andWhere(`${TABLES.PROGRAMACIONES}.tipo`, 'regular').distinct(`${TABLES.PROGRAMACIONES}.aula`).pluck('aula'),
      base()
        .join(TABLES.PROGRAMACIONES_SEMESTRALES, `${TABLES.PROGRAMACIONES_SEMESTRALES}.programacion_id`, `${TABLES.PROGRAMACIONES}.id`)
        .andWhere(`${TABLES.PROGRAMACIONES}.tipo`, 'semestral')
        .andWhere(`${TABLES.PROGRAMACIONES_SEMESTRALES}.cancelada`, false)
        .whereNull(`${TABLES.PROGRAMACIONES_SEMESTRALES}.deleted_at`)
        .distinct(`${TABLES.PROGRAMACIONES}.aula`)
        .pluck('aula'),
    ]);

    const ocupadasReserva = await this.db(TABLES.RESERVAS)
      .join(TABLES.SALONES, `${TABLES.SALONES}.id`, `${TABLES.RESERVAS}.salon_id`)
      .whereNotIn(`${TABLES.RESERVAS}.estado`, ['cancelada', 'rechazada'])
      .andWhere(`${TABLES.RESERVAS}.fecha`, fecha)
      .andWhere(`${TABLES.RESERVAS}.hora_inicio`, '<', horaFin)
      .andWhere(`${TABLES.RESERVAS}.hora_fin`, '>', horaInicio)
      .whereNull(`${TABLES.RESERVAS}.deleted_at`)
      .distinct(`${TABLES.SALONES}.nombre_salon`)
      .pluck(`${TABLES.SALONES}.nombre_salon`);

    return new Set([...regulares, ...semestrales, ...ocupadasReserva]);
  }
}

module.exports = new ReservaRepository();
