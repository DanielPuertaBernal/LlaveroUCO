'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');

/**
 * Repositorio de metadatos de semestre académico (programacion_semestres).
 * Reemplaza el modelo Mongoose `Semestre` (programacion.semestre.schema.js,
 * eliminado en esta fase — S3).
 */
class SemestreRepository extends BaseRepository {
  constructor() { super(TABLES.PROGRAMACION_SEMESTRES); }

  /** Retorna todos los semestres, más reciente primero. */
  async findAll() {
    return this.table.whereNull('deleted_at').orderBy([{ column: 'anio', order: 'desc' }, { column: 'periodo', order: 'desc' }]);
  }

  /** Retorna un semestre por su código normalizado (ej: "2026-1"). */
  async findByCodigo(codigo) {
    const row = await this.table.where({ codigo }).whereNull('deleted_at').first();
    return row || null;
  }

  /**
   * Determina el semestre vigente:
   * - Primero busca uno cuya ventana de fechas incluya hoy.
   * - Si no hay ninguno activo, retorna el más recientemente cargado.
   */
  async findVigente() {
    const hoy = new Date();
    const vigente = await this.table
      .whereNull('deleted_at')
      .where('fecha_inicio', '<=', hoy)
      .where('fecha_fin', '>=', hoy)
      .first();
    if (vigente) return vigente;
    return this.table.whereNull('deleted_at').orderBy('fecha_carga', 'desc').first();
  }

  /**
   * Crea o actualiza el registro de un semestre (upsert por código).
   * @param {object} data
   */
  async upsert(data) {
    const existente = await this.findByCodigo(data.codigo);
    if (existente) {
      return this.update(existente.id, data);
    }
    return this.create(data);
  }

  /** Actualiza solo las fechas de un semestre. */
  async updateFechas(codigo, fecha_inicio, fecha_fin) {
    const existente = await this.findByCodigo(codigo);
    if (!existente) return null;
    return this.update(existente.id, { fecha_inicio, fecha_fin });
  }

  /** Elimina (soft-delete) el registro de metadatos de un semestre. */
  async deleteByCodigo(codigo) {
    const existente = await this.findByCodigo(codigo);
    if (!existente) return { eliminado: false };
    await this.deleteById(existente.id);
    return { eliminado: true };
  }
}

module.exports = new SemestreRepository();
