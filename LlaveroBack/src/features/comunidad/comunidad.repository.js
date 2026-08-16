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

/**
 * `tipo` calculado en lectura: 'docente' > 'empleado' > 'estudiante',
 * con fallback a la columna cruda `tipo` para filas viejas que no tienen
 * `es_estudiante`/`es_empleado` seteados (ej. las creadas por el fallback de
 * importación de programación antes de que el ETL real esté conectado).
 *
 * "Docente" es un estado derivado, no una fuente de dato: una persona es
 * docente si su documento aparece dictando alguna clase en `programaciones`
 * (FK `docente_id -> comunidad.id`). Se considera CUALQUIER programación
 * activa (no soft-eliminada) de cualquier semestre, no solo el semestre
 * vigente — una persona que dictó clase en un semestre cargado sigue siendo
 * docente aunque ese semestre ya no sea el actual, y acotar al semestre
 * vigente exigiría resolverlo aparte (`programacion_semestres`) sin ganancia
 * real para este cálculo.
 */
const TIPO_CALCULADO_SQL = `
  CASE
    WHEN EXISTS (
      SELECT 1 FROM ${TABLES.PROGRAMACIONES} pr
      WHERE pr.docente_id = ${TABLES.COMUNIDAD}.id AND pr.deleted_at IS NULL
    ) THEN 'docente'
    WHEN ${TABLES.COMUNIDAD}.es_empleado THEN 'empleado'
    WHEN ${TABLES.COMUNIDAD}.es_estudiante THEN 'estudiante'
    ELSE ${TABLES.COMUNIDAD}.tipo
  END
`;

/** Mismo EXISTS que `TIPO_CALCULADO_SQL`, para usar en filtros WHERE tipo = 'docente'. */
const ES_DOCENTE_SQL = `
  EXISTS (
    SELECT 1 FROM ${TABLES.PROGRAMACIONES} pr
    WHERE pr.docente_id = ${TABLES.COMUNIDAD}.id AND pr.deleted_at IS NULL
  )
`;

class ComunidadRepository extends BaseRepository {
  constructor() { super(TABLES.COMUNIDAD); }

  /** Query base de lectura con `tipo` recalculado (ver TIPO_CALCULADO_SQL). */
  _readQuery() {
    return this.table.select('*', this.db.raw(`${TIPO_CALCULADO_SQL} as tipo`));
  }

  /** Aplica `filtro.tipo` a un query builder, usando el EXISTS derivado para 'docente'. */
  _aplicarFiltroTipo(query, tipo) {
    if (!tipo) return query;
    if (tipo === 'docente') return query.andWhereRaw(ES_DOCENTE_SQL);
    if (tipo === 'empleado') return query.andWhere({ es_empleado: true }).andWhereRaw(`NOT (${ES_DOCENTE_SQL})`);
    if (tipo === 'estudiante') return query.andWhere({ es_estudiante: true }).andWhereRaw(`NOT (${ES_DOCENTE_SQL})`);
    return query.andWhere({ tipo });
  }

  /** @param {object} filtro @returns {Promise<object[]>} */
  async findAll(filtro = {}) {
    const query = this._readQuery().whereNull('deleted_at');
    return this._aplicarFiltroTipo(query, filtro.tipo);
  }

  /** @param {string} documento @returns {Promise<object|null>} */
  async findByDocumento(documento) {
    const row = await this._readQuery()
      .where({ numero_documento: String(documento) })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }

  /** @param {string[]} documentos @returns {Promise<object[]>} */
  async findManyByDocumentos(documentos) {
    if (!documentos?.length) return [];
    return this._readQuery().whereIn('numero_documento', documentos).whereNull('deleted_at');
  }

