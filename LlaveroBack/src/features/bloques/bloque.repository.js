'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');

class BloqueRepository extends BaseRepository {
  constructor() { super(TABLES.BLOQUES); }

  /** @returns {Promise<object[]>} Bloques ordenados por nombre */
  async findAll() {
    return this.table.whereNull('deleted_at').orderBy('nombre_bloque', 'asc');
  }

  /** @param {string} nombreBloque @returns {Promise<object|null>} */
  async findByNombre(nombreBloque) {
    const row = await this.table
      .where({ nombre_bloque: nombreBloque })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }
}

module.exports = new BloqueRepository();
