'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');

/**
 * Repositorio de salones.
 *
 * El diseño relacional (002_catalogos.js) promueve `nombre_bloque` (string
 * libre) y `tipo_silleteria` (string libre) a `bloque_id`/`tipo_silleteria_id`
 * (FKs). `salon.service.js` sigue enviando/recibiendo esos campos como
 * strings, así que este repositorio resuelve las FKs internamente:
 *  - `bloque_id`: el bloque debe existir (el servicio ya lo valida antes de
 *    llamar a create/update); si no existe se lanza un error.
 *  - `tipo_silleteria_id`: se resuelve por nombre y, si no existe, se crea en
 *    `tipos_silleteria` (find-or-create), preservando el comportamiento
 *    original donde `tipo_silleteria` era un string libre sin catálogo
 *    obligatorio.
 */
class SalonRepository extends BaseRepository {
  constructor() { super(TABLES.SALONES); }

  _baseQuery() {
    return this.db(this.tableName)
      .join(TABLES.BLOQUES, `${TABLES.BLOQUES}.id`, `${this.tableName}.bloque_id`)
      .leftJoin(TABLES.TIPOS_SILLETERIA, `${TABLES.TIPOS_SILLETERIA}.id`, `${this.tableName}.tipo_silleteria_id`)
      .whereNull(`${this.tableName}.deleted_at`)
      .select(
        `${this.tableName}.*`,
        `${TABLES.BLOQUES}.nombre_bloque as nombre_bloque`,
        `${TABLES.TIPOS_SILLETERIA}.nombre as tipo_silleteria`
      );
  }

  /** @returns {Promise<object[]>} Salones ordenados por nombre */
  async findAll() {
    return this._baseQuery().orderBy(`${this.tableName}.nombre_salon`, 'asc');
  }

  /** @param {string} nombreSalon @returns {Promise<object|null>} */
  async findByNombre(nombreSalon) {
    const row = await this._baseQuery()
      .where(`${this.tableName}.nombre_salon`, nombreSalon)
      .first();
    return row || null;
  }

  /** @param {object} payload @returns {Promise<object>} */
  async create(payload) {
    const { nombre_bloque, tipo_silleteria, ...rest } = payload;
    const bloque_id = await this._resolveBloqueId(nombre_bloque);
    const tipo_silleteria_id = await this._resolveTipoSilleteriaId(tipo_silleteria);

    const [row] = await this.table
      .insert({ id: newId(), bloque_id, tipo_silleteria_id, ...rest })
      .returning('*');
    return { ...row, nombre_bloque, tipo_silleteria };
  }

  /** @param {string} id @param {object} updates @returns {Promise<object|null>} */
  async update(id, updates) {
    const { nombre_bloque, tipo_silleteria, ...rest } = updates;
    const payload = { ...rest };
    if (nombre_bloque !== undefined) {
      payload.bloque_id = await this._resolveBloqueId(nombre_bloque);
    }
    if (tipo_silleteria !== undefined) {
      payload.tipo_silleteria_id = await this._resolveTipoSilleteriaId(tipo_silleteria);
    }

    const [row] = await this.table
      .where({ id })
      .whereNull('deleted_at')
      .update(payload)
      .returning('*');
    if (!row) return null;

    const joined = await this._baseQuery().where(`${this.tableName}.id`, id).first();
    return joined || row;
  }

  /** @param {string} nombreBloque @returns {Promise<string>} */
  async _resolveBloqueId(nombreBloque) {
    const bloque = await this.db(TABLES.BLOQUES)
      .where({ nombre_bloque: nombreBloque })
      .whereNull('deleted_at')
      .first();
    if (!bloque) {
      throw new Error(`Bloque '${nombreBloque}' no encontrado al guardar salón`);
    }
    return bloque.id;
  }

  /** @param {string} [nombreTipo] @returns {Promise<string|null>} */
  async _resolveTipoSilleteriaId(nombreTipo) {
    if (!nombreTipo) return null;
    const existing = await this.db(TABLES.TIPOS_SILLETERIA)
      .where({ nombre: nombreTipo })
      .whereNull('deleted_at')
      .first();
    if (existing) return existing.id;

    const [created] = await this.db(TABLES.TIPOS_SILLETERIA)
      .insert({ id: newId(), nombre: nombreTipo })
      .returning('*');
    return created.id;
  }
}

module.exports = new SalonRepository();
