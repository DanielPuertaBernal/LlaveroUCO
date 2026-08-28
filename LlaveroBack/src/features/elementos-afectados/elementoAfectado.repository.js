'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');

class ElementoAfectadoRepository extends BaseRepository {
  constructor() { super(TABLES.ELEMENTOS_AFECTADOS); }

  /**
   * Ordena por `orden` y no por nombre: el catálogo se muestra en un Select
   * del formulario de novedades y conviene que los elementos más reportados
   * queden arriba, sin depender del alfabeto.
   * @param {{soloActivos?: boolean}} options
   * @returns {Promise<object[]>}
   */
  async findAll({ soloActivos = true } = {}) {
    const query = this.table.whereNull('deleted_at');
    if (soloActivos) query.andWhere({ activo: true });
    return query.orderBy([{ column: 'orden', order: 'asc' }, { column: 'nombre', order: 'asc' }]);
  }

  /** @param {string} clave @returns {Promise<object|null>} */
  async findByClave(clave) {
    const row = await this.table.where({ clave }).whereNull('deleted_at').first();
    return row || null;
  }

  /** @param {object[]} items @returns {Promise<void>} */
  async upsertDefaults(items = []) {
    if (!items.length) return;
    await Promise.all(items.map(async (item) => {
      const existing = await this.findByClave(item.clave);
      if (existing) return;
      await this.table.insert({ id: newId(), ...item });
    }));
  }
}

module.exports = new ElementoAfectadoRepository();
