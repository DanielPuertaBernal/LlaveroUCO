'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');

class TipoSilleteriaRepository extends BaseRepository {
  constructor() { super(TABLES.TIPOS_SILLETERIA); }

  async findAll() {
    return this.table.whereNull('deleted_at').orderBy('nombre', 'asc');
  }

  async findByNombre(nombre) {
    const row = await this.table.where({ nombre }).whereNull('deleted_at').first();
    return row || null;
  }
}

module.exports = new TipoSilleteriaRepository();
