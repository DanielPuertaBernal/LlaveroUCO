'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');

/** Escapa los caracteres especiales de LIKE/ILIKE (%, _, \) en texto libre. */
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, '\\$&');
}

class EquipoRepository extends BaseRepository {
  constructor() { super(TABLES.EQUIPOS); }

  /** @returns {Promise<object[]>} */
  async findAll() {
    return this.table.whereNull('deleted_at');
  }

  /**
   * @param {string} id
   * @param {*} [session] - No aplica en Postgres; se conserva el parámetro
   *   por compatibilidad con llamadores aún no migrados (p. ej.
   *   prestamo.service.js dentro de una transacción Mongoose).
   * @returns {Promise<object|null>}
   */
  async findById(id, session = null) { // eslint-disable-line no-unused-vars
    const row = await this.table.where({ id }).whereNull('deleted_at').first();
    return row || null;
  }

  /**
   * @param {string[]} ids
   * @param {*} [session] - No aplica en Postgres; ver nota en findById.
   * @returns {Promise<object[]>}
   */
  async findByIds(ids = [], session = null) { // eslint-disable-line no-unused-vars
    if (!ids.length) return [];
    return this.table.whereIn('id', ids).whereNull('deleted_at');
  }

  /** @param {string} codigo @returns {Promise<object|null>} */
  async findByCodigo(codigo) {
    const row = await this.table
      .where({ codigo_inventario: codigo })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }

  /** @param {string} cb - Código de barras @returns {Promise<object|null>} */
  async findByCodigoBarras(cb) {
    const row = await this.table
      .where({ codigo_barras: cb })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }

  /** @returns {Promise<object[]>} Equipos con estado 'activo' */
  async findDisponibles() {
    return this.table.where({ estado: 'activo' }).whereNull('deleted_at');
  }

  /** @param {string} codigoBase @returns {Promise<number>} */
  async countByCodigo(codigoBase) {
    const [row] = await this.table
      .where('codigo_inventario', 'ilike', `${escapeLike(codigoBase)}-%`)
      .whereNull('deleted_at')
      .count({ count: '*' });
    return Number(row?.count || 0);
  }

  /**
   * Busca equipos activos cuyo nombre, marca, codigo_inventario o codigo_barras
   * contengan el texto indicado (insensible a mayúsculas).
   * @param {string} q - Texto a buscar
   * @param {number} [limit=10] - Máximo de resultados
   * @returns {Promise<object[]>}
   */
  async searchByText(q, limit = 10) {
    const like = `%${escapeLike(q)}%`;
    return this.table
      .where({ estado: 'activo' })
      .whereNull('deleted_at')
      .andWhere((builder) => {
        builder
          .where('nombre', 'ilike', like)
          .orWhere('marca', 'ilike', like)
          .orWhere('codigo_inventario', 'ilike', like)
          .orWhere('codigo_barras', 'ilike', like);
      })
      .limit(limit);
  }
}

module.exports = new EquipoRepository();
