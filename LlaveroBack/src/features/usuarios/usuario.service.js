'use strict';
/**
 * Usuario Service - Gestión de usuarios del sistema
 * Equivale a application/services/auth_service.py (sección gestión de usuarios)
 */
const usuarioRepository = require('./usuario.repository');
const authRepository = require('../auth/auth.repository');
const authService = require('../auth/auth.service');
const comunidadRepository = require('../comunidad/comunidad.repository');
const ApiError = require('../../shared/errors/api.error');
const { ROLES } = require('../auth/auth.constants');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('Usuarios');

class UsuarioService {
  /**
   * Lista todos los usuarios activos e inactivos
   * Solo ADMIN_PROG puede ver esto
   * @returns {Promise<object[]>}
   */
  async listarUsuarios() {
    const usuarios = await usuarioRepository.findAll();
    // Enriquecer con datos de comunidad si tienen numero_documento vinculado
    const documentos = usuarios.map((u) => u.numero_documento).filter(Boolean);
    const personas = documentos.length
      ? await comunidadRepository.findManyByDocumentos(documentos)
      : [];
    const personaMap = new Map(personas.map((p) => [p.numero_documento, p]));
    return usuarios.map((u) => ({
      ...u,
      comunidad: u.numero_documento ? (personaMap.get(u.numero_documento) || null) : null,
    }));
  }

  /**
   * Deriva un nombre de usuario único a partir del correo (login es siempre
   * por Office365/correo; `usuario` solo se conserva como identificador de
   * auditoría interno, no se le pide al admin que lo escriba).
   * @param {string} email
   * @returns {Promise<string>}
   */
  async _generarUsuarioDesdeEmail(email) {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario';
    let candidato = base;
    let sufijo = 1;
    while ((await usuarioRepository.checkDuplicates(candidato, '')).usuarioExiste) {
      candidato = `${base}${++sufijo}`;
    }
    return candidato;
  }

  /**
   * Crea un nuevo usuario (autenticación siempre vía Office365 por correo)
   * Solo ADMIN_PROG puede crear usuarios
   * @param {object} data
   * @param {string} data.nombre
   * @param {string} data.email
   * @param {string} data.contacto
   * @param {string} [data.rol] - Default: AUX_PROG
   * @returns {Promise<object>}
   */
  async crearUsuario({ nombre, email, contacto, rol, numero_documento }) {
    const emailNormalizado = email.toLowerCase().trim();
    const { emailExiste } = await usuarioRepository.checkDuplicates('', emailNormalizado);
    if (emailExiste) {
      throw ApiError.conflict(`El email '${email}' ya está registrado`);
    }

    const usuario = await this._generarUsuarioDesdeEmail(emailNormalizado);

    return usuarioRepository.create({
      usuario,
      nombre: nombre.trim(),
      email: emailNormalizado,
      contacto: contacto || '',
      rol: rol || ROLES.AUX,
      hash_password: null,
      proveedor_auth: 'office365',
      activo: true,
      numero_documento: numero_documento || '',
    });
  }

  /**
   * Activa o desactiva un usuario
   * @param {string} username
   * @param {boolean} activo
   * @param {string} usuarioActual - Usuario que hace la acción
   * @returns {Promise<object>}
   */
  async cambiarEstado(username, activo, usuarioActual) {
    if (username === usuarioActual) {
      throw ApiError.badRequest('No puedes desactivarte a ti mismo');
    }
    const updated = await usuarioRepository.setActivo(username, activo);
    if (!updated) {
      throw ApiError.notFound(`Usuario '${username}' no encontrado`);
    }
    if (!activo) {
      await authRepository.revokeAllRefreshSessions(updated.id);
    }
    logger.info('Estado de usuario cambiado', { username, activo });
    return updated;
  }

  /**
   * Edita el perfil propio (nombre, email, contacto)
   * @param {string} username
   * @param {object} data
   * @returns {Promise<object>}
   */
  async editarPerfil(username, { nombre, email, contacto }) {
    const updates = {};
    if (nombre) updates.nombre = nombre.trim();
    if (email) {
      // Verificar que el email no esté en uso por otro usuario
      const existing = await usuarioRepository.findByEmail(email);
      if (existing && existing.usuario !== username) {
        throw ApiError.conflict('El email ya está en uso');
      }
      updates.email = email.toLowerCase().trim();
    }
    if (contacto !== undefined) updates.contacto = contacto;

    const updated = await usuarioRepository.updateByUsername(username, updates);
    if (!updated) {
      throw ApiError.notFound('Usuario no encontrado');
    }
    return updated;
  }

  /**
   * Cambia la contraseña del usuario actual
   * @param {string} username
   * @param {string} passwordActual
   * @param {string} passwordNueva
   * @returns {Promise<boolean>}
   */
  async cambiarContrasena(username, passwordActual, passwordNueva) {
    const user = await authRepository.findByUsername(username);
    if (!user) {
      throw ApiError.notFound('Usuario no encontrado');
    }

    const match = await authService.verifyPassword(passwordActual, user.hash_password);
    if (!match) {
      throw ApiError.unauthorized('Contraseña actual incorrecta');
    }

    const newHash = await authService.hashPassword(passwordNueva);
    await usuarioRepository.updatePassword(username, newHash);
    await authRepository.revokeAllRefreshSessions(user.id);
    return true;
  }

  /**
   * Obtiene un usuario por username
   * @param {string} username
   * @returns {Promise<object>}
   */
  async obtenerUsuario(username) {
    const user = await usuarioRepository.findByUsername(username);
    if (!user) {
      throw ApiError.notFound(`Usuario '${username}' no encontrado`);
    }
    return user;
  }
}

module.exports = new UsuarioService();
