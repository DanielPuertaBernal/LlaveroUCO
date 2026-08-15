'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');

/**
 * Auth Repository (Postgres/Knex) - reemplaza los métodos que en Mongoose
 * operaban sobre `usuarios` y el subdocumento embebido `usuarios.sesiones[]`.
 * `usuario_sesiones` es ahora una tabla hija (FK usuario_id → usuarios,
 * ON DELETE RESTRICT) creada en migrations/003_usuarios.js.
 *
 * Deviation from the original Mongoose behavior: `addRefreshSession` used to
 * *discard* sessions beyond `maxSessions` by simply not including them in the
 * replacement array (no row-level trace left behind). Hard deletes are
 * banned by this migration's design, so pruning now soft-deletes
 * (`deleted_at`) the excess older active sessions instead of physically
 * removing them; they stop counting as active (same effect for every
 * consumer, which only ever looks at `deleted_at IS NULL AND revoked_at IS
 * NULL AND expires_at > now()`), but the row itself is preserved for audit.
 */
class AuthRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  /** @param {string} username @returns {Promise<object|null>} Usuario con hash_password */
  async findByUsername(username) {
    const row = await this.db(TABLES.USUARIOS)
      .where({ usuario: username })
      .whereNull('deleted_at')
      .first();
    return row || null;
  }

  /**
   * @param {string} userId
   * @param {object} sessionData - Datos de sesión (token_hash, user_agent, ip, expires_at, revoked_at)
   * @param {number} maxSessions - Máximo de sesiones activas simultáneas
   * @returns {Promise<boolean>}
   */
  async addRefreshSession(userId, sessionData, maxSessions = 5) {
    const user = await this.db(TABLES.USUARIOS).where({ id: userId }).whereNull('deleted_at').first('id');
    if (!user) return false;

    const now = new Date();
    const activas = await this.db(TABLES.USUARIO_SESIONES)
      .where({ usuario_id: userId })
      .whereNull('deleted_at')
      .whereNull('revoked_at')
      .where('expires_at', '>', now)
      .orderBy('created_at', 'desc');

    const excedentes = activas.slice(Math.max(maxSessions - 1, 0));
    if (excedentes.length) {
      await this.db(TABLES.USUARIO_SESIONES)
        .whereIn('id', excedentes.map((s) => s.id))
        .update({ deleted_at: this.db.fn.now() });
    }

    await this.db(TABLES.USUARIO_SESIONES).insert({
      id: newId(),
      usuario_id: userId,
      token_hash: sessionData.token_hash,
      user_agent: sessionData.user_agent || '',
      ip: sessionData.ip || null,
      expires_at: sessionData.expires_at,
      revoked_at: sessionData.revoked_at || null,
    });
    return true;
  }

  /** @param {string} userId @param {string} tokenHash @returns {Promise<object|null>} */
  async findActiveRefreshSession(userId, tokenHash) {
    const now = new Date();
    const row = await this.db(TABLES.USUARIO_SESIONES)
      .where({ usuario_id: userId, token_hash: tokenHash })
      .whereNull('deleted_at')
      .whereNull('revoked_at')
      .where('expires_at', '>', now)
      .first();
    return row || null;
  }

  /** @param {string} userId @param {string} tokenHash @returns {Promise<boolean>} */
  async revokeRefreshSession(userId, tokenHash) {
    const count = await this.db(TABLES.USUARIO_SESIONES)
      .where({ usuario_id: userId, token_hash: tokenHash })
      .whereNull('deleted_at')
      .whereNull('revoked_at')
      .update({ revoked_at: this.db.fn.now() });
    return count > 0;
  }

  /** @param {string} userId @returns {Promise<boolean>} */
  async revokeAllRefreshSessions(userId) {
    const count = await this.db(TABLES.USUARIO_SESIONES)
      .where({ usuario_id: userId })
      .whereNull('deleted_at')
      .whereNull('revoked_at')
      .update({ revoked_at: this.db.fn.now() });
    return count > 0;
  }
}

module.exports = new AuthRepository();
