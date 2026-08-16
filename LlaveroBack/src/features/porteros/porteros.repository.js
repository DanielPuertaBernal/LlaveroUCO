'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { ROLES } = require('../auth/auth.constants');

const SAFE_USUARIO_COLUMNS = [
  `${TABLES.USUARIOS}.id`,
  `${TABLES.USUARIOS}.usuario`,
  `${TABLES.USUARIOS}.nombre`,
  `${TABLES.USUARIOS}.email`,
  `${TABLES.USUARIOS}.activo`,
  `${TABLES.USUARIOS}.created_at`,
  `${TABLES.USUARIOS}.updated_at`,
];

/**
 * Repositorio de usuarios con rol 'porteria' + sus permisos por bloque
 * (`portero_bloques`). Reutiliza la tabla `usuarios` (mismo patrón que
 * `usuario.repository.js`), filtrando siempre por `rol = 'porteria'`.
 */
class PorterosRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  /** @param {object} data @returns {Promise<object>} */
  async crearUsuario({ email, nombre, contacto = '' }) {
    const [row] = await this.db(TABLES.USUARIOS)
      .insert({
        id: newId(),
        usuario: email,
        nombre,
        email,
        contacto,
        rol: ROLES.PORTERIA,
        hash_password: null,
        proveedor_auth: 'office365',
        activo: true,
        numero_documento: '',
      })
      .returning('*');
    const { hash_password, ...safe } = row;
    return safe;
  }

  /** @param {string} email @returns {Promise<object|null>} */
  async findByEmail(email) {
    const row = await this.db(TABLES.USUARIOS)
      .where({ email: String(email).toLowerCase() })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }

  /** @param {string} usuarioId @returns {Promise<object|null>} */
  async findUsuarioById(usuarioId) {
    const row = await this.db(TABLES.USUARIOS)
      .where({ id: usuarioId, rol: ROLES.PORTERIA })
      .whereNull('deleted_at')
      .select(SAFE_USUARIO_COLUMNS)
      .first();
    return row || null;
  }

  /** @returns {Promise<object[]>} Usuarios porteros (sin bloques adjuntos) */
  async findAllUsuarios() {
    return this.db(TABLES.USUARIOS)
      .where({ rol: ROLES.PORTERIA })
      .whereNull('deleted_at')
      .select(SAFE_USUARIO_COLUMNS)
      .orderBy(`${TABLES.USUARIOS}.nombre`, 'asc');
  }

  /** @param {string} usuarioId @returns {Promise<object[]>} Bloques asignados activos, con nombre_bloque */
  async findBloquesByUsuario(usuarioId) {
    return this.db(TABLES.PORTERO_BLOQUES)
      .join(TABLES.BLOQUES, `${TABLES.BLOQUES}.id`, `${TABLES.PORTERO_BLOQUES}.bloque_id`)
      .where(`${TABLES.PORTERO_BLOQUES}.usuario_id`, usuarioId)
      .whereNull(`${TABLES.PORTERO_BLOQUES}.deleted_at`)
      .select(
        `${TABLES.PORTERO_BLOQUES}.id`,
        `${TABLES.PORTERO_BLOQUES}.bloque_id`,
        `${TABLES.BLOQUES}.nombre_bloque`,
        `${TABLES.PORTERO_BLOQUES}.permite_identificacion`,
        `${TABLES.PORTERO_BLOQUES}.permite_prestamo_llaves`,
        `${TABLES.PORTERO_BLOQUES}.permite_devolucion_llaves`,
        `${TABLES.PORTERO_BLOQUES}.permite_recepcion_equipos`
      );
  }

  /** @param {string[]} usuarioIds @returns {Promise<object[]>} Bloques activos de varios usuarios a la vez */
  async findBloquesByUsuarios(usuarioIds) {
    if (!usuarioIds.length) return [];
    return this.db(TABLES.PORTERO_BLOQUES)
      .join(TABLES.BLOQUES, `${TABLES.BLOQUES}.id`, `${TABLES.PORTERO_BLOQUES}.bloque_id`)
      .whereIn(`${TABLES.PORTERO_BLOQUES}.usuario_id`, usuarioIds)
      .whereNull(`${TABLES.PORTERO_BLOQUES}.deleted_at`)
      .select(
        `${TABLES.PORTERO_BLOQUES}.usuario_id`,
        `${TABLES.PORTERO_BLOQUES}.bloque_id`,
        `${TABLES.BLOQUES}.nombre_bloque`,
        `${TABLES.PORTERO_BLOQUES}.permite_identificacion`,
        `${TABLES.PORTERO_BLOQUES}.permite_prestamo_llaves`,
        `${TABLES.PORTERO_BLOQUES}.permite_devolucion_llaves`,
        `${TABLES.PORTERO_BLOQUES}.permite_recepcion_equipos`
      );
  }

  /**
   * Reemplaza (soft-delete de las vigentes + inserción de las nuevas) las
   * filas de `portero_bloques` de un usuario portero.
   * @param {string} usuarioId
   * @param {Array<{bloque_id:string, permite_identificacion?:boolean, permite_prestamo_llaves?:boolean, permite_devolucion_llaves?:boolean, permite_recepcion_equipos?:boolean}>} bloques
   * @returns {Promise<object[]>}
   */
  async reemplazarBloques(usuarioId, bloques) {
    return this.db.transaction(async (trx) => {
      await trx(TABLES.PORTERO_BLOQUES)
        .where({ usuario_id: usuarioId })
        .whereNull('deleted_at')
        .update({ deleted_at: trx.fn.now() });

      if (!bloques.length) return [];

      const payload = bloques.map((b) => ({
        id: newId(),
        usuario_id: usuarioId,
        bloque_id: b.bloque_id,
        permite_identificacion: Boolean(b.permite_identificacion),
        permite_prestamo_llaves: Boolean(b.permite_prestamo_llaves),
        permite_devolucion_llaves: Boolean(b.permite_devolucion_llaves),
        permite_recepcion_equipos: Boolean(b.permite_recepcion_equipos),
      }));

      return trx(TABLES.PORTERO_BLOQUES).insert(payload).returning('*');
    });
  }

  /**
   * Soft-delete de un usuario portero. Los hijos (`portero_bloques`) se
   * eliminan primero: el trigger `trg_block_soft_delete` de `usuarios`
   * bloquea el soft-delete del padre si aún quedan hijos activos.
   * @param {string} usuarioId @returns {Promise<object|null>} Usuario portero soft-eliminado
   */
  async eliminarUsuario(usuarioId) {
    return this.db.transaction(async (trx) => {
      const usuarioExiste = await trx(TABLES.USUARIOS)
        .where({ id: usuarioId, rol: ROLES.PORTERIA })
        .whereNull('deleted_at')
        .first('id');
      if (!usuarioExiste) return null;

      await trx(TABLES.PORTERO_BLOQUES)
        .where({ usuario_id: usuarioId })
        .whereNull('deleted_at')
        .update({ deleted_at: trx.fn.now() });

      const [usuario] = await trx(TABLES.USUARIOS)
        .where({ id: usuarioId, rol: ROLES.PORTERIA })
        .whereNull('deleted_at')
        .update({ deleted_at: trx.fn.now() })
        .returning('*');
      if (!usuario) return null;

      const { hash_password, ...safe } = usuario;
      return safe;
    });
  }

  /**
   * @param {string} usuarioId @param {string} bloqueId @param {string} campoPermiso
   * @returns {Promise<boolean>}
   */
  async tienePermisoEnBloque(usuarioId, bloqueId, campoPermiso) {
    const row = await this.db(TABLES.PORTERO_BLOQUES)
      .where({ usuario_id: usuarioId, bloque_id: bloqueId })
      .whereNull('deleted_at')
      .first(campoPermiso);
    return Boolean(row?.[campoPermiso]);
  }

  /**
   * Bloque-agnóstico: usado para operaciones sin bloque asociado (préstamo de
   * equipos, que no está ligado a ningún salón/bloque en el modelo actual).
   * @param {string} usuarioId @param {string} campoPermiso
   * @returns {Promise<boolean>}
   */
  async tienePermisoEnAlgunBloque(usuarioId, campoPermiso) {
    const row = await this.db(TABLES.PORTERO_BLOQUES)
      .where({ usuario_id: usuarioId })
      .andWhere(campoPermiso, true)
      .whereNull('deleted_at')
      .first('id');
    return Boolean(row);
  }
}

module.exports = new PorterosRepository();
