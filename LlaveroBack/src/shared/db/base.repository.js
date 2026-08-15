'use strict';

const pgClient = require('./pg.client');
const { newId } = require('./id');

/**
 * Repositorio base con operaciones CRUD estándar sobre Postgres (Knex).
 *
 * El modo legado Mongoose fue retirado por completo en S7 (cutover final de
 * la migración Mongo → Postgres); todas las features usan Postgres desde S6.
 */
class BaseRepository {
  /** @param {string} tableName */
  constructor(tableName) {
    this.tableName = tableName;
  }

  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  /** @returns {import('knex').Knex.QueryBuilder} */
  get table() {
    return this.db(this.tableName);
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) {
    const row = await this.table.where({ id }).whereNull('deleted_at').first();
    return row || null;
  }

  /** @param {object} data @returns {Promise<object>} */
  async create(data) {
    const payload = { id: data.id || newId(), ...data };
    const [row] = await this.table.insert(payload).returning('*');
    return row;
  }

  /**
   * Actualiza una fila por id. `updated_at` lo mantiene un trigger de base
   * de datos, no se estampa aquí.
   * @param {string} id @param {object} updates @returns {Promise<object|null>}
   */
  async update(id, updates) {
    const [row] = await this.table
      .where({ id })
      .whereNull('deleted_at')
      .update(updates)
      .returning('*');
    return row || null;
  }

  /**
   * Soft delete: marca `deleted_at`, nunca borra la fila físicamente.
   * @param {string} id @returns {Promise<object|null>}
   */
  async deleteById(id) {
    const [row] = await this.table
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: this.db.fn.now() })
      .returning('*');
    return row || null;
  }
}

module.exports = BaseRepository;
