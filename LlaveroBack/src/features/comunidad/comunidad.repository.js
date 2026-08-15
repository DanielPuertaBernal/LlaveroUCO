'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');

/**
 * Tipos válidos de persona en comunidad.tipo (antes CHECK vía Mongoose enum,
 * ahora vía CHECK constraint en 002_catalogos.js). Se mantiene aquí porque
 * `comunidad.schema.js` (Mongoose) fue eliminado en la migración a Postgres.
 */
const TIPOS_COMUNIDAD = ['docente', 'estudiante', 'empleado'];

/** Escapa los caracteres especiales de LIKE/ILIKE (%, _, \) en texto libre. */
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, '\\$&');
}

class ComunidadRepository extends BaseRepository {
  constructor() { super(TABLES.COMUNIDAD); }

  /** @param {object} filtro @returns {Promise<object[]>} */
  async findAll(filtro = {}) {
    const query = this.table.whereNull('deleted_at');
    if (filtro.tipo) query.andWhere({ tipo: filtro.tipo });
    return query;
  }

  /** @param {string} documento @returns {Promise<object|null>} */
  async findByDocumento(documento) {
    const row = await this.table
      .where({ numero_documento: String(documento) })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }

  /** @param {string[]} documentos @returns {Promise<object[]>} */
  async findManyByDocumentos(documentos) {
    if (!documentos?.length) return [];
    return this.table.whereIn('numero_documento', documentos).whereNull('deleted_at');
  }

  /** @param {string} idCarnet @returns {Promise<object|null>} */
  async findByCarnet(idCarnet) {
    const row = await this.table
      .where({ id_carnet: String(idCarnet) })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }

  /**
   * Búsqueda difusa e insensible a tildes por nombre o número de documento,
   * usando el índice GIN trigram (immutable_unaccent(nombre)) creado en
   * 002_catalogos.js.
   * @param {string} query - Término de búsqueda @param {object} filtro @returns {Promise<object[]>}
   */
  async search(query, filtro = {}) {
    const like = `%${escapeLike(query)}%`;
    const q = this.table
      .whereNull('deleted_at')
      .andWhere((builder) => {
        builder
          .where('numero_documento', 'ilike', like)
          .orWhereRaw('immutable_unaccent(nombre) ILIKE immutable_unaccent(?)', [like]);
      });
    if (filtro.tipo) q.andWhere({ tipo: filtro.tipo });
    return q;
  }

  /** @param {object} data @returns {Promise<object>} Persona insertada o actualizada */
  async upsertOne(data) {
    const sql = `
      INSERT INTO ${TABLES.COMUNIDAD}
        (id, numero_documento, nombre, tipo, facultad, correo, id_carnet, numero_contacto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (numero_documento) WHERE deleted_at IS NULL
      DO UPDATE SET
        nombre = EXCLUDED.nombre,
        tipo = COALESCE(EXCLUDED.tipo, ${TABLES.COMUNIDAD}.tipo),
        facultad = EXCLUDED.facultad,
        correo = EXCLUDED.correo,
        id_carnet = EXCLUDED.id_carnet,
        numero_contacto = EXCLUDED.numero_contacto
      RETURNING *
    `;
    const { rows } = await this.db.raw(sql, [
      newId(),
      data.numero_documento,
      data.nombre,
      data.tipo || null,
      data.facultad || '',
      data.correo || '',
      data.id_carnet || '',
      data.numero_contacto || '',
    ]);
    return rows[0];
  }

  /** @param {string} id @param {object} data @returns {Promise<object|null>} */
  async updateById(id, data) {
    return this.update(id, data);
  }

  /** @param {object} datos @returns {Promise<object>} Persona creada */
  async crear(datos) {
    return this.create(datos);
  }

  /** @param {object[]} registros @returns {Promise<{insertados: number, actualizados: number}>} */
  async upsertMany(registros) {
    if (!registros.length) return { insertados: 0, actualizados: 0 };

    const cols = ['id', 'numero_documento', 'nombre', 'tipo', 'facultad', 'correo', 'id_carnet'];
    const bindings = [];
    const placeholders = registros
      .map((r) => {
        bindings.push(
          newId(),
          r.numero_documento,
          r.nombre,
          r.tipo,
          r.facultad || '',
          r.correo || '',
          r.id_carnet || ''
        );
        return `(${cols.map(() => '?').join(', ')})`;
      })
      .join(', ');

    const sql = `
      INSERT INTO ${TABLES.COMUNIDAD} (${cols.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (numero_documento) WHERE deleted_at IS NULL
      DO UPDATE SET
        nombre = EXCLUDED.nombre,
        tipo = EXCLUDED.tipo,
        facultad = EXCLUDED.facultad,
        correo = EXCLUDED.correo,
        id_carnet = EXCLUDED.id_carnet
      RETURNING (xmax = 0) AS inserted
    `;
    const { rows } = await this.db.raw(sql, bindings);
    const insertados = rows.filter((r) => r.inserted).length;
    return { insertados, actualizados: rows.length - insertados };
  }
}

module.exports = new ComunidadRepository();
module.exports.TIPOS_COMUNIDAD = TIPOS_COMUNIDAD;