  /** @param {string} idCarnet @returns {Promise<object|null>} */
  async findByCarnet(idCarnet) {
    const row = await this._readQuery()
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
    const q = this._readQuery()
      .whereNull('deleted_at')
      .andWhere((builder) => {
        builder
          .where('numero_documento', 'ilike', like)
          .orWhereRaw('immutable_unaccent(nombre) ILIKE immutable_unaccent(?)', [like]);
      });
    return this._aplicarFiltroTipo(q, filtro.tipo);
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

  /**
   * Upsert masivo compartido para los sync del ETL institucional (2 fuentes
   * independientes: estudiantes y empleados/RRHH). Misma forma que
   * `upsertMany` (INSERT multi-row con bindings, sin loop fila por fila,
   * apto para cargas de cientos/miles de registros del ETL), pero con
   * precedencia por `numero_documento` según la fuente:
   *
   * - fuente 'empleado': autoritativa. Siempre sobrescribe
   *   nombre/facultad/correo/id_carnet/numero_contacto y marca
   *   `es_empleado = true` (sin tocar `es_estudiante`).
   * - fuente 'estudiante': siempre actualiza `nombre` y marca
   *   `es_estudiante = true` (sin tocar `es_empleado`), pero SOLO
   *   sobrescribe facultad/correo/id_carnet/numero_contacto cuando la fila
   *   ya existente NO es empleado (para no pisar datos de empleado, más
   *   completos, con datos potencialmente menos completos de estudiante).
   *
   * Si el documento no existe, ambas fuentes lo crean con el flag propio en
   * `true` y el otro en `false` (`tipo` inicial 'estudiante'/'empleado',
   * igual recalculado en lectura, ver TIPO_CALCULADO_SQL).
   * @param {object[]} registros @param {'estudiante'|'empleado'} fuente
   * @returns {Promise<{insertados: number, actualizados: number}>}
   */
  async _upsertPorFuente(registros, fuente) {
    if (!registros.length) return { insertados: 0, actualizados: 0 };

    const esEmpleado = fuente === 'empleado';
    const cols = ['id', 'numero_documento', 'nombre', 'tipo', 'facultad', 'correo', 'id_carnet', 'numero_contacto', 'es_estudiante', 'es_empleado'];
    const bindings = [];
    const placeholders = registros
      .map((r) => {
        bindings.push(
          newId(),
          r.numero_documento,
          r.nombre,
          fuente,
          r.facultad || '',
          r.correo || '',
          r.id_carnet || '',
          r.numero_contacto || '',
          !esEmpleado,
          esEmpleado
        );
        return `(${cols.map(() => '?').join(', ')})`;
      })
      .join(', ');

    const setDatosPersonales = esEmpleado
      ? `
        facultad = EXCLUDED.facultad,
        correo = EXCLUDED.correo,
        id_carnet = EXCLUDED.id_carnet,
        numero_contacto = EXCLUDED.numero_contacto,
      `
      : `
        facultad = CASE WHEN ${TABLES.COMUNIDAD}.es_empleado THEN ${TABLES.COMUNIDAD}.facultad ELSE EXCLUDED.facultad END,
        correo = CASE WHEN ${TABLES.COMUNIDAD}.es_empleado THEN ${TABLES.COMUNIDAD}.correo ELSE EXCLUDED.correo END,
        id_carnet = CASE WHEN ${TABLES.COMUNIDAD}.es_empleado THEN ${TABLES.COMUNIDAD}.id_carnet ELSE EXCLUDED.id_carnet END,
        numero_contacto = CASE WHEN ${TABLES.COMUNIDAD}.es_empleado THEN ${TABLES.COMUNIDAD}.numero_contacto ELSE EXCLUDED.numero_contacto END,
      `;

    const sql = `
      INSERT INTO ${TABLES.COMUNIDAD} (${cols.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (numero_documento) WHERE deleted_at IS NULL
      DO UPDATE SET
        nombre = EXCLUDED.nombre,
        ${setDatosPersonales}
        ${esEmpleado ? 'es_empleado' : 'es_estudiante'} = true
      RETURNING (xmax = 0) AS inserted
    `;
    const { rows } = await this.db.raw(sql, bindings);
    const insertados = rows.filter((r) => r.inserted).length;
    return { insertados, actualizados: rows.length - insertados };
  }

  /** @param {object[]} registros @returns {Promise<{insertados: number, actualizados: number}>} */
  async upsertEmpleados(registros) {
    return this._upsertPorFuente(registros, 'empleado');
  }

  /** @param {object[]} registros @returns {Promise<{insertados: number, actualizados: number}>} */
  async upsertEstudiantes(registros) {
    return this._upsertPorFuente(registros, 'estudiante');
  }
}

module.exports = new ComunidadRepository();
module.exports.TIPOS_COMUNIDAD = TIPOS_COMUNIDAD;
