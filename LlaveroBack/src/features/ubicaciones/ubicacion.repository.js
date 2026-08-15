'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');

class UbicacionRepository extends BaseRepository {
  constructor() { super(TABLES.UBICACIONES_OPERATIVAS); }

  /** @param {{soloActivas?: boolean}} options @returns {Promise<object[]>} */
  async findAll({ soloActivas = true } = {}) {
    const query = this.table.whereNull('deleted_at');
    if (soloActivas) query.andWhere({ activa: true });
    return query.orderBy('nombre', 'asc');
  }

  /** @param {string} clave @returns {Promise<object|null>} */
  async findByClave(clave) {
    const row = await this.table.where({ clave }).whereNull('deleted_at').first();
    return row || null;
  }

  /** @param {object[]} items - Ubicaciones por defecto a insertar @returns {Promise<void>} */
  async upsertDefaults(items = []) {
    if (!items.length) return;
    await Promise.all(items.map(async (item) => {
      const existing = await this.findByClave(item.clave);
      if (existing) return;
      await this.table.insert({ id: newId(), ...item });
    }));
  }
}

module.exports = new UbicacionRepository();
