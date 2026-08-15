'use strict';
/**
 * Usuario Repository - CRUD completo de usuarios (Postgres/Knex)
 * Equivale a infrastructure/repositories/usuario_mongo_repository.py
 */
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');

/** Columnas seguras para exponer por defecto (nunca hash_password). */
const SAFE_COLUMNS = [
  'id',
  'usuario',
  'nombre',
  'email',
  'contacto',
  'rol',
  'activo',
  'numero_documento',
  'created_at',
  'updated_at',
];

class UsuarioRepository extends BaseRepository {
  constructor() { super(TABLES.USUARIOS); }

  /**
   * Lista todos los usuarios (sin hash_password)
   * @returns {Promise<object[]>}
   */
  async findAll() {
    return this.table.whereNull('deleted_at').select(SAFE_COLUMNS);
  }

  /**
   * Busca por nombre de usuario
   * @param {string} username
   * @returns {Promise<object|null>}
   */
  async findByUsername(username) {
    const row = await this.table
      .where({ usuario: username })
      .whereNull('deleted_at')
      .select(SAFE_COLUMNS)
      .first();
    return row || null;
  }

  /**
   * Busca por ID (sin hash_password)
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const row = await this.table
      .where({ id })
      .whereNull('deleted_at')
      .select(SAFE_COLUMNS)
      .first();
    return row || null;
  }

  /**
   * Busca por email
   * @param {string} email
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    const row = await this.table
      .where({ email: String(email).toLowerCase() })
      .whereNull('deleted_at')
      .select(SAFE_COLUMNS)
      .first();
    return row || null;
  }

  /**
   * Crea un nuevo usuario
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const row = await super.create(data);
    const { hash_password, ...safe } = row;
    return safe;
  }

  /**
   * Actualiza campos de un usuario
   * @param {string} username
   * @param {object} updates
   * @returns {Promise<object|null>}
   */
  async updateByUsername(username, updates) {
    const [row] = await this.table
      .where({ usuario: username })
      .whereNull('deleted_at')
      .update(updates)
      .returning('*');
    if (!row) return null;
    const { hash_password, ...safe } = row;
    return safe;
  }

  /**
   * Activa o desactiva un usuario (soft delete)
   * @param {string} username
   * @param {boolean} activo
   * @returns {Promise<object|null>}
   */
  async setActivo(username, activo) {
    return this.updateByUsername(username, { activo });
  }

  /**
   * Actualiza el hash de contraseña
   * @param {string} username
   * @param {string} hashPassword
   * @returns {Promise<boolean>}
   */
  async updatePassword(username, hashPassword) {
    const count = await this.table
      .where({ usuario: username })
      .whereNull('deleted_at')
      .update({ hash_password: hashPassword });
    return count > 0;
  }

  /**
   * Verifica si existe un usuario por username o email
   * @param {string} username
   * @param {string} email
   * @returns {Promise<{usuarioExiste: boolean, emailExiste: boolean}>}
   */
  async checkDuplicates(username, email) {
    const [byUsername, byEmail] = await Promise.all([
      this.table.where({ usuario: username }).whereNull('deleted_at').first('id'),
      this.table.where({ email: String(email).toLowerCase() }).whereNull('deleted_at').first('id'),
    ]);
    return { usuarioExiste: !!byUsername, emailExiste: !!byEmail };
  }
}

module.exports = new UsuarioRepository();
