'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { normalizeLookupKey } = require('../../shared/utils/normalize.helper');

/**
 * Repositorio de reservas semestrales.
 *
 * Antes de esta fase (S3), `reservas_semestrales` NO tenía colección propia:
 * era un filtro `tipo: 'semestral'` sobre la colección Mongoose compartida
 * `programacion`. Per el binding decision del diseño ("reservas_semestrales
 * becomes its own real table"), ahora es la tabla de subtipo
 * `programaciones_semestrales` (1:1 con `programaciones`, table-per-type).
 *
 * Toda fila representa una franja: fila base en `programaciones`
 * (tipo='semestral') + fila de subtipo en `programaciones_semestrales`,
 * escritas/eliminadas siempre juntas dentro de una transacción.
 */

const BASE_COLUMNS = [
  'semestre_id', 'docente_id', 'docente_nombre', 'dia', 'horario',
  'hora_inicio', 'hora_fin', 'salon_id', 'aula', 'facultad', 'materia',
];

const SUBTIPO_COLUMNS = [
  'consecutivo', 'cancelada', 'fecha_cancelacion', 'motivo_cancelacion',
  'grupo_id', 'creado_manualmente', 'tipo_solicitante', 'responsable_id',
  'responsable_nombre', 'bloque_id',
];

function normalizarDia(dia) {
  if (!dia) return null;
  return normalizeLookupKey(dia);
}

class ReservasSemestralesRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  _pickBase(data) {
    const out = {};
    for (const col of BASE_COLUMNS) if (data[col] !== undefined) out[col] = data[col];
    if (out.dia !== undefined) out.dia = normalizarDia(out.dia);
    return out;
  }

  _pickSubtipo(data) {
    const out = {};
    for (const col of SUBTIPO_COLUMNS) if (data[col] !== undefined) out[col] = data[col];
    return out;
  }

  /**
   * Query base: v_programaciones (tipo='semestral') LEFT JOIN
   * programacion_semestres + comunidad (por docente_id), exponiendo
   * `semestre` (código) y `numero_documento` que antes vivían directo en el
   * documento Mongo — mismo patrón que `programacion.repository.js`.
   */
  _baseQuery() {
    return this.db(TABLES.V_PROGRAMACIONES)
      .leftJoin(TABLES.PROGRAMACION_SEMESTRES, `${TABLES.PROGRAMACION_SEMESTRES}.id`, `${TABLES.V_PROGRAMACIONES}.semestre_id`)
      .leftJoin(`${TABLES.COMUNIDAD} as c_docente`, 'c_docente.id', `${TABLES.V_PROGRAMACIONES}.docente_id`)
      .whereNull(`${TABLES.V_PROGRAMACIONES}.deleted_at`)
      .where({ [`${TABLES.V_PROGRAMACIONES}.tipo`]: 'semestral' })
      .select(
        `${TABLES.V_PROGRAMACIONES}.*`,
        `${TABLES.PROGRAMACION_SEMESTRES}.codigo as semestre`,
        'c_docente.numero_documento as numero_documento'
      );
  }

  /** @param {string} semestre - Código normalizado (ej: "2026-1") @returns {Promise<object[]>} */
  async findBySemestre(semestre) {
    return this._baseQuery().andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.codigo`, semestre);
  }

  /**
   * Obtiene reservas semestrales activas para un día específico, del
   * semestre cuya ventana de fechas incluye `fechaHoy` (join con
   * programacion_semestres — las fechas ya no viven en la fila base).
   * @param {string} dia - Nombre del día en español (ej: "Lunes")
   * @param {Date} fechaHoy - Fecha actual para validar vigencia del semestre
   * @returns {Promise<object[]>}
   */
  async findByDia(dia, fechaHoy) {
    return this._baseQuery()
      .where({ [`${TABLES.V_PROGRAMACIONES}.dia`]: normalizarDia(dia), cancelada: false })
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_inicio`, '<=', fechaHoy)
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.fecha_fin`, '>=', fechaHoy);
  }

  /**
   * Obtiene reservas semestrales de un salón (comparación exacta de texto
   * `aula`, igual que el comportamiento original) en un día del semestre dado.
   * @param {string} aula @param {string} dia @param {string} semestre - Código normalizado
   * @returns {Promise<object[]>}
   */
  async findByAulaDia(aula, dia, semestre) {
    return this._baseQuery()
      .where({ [`${TABLES.V_PROGRAMACIONES}.aula`]: aula, [`${TABLES.V_PROGRAMACIONES}.dia`]: normalizarDia(dia), cancelada: false })
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.codigo`, semestre);
  }

  /**
   * Reservas semestrales activas de un día+semestre, excluyendo un
   * grupo_id/id (para validación de conflictos).
   * @param {string} dia @param {string} semestre @param {{excluirGrupoId?: string, excluirId?: string}} [opts]
   * @returns {Promise<object[]>}
   */
  async findByDiaSemestre(dia, semestre, { excluirGrupoId = null, excluirId = null } = {}) {
    const q = this._baseQuery()
      .where({ [`${TABLES.V_PROGRAMACIONES}.dia`]: normalizarDia(dia), cancelada: false })
      .andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.codigo`, semestre);
    if (excluirGrupoId) q.andWhereNot({ grupo_id: excluirGrupoId });
    if (excluirId) q.andWhereNot(`${TABLES.V_PROGRAMACIONES}.id`, excluirId);
    return q;
  }

  /**
   * Obtiene todas las reservas semestrales (de todos los semestres), para listado global.
   * @returns {Promise<object[]>}
   */
  async findAll() {
    return this._baseQuery()
      .orderBy([
        { column: `${TABLES.PROGRAMACION_SEMESTRES}.codigo`, order: 'desc' },
        { column: 'grupo_id', order: 'asc' },
        { column: 'dia', order: 'asc' },
      ]);
  }

  /**
   * Elimina (soft-delete) todas las franjas de un grupo manual —
   * subtipo + base, en una transacción.
   * @param {string} grupo_id
   * @returns {Promise<{deletedCount: number}>}
   */
  async deleteByGrupoId(grupo_id) {
    return this.db.transaction(async (trx) => {
      const baseIds = await trx(TABLES.PROGRAMACIONES_SEMESTRALES).where({ grupo_id }).whereNull('deleted_at').pluck('programacion_id');
      if (!baseIds.length) return { deletedCount: 0 };
      const now = trx.fn.now();
      await trx(TABLES.PROGRAMACIONES_SEMESTRALES).whereIn('programacion_id', baseIds).update({ deleted_at: now });
      const deletedCount = await trx(TABLES.PROGRAMACIONES).whereIn('id', baseIds).update({ deleted_at: now });
      return { deletedCount };
    });
  }

  /**
   * Encuentra al menos una franja de un grupo (para validar que existe y es manual).
   * @param {string} grupo_id
   * @returns {Promise<object|null>}
   */
  async findOneByGrupoId(grupo_id) {
    const row = await this._baseQuery().where({ grupo_id }).first();
    return row || null;
  }

  /**
   * Encuentra una reserva semestral por su id.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const row = await this._baseQuery().where(`${TABLES.V_PROGRAMACIONES}.id`, id).first();
    return row || null;
  }

  /**
   * Elimina (soft-delete) una reserva semestral por su id — subtipo + base.
   * @param {string} id
   * @returns {Promise<{deletedCount: number}>}
   */
  async deleteById(id) {
    return this.db.transaction(async (trx) => {
      const subtipo = await trx(TABLES.PROGRAMACIONES_SEMESTRALES).where({ programacion_id: id }).whereNull('deleted_at').first();
      if (!subtipo) return { deletedCount: 0 };
      const now = trx.fn.now();
      await trx(TABLES.PROGRAMACIONES_SEMESTRALES).where({ programacion_id: id }).update({ deleted_at: now });
      const deletedCount = await trx(TABLES.PROGRAMACIONES).where({ id }).update({ deleted_at: now });
      return { deletedCount };
    });
  }

  /** @param {string} semestre @returns {Promise<{deletedCount: number}>} */
  async deleteBySemestre(semestre) {
    return this.db.transaction(async (trx) => {
      const semestreRow = await trx(TABLES.PROGRAMACION_SEMESTRES).where({ codigo: semestre }).first();
      if (!semestreRow) return { deletedCount: 0 };
      const baseIds = await trx(TABLES.PROGRAMACIONES)
        .where({ semestre_id: semestreRow.id, tipo: 'semestral' })
        .whereNull('deleted_at')
        .pluck('id');
      if (!baseIds.length) return { deletedCount: 0 };
      const now = trx.fn.now();
      await trx(TABLES.PROGRAMACIONES_SEMESTRALES).whereIn('programacion_id', baseIds).update({ deleted_at: now });
      const deletedCount = await trx(TABLES.PROGRAMACIONES).whereIn('id', baseIds).update({ deleted_at: now });
      return { deletedCount };
    });
  }

  /**
   * Reemplaza (soft-delete + insert transaccional) todas las reservas
   * semestrales de un semestre. Cada registro escribe una fila base
   * (`programaciones`, tipo='semestral') y una fila de subtipo
   * (`programaciones_semestrales`), en la misma transacción.
   * @param {string} semestre - Código normalizado
   * @param {object[]} registros - Ya deben traer `docente_id`/`responsable_id`/`bloque_id`/`salon_id` resueltos (o null) desde el servicio
   * @param {string|null} semestreId - id de `programacion_semestres` (ya debe existir)
   * @returns {Promise<{insertados: number}>}
   */
  async bulkInsert(semestre, registros, semestreId = null) {
    return this.db.transaction(async (trx) => {
      const semestreRow = semestreId
        ? { id: semestreId }
        : await trx(TABLES.PROGRAMACION_SEMESTRES).where({ codigo: semestre }).first();

      if (semestreRow) {
        const idsExistentes = await trx(TABLES.PROGRAMACIONES)
          .where({ semestre_id: semestreRow.id, tipo: 'semestral' })
          .whereNull('deleted_at')
          .pluck('id');
        if (idsExistentes.length) {
          const now = trx.fn.now();
          await trx(TABLES.PROGRAMACIONES_SEMESTRALES).whereIn('programacion_id', idsExistentes).update({ deleted_at: now });
          await trx(TABLES.PROGRAMACIONES).whereIn('id', idsExistentes).update({ deleted_at: now });
        }
      }

      const insertados = await this._insertMany(trx, registros, semestreRow ? semestreRow.id : null);
      return { insertados };
    });
  }

  /**
   * Inserta N franjas nuevas (base + subtipo) dentro de una transacción ya
   * abierta por el caller. Usado por `bulkInsert` y por
   * `insertGrupoManual`/`reemplazarGrupo` (creación/edición manual de reservas).
   * @param {import('knex').Knex.Transaction} trx
   * @param {object[]} registros
   * @param {string|null} semestreId
   * @returns {Promise<number>}
   */
  async _insertMany(trx, registros, semestreId) {
    if (!registros.length) return 0;
    const basePayloads = registros.map((r) => ({
      id: newId(),
      tipo: 'semestral',
      ...this._pickBase({ ...r, semestre_id: semestreId }),
    }));
    await trx(TABLES.PROGRAMACIONES).insert(basePayloads);
    const subtipoPayloads = basePayloads.map((b, i) => ({
      programacion_id: b.id,
      ...this._pickSubtipo(registros[i]),
    }));
    await trx(TABLES.PROGRAMACIONES_SEMESTRALES).insert(subtipoPayloads);
    return basePayloads.length;
  }

  /**
   * Crea un nuevo grupo de franjas manuales (base + subtipo, transaccional).
   * @param {object[]} registros @param {string|null} semestreId
   * @returns {Promise<number>}
   */
  async insertGrupoManual(registros, semestreId) {
    return this.db.transaction((trx) => this._insertMany(trx, registros, semestreId));
  }
}

module.exports = new ReservasSemestralesRepository();
