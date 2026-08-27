'use strict';
const elementoAfectadoRepository = require('./elementoAfectado.repository');
const ApiError = require('../../shared/errors/api.error');
const { normalizeKey, normalizeString } = require('../../shared/utils/normalize.helper');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('ElementosAfectados');

/**
 * Semilla mínima, no una lista cerrada: el catálogo es administrable y la
 * idea es que mantenimiento agregue lo que falte sin tocar código. El `orden`
 * refleja lo que más se reporta en aulas, para que el Select del formulario
 * no obligue a buscar.
 */
const DEFAULT_ELEMENTOS = Object.freeze([
  { clave: 'silla', nombre: 'Silla', orden: 10 },
  { clave: 'ventana', nombre: 'Ventana', orden: 20 },
  { clave: 'puerta', nombre: 'Puerta', orden: 30 },
  { clave: 'cerradura', nombre: 'Cerradura', orden: 40 },
  { clave: 'llave', nombre: 'Llave', orden: 50 },
  { clave: 'tablero', nombre: 'Tablero', orden: 60 },
  { clave: 'escritorio', nombre: 'Escritorio / mesa', orden: 70 },
  { clave: 'proyector', nombre: 'Proyector', orden: 80 },
  { clave: 'aire_acondicionado', nombre: 'Aire acondicionado', orden: 90 },
  { clave: 'iluminacion', nombre: 'Iluminación', orden: 100 },
  { clave: 'toma_electrica', nombre: 'Toma eléctrica', orden: 110 },
  { clave: 'red_datos', nombre: 'Red de datos', orden: 120 },
  { clave: 'pared_piso_techo', nombre: 'Pared / piso / techo', orden: 130 },
  { clave: 'otro', nombre: 'Otro', orden: 999 },
].map((e) => ({ ...e, descripcion: '', activo: true })));

class ElementoAfectadoService {
  constructor() {
    this._defaultsReadyPromise = null;
  }

  async asegurarIniciales() {
    if (!this._defaultsReadyPromise) {
      this._defaultsReadyPromise = elementoAfectadoRepository.upsertDefaults(DEFAULT_ELEMENTOS)
        .catch((error) => {
          this._defaultsReadyPromise = null;
          throw error;
        });
    }

    await this._defaultsReadyPromise;
  }

  async listar({ incluirInactivos = false } = {}) {
    await this.asegurarIniciales();
    return elementoAfectadoRepository.findAll({ soloActivos: !incluirInactivos });
  }

  /**
   * Resuelve el id a guardar en `novedades.elemento_afectado_id`. Acepta el
   * id directo o la clave del catálogo, para que el front pueda mandar
   * cualquiera de los dos sin un lookup previo.
   * @param {string} [idOClave]
   * @returns {Promise<string|null>} null cuando no se especificó elemento
   */
  async resolverId(idOClave) {
    const valor = String(idOClave || '').trim();
    if (!valor) return null;

    await this.asegurarIniciales();

    const porId = await elementoAfectadoRepository.findById(valor).catch(() => null);
    if (porId && !porId.deleted_at) return porId.id;

    const porClave = await elementoAfectadoRepository.findByClave(normalizeKey(valor));
    if (!porClave) {
      throw ApiError.badRequest(`El elemento afectado '${valor}' no está registrado`);
    }
    if (!porClave.activo) {
      throw ApiError.badRequest(`El elemento afectado '${porClave.nombre}' está inactivo`);
    }
    return porClave.id;
  }

  async registrar(data) {
    await this.asegurarIniciales();
    const payload = this._normalizarPayload(data);
    const existing = await elementoAfectadoRepository.findByClave(payload.clave);
    if (existing) {
      throw ApiError.conflict(`Ya existe un elemento con la clave '${payload.clave}'`);
    }
    const creado = await elementoAfectadoRepository.create(payload);
    logger.info('Elemento afectado creado', { clave: payload.clave });
    return creado;
  }

  async actualizar(id, updates) {
    await this.asegurarIniciales();
    const current = await elementoAfectadoRepository.findById(id);
    if (!current) throw ApiError.notFound('Elemento afectado no encontrado');

    const payload = this._normalizarPayload(updates, true);
    if (payload.clave && payload.clave !== current.clave) {
      const existing = await elementoAfectadoRepository.findByClave(payload.clave);
      if (existing && String(existing.id) !== String(id)) {
        throw ApiError.conflict(`Ya existe un elemento con la clave '${payload.clave}'`);
      }
    }

    const updated = await elementoAfectadoRepository.update(id, payload);
    if (!updated) throw ApiError.notFound('Elemento afectado no encontrado');
    return updated;
  }

  /**
   * El borrado en blando lo bloquea `trg_block_soft_delete` cuando hay
   * novedades apuntando al elemento (ver 023_elementos_afectados). En ese
   * caso el camino correcto es desactivarlo, no borrarlo: el histórico tiene
   * que seguir mostrando qué se dañó.
   */
  async eliminar(id) {
    await this.asegurarIniciales();
    const deleted = await elementoAfectadoRepository.deleteById(id);
    if (!deleted) throw ApiError.notFound('Elemento afectado no encontrado');
    logger.info('Elemento afectado eliminado', { id });
    return { ok: true };
  }

  _normalizarPayload(data, parcial = false) {
    const payload = { ...data };

    if (payload.clave !== undefined) payload.clave = this._normalizarClave(payload.clave);
    if (payload.nombre !== undefined) payload.nombre = normalizeString(payload.nombre);
    if (payload.descripcion !== undefined) payload.descripcion = normalizeString(payload.descripcion);
    if (payload.activo !== undefined) payload.activo = Boolean(payload.activo);
    if (payload.orden !== undefined) payload.orden = Number.parseInt(payload.orden, 10) || 0;

    if (!parcial) {
      for (const campo of ['clave', 'nombre']) {
        if (!payload[campo]) {
          throw ApiError.badRequest(`Campo '${campo}' requerido`);
        }
      }
    }

    return payload;
  }

  _normalizarClave(clave) {
    const normalizada = normalizeKey(clave);
    if (!normalizada) {
      throw ApiError.badRequest('Clave de elemento afectado requerida');
    }
    return normalizada;
  }
}

module.exports = new ElementoAfectadoService();
