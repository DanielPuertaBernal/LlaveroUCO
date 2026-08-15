'use strict';
const porterosRepository = require('./porteros.repository');
const bloqueRepository = require('../bloques/bloque.repository');
const ApiError = require('../../shared/errors/api.error');
const { isDominioAutorizado } = require('../auth/auth.constants');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('Porteros');

const OPERACION_A_CAMPO = Object.freeze({
  identificacion: 'permite_identificacion',
  prestamo_llaves: 'permite_prestamo_llaves',
  devolucion_llaves: 'permite_devolucion_llaves',
  prestamo_equipos: 'permite_prestamo_equipos',
});

class PorterosService {
  /**
   * Crea un usuario portero (login exclusivamente vía Office365, igual que
   * el superadmin bootstrapeado en `server.js`: sin password local).
   * @param {string} email @param {string} nombre
   * @returns {Promise<object>}
   */
  async crear(email, nombre) {
    const correo = String(email || '').trim().toLowerCase();
    const nombreLimpio = String(nombre || '').trim();

    if (!correo || !nombreLimpio) {
      throw ApiError.badRequest('email y nombre son requeridos');
    }
    if (!isDominioAutorizado(correo)) {
      throw ApiError.badRequest('Dominio de correo no autorizado');
    }

    const existente = await porterosRepository.findByEmail(correo);
    if (existente) {
      throw ApiError.conflict(`Ya existe un usuario con el email '${correo}'`);
    }

    const creado = await porterosRepository.crearUsuario({ email: correo, nombre: nombreLimpio });
    logger.info('Portero creado', { email: correo });
    return { ...creado, bloques: [] };
  }

  /** @returns {Promise<object[]>} Porteros con sus bloques asignados */
  async listar() {
    const usuarios = await porterosRepository.findAllUsuarios();
    if (!usuarios.length) return [];

    const bloques = await porterosRepository.findBloquesByUsuarios(usuarios.map((u) => u.id));
    const bloquesPorUsuario = new Map();
    for (const b of bloques) {
      if (!bloquesPorUsuario.has(b.usuario_id)) bloquesPorUsuario.set(b.usuario_id, []);
      bloquesPorUsuario.get(b.usuario_id).push(b);
    }

    return usuarios.map((u) => ({ ...u, bloques: bloquesPorUsuario.get(u.id) || [] }));
  }

  /**
   * Reemplaza las asignaciones de bloque de un portero.
   * @param {string} usuarioId
   * @param {Array<object>} bloques - [{ bloque_id, permite_identificacion, permite_prestamo_llaves, permite_devolucion_llaves, permite_prestamo_equipos }]
   * @returns {Promise<object>}
   */
  async asignarBloques(usuarioId, bloques = []) {
    const usuario = await porterosRepository.findUsuarioById(usuarioId);
    if (!usuario) throw ApiError.notFound('Portero no encontrado');

    if (!Array.isArray(bloques)) {
      throw ApiError.badRequest('bloques debe ser un arreglo');
    }

    for (const b of bloques) {
      if (!b?.bloque_id) {
        throw ApiError.badRequest('Cada bloque requiere bloque_id');
      }
      const bloque = await bloqueRepository.findById(b.bloque_id);
      if (!bloque) {
        throw ApiError.notFound(`Bloque '${b.bloque_id}' no encontrado`);
      }
    }

    await porterosRepository.reemplazarBloques(usuarioId, bloques);
    logger.info('Bloques de portero actualizados', { usuarioId, total: bloques.length });

    const bloquesAsignados = await porterosRepository.findBloquesByUsuario(usuarioId);
    return { ...usuario, bloques: bloquesAsignados };
  }

  /** @param {string} usuarioId @returns {Promise<{ok:true}>} */
  async eliminar(usuarioId) {
    const eliminado = await porterosRepository.eliminarUsuario(usuarioId);
    if (!eliminado) throw ApiError.notFound('Portero no encontrado');
    logger.info('Portero eliminado', { usuarioId });
    return { ok: true };
  }

  /**
   * @param {string} usuarioId @param {string} bloqueId @param {string} operacion - una de OPERACIONES_UBICACION
   * @returns {Promise<boolean>}
   */
  async tienePermiso(usuarioId, bloqueId, operacion) {
    const campo = OPERACION_A_CAMPO[operacion];
    if (!campo || !bloqueId) return false;
    return porterosRepository.tienePermisoEnBloque(usuarioId, bloqueId, campo);
  }

  /**
   * Variante bloque-agnóstica: usada por préstamo/devolución de equipos, que
   * no está ligado a ningún bloque en el modelo de datos actual — basta con
   * que el portero tenga el permiso habilitado en al menos un bloque.
   * @param {string} usuarioId @param {string} operacion
   * @returns {Promise<boolean>}
   */
  async tienePermisoGlobal(usuarioId, operacion) {
    const campo = OPERACION_A_CAMPO[operacion];
    if (!campo) return false;
    return porterosRepository.tienePermisoEnAlgunBloque(usuarioId, campo);
  }
}

module.exports = new PorterosService();
