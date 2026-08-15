'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');

const DEFAULTS_KEY = '__defaults__';

/**
 * Repositorio de configuracion_bloques.
 *
 * La colección Mongoose original guardaba un documento sentinela con
 * `nombre_bloque = '__defaults__'` para representar la configuración
 * global (sin bloque asociado). El esquema relacional (`configuracion_bloques`,
 * ver 002_catalogos.js) modela eso como `bloque_id NULL`, con un índice único
 * parcial que trata NULL como su propio slot vía COALESCE. Este repositorio
 * traduce `nombre_bloque` (string, incluido `'__defaults__'`) hacia/desde
 * `bloque_id` para que `configuracion.service.js` no requiera cambios.
 */
class ConfiguracionRepository extends BaseRepository {
  constructor() { super(TABLES.CONFIGURACION_BLOQUES); }

  async findAll() {
    const rows = await this.db(this.tableName)
      .join(TABLES.BLOQUES, `${TABLES.BLOQUES}.id`, `${this.tableName}.bloque_id`)
      .whereNull(`${this.tableName}.deleted_at`)
      .whereNull(`${TABLES.BLOQUES}.deleted_at`)
      .orderBy(`${TABLES.BLOQUES}.nombre_bloque`, 'asc')
      .select(`${this.tableName}.*`, `${TABLES.BLOQUES}.nombre_bloque as nombre_bloque`);
    return rows;
  }

  /** @param {string} nombreBloque @returns {Promise<object|null>} */
  async findByBloque(nombreBloque) {
    if (nombreBloque === DEFAULTS_KEY) {
      const row = await this.table.whereNull('bloque_id').whereNull('deleted_at').first();
      return row ? { ...row, nombre_bloque: DEFAULTS_KEY } : null;
    }
    const row = await this.db(this.tableName)
      .join(TABLES.BLOQUES, `${TABLES.BLOQUES}.id`, `${this.tableName}.bloque_id`)
      .where(`${TABLES.BLOQUES}.nombre_bloque`, nombreBloque)
      .whereNull(`${this.tableName}.deleted_at`)
      .select(`${this.tableName}.*`, `${TABLES.BLOQUES}.nombre_bloque as nombre_bloque`)
      .first();
    return row || null;
  }

  /**
   * @param {string} nombreBloque
   * @param {object} data - Puede incluir `nombre_bloque` (ignorado, se usa el
   *   argumento posicional) y campos parciales de configuración.
   * @returns {Promise<object>}
   */
  async upsert(nombreBloque, data) {
    const { nombre_bloque, ...campos } = data; // eslint-disable-line no-unused-vars
    const bloqueId = await this._resolveBloqueId(nombreBloque);

    const cols = Object.keys(campos).filter((c) => campos[c] !== undefined);
    const insertCols = ['id', 'bloque_id', ...cols];
    const insertVals = [newId(), bloqueId, ...cols.map((c) => campos[c])];
    const placeholders = insertVals.map(() => '?').join(', ');
    const updateSet = cols.length
      ? cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')
      : 'bloque_id = EXCLUDED.bloque_id';

    const sql = `
      INSERT INTO ${this.tableName} (${insertCols.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT ((COALESCE(bloque_id::text, '${DEFAULTS_KEY}'))) WHERE deleted_at IS NULL
      DO UPDATE SET ${updateSet}
      RETURNING *
    `;
    const { rows } = await this.db.raw(sql, insertVals);
    return { ...rows[0], nombre_bloque: nombreBloque };
  }

  /** @param {string} nombreBloque @returns {Promise<object|null>} */
  async remove(nombreBloque) {
    const current = await this.findByBloque(nombreBloque);
    if (!current) return null;
    const [row] = await this.table
      .where({ id: current.id })
      .whereNull('deleted_at')
      .update({ deleted_at: this.db.fn.now() })
      .returning('*');
    return row ? { ...row, nombre_bloque: nombreBloque } : null;
  }

  /** @param {string} nombreBloque @returns {Promise<string|null>} */
  async _resolveBloqueId(nombreBloque) {
    if (nombreBloque === DEFAULTS_KEY) return null;
    const bloque = await this.db(TABLES.BLOQUES)
      .where({ nombre_bloque: nombreBloque })
      .whereNull('deleted_at')
      .first();
    if (!bloque) {
      throw new Error(`Bloque '${nombreBloque}' no encontrado al guardar configuración`);
    }
    return bloque.id;
  }
}

module.exports = new ConfiguracionRepository();
