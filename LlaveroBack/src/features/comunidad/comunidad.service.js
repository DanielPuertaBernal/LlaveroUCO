'use strict';
const comunidadRepository = require('./comunidad.repository');
const ApiError = require('../../shared/errors/api.error');
const { normalizeDocumento } = require('../../shared/utils/normalize.helper');
const { TIPOS_COMUNIDAD } = comunidadRepository;
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('Comunidad');

class ComunidadService {
  async listar(tipo) {
    const filtro = tipo ? { tipo } : {};
    return comunidadRepository.findAll(filtro);
  }

  async buscarPorDocumento(documento) {
    const persona = await comunidadRepository.findByDocumento(normalizeDocumento(documento));
    if (!persona) throw ApiError.notFound('Persona no encontrada');
    return persona;
  }

  async buscarPorCarnet(idCarnet) {
    const persona = await comunidadRepository.findByCarnet(idCarnet);
    if (!persona) throw ApiError.notFound('Persona no encontrada por carnet');
    return persona;
  }

  async buscar(query, tipo) {
    const filtro = tipo ? { tipo } : {};
    return comunidadRepository.search(query, filtro);
  }

  async crearPersona(datos) {
    const { numero_documento, nombre, tipo, facultad, correo, id_carnet, numero_contacto } = datos;
    if (!numero_documento?.trim() || !nombre?.trim() || !tipo) {
      throw ApiError.badRequest('numero_documento, nombre y tipo son requeridos');
    }
    if (!TIPOS_COMUNIDAD.includes(tipo)) {
      throw ApiError.badRequest(`tipo debe ser uno de: ${TIPOS_COMUNIDAD.join(', ')}`);
    }
    const existe = await comunidadRepository.findByDocumento(String(numero_documento).trim());
    if (existe) throw ApiError.conflict('Ya existe una persona con ese número de documento');

    const nueva = await comunidadRepository.crear({
      numero_documento: String(numero_documento).trim(),
      nombre: String(nombre).trim(),
      tipo,
      facultad: String(facultad || '').trim(),
      correo: String(correo || '').trim().toLowerCase(),
      id_carnet: String(id_carnet || '').trim(),
      numero_contacto: String(numero_contacto || '').trim(),
    });
    logger.info('Persona creada manualmente', { documento: nueva.numero_documento, tipo: nueva.tipo });
    return nueva;
  }

  async sync(payload) {
    const registros = Array.isArray(payload.registros)
      ? payload.registros
      : payload.registro
        ? [payload.registro]
        : [];

    if (!registros.length) {
      throw ApiError.badRequest('Debe enviar al menos un registro (campo "registro" o "registros")');
    }

    const validados = registros.map((r, i) => this._validarRegistro(r, i));

    if (validados.length === 1) {
      const persona = await comunidadRepository.upsertOne(validados[0]);
      logger.info('Sync individual completado', { documento: validados[0].numero_documento });
      return { sincronizados: 1, detalle: persona };
    }

    const resultado = await comunidadRepository.upsertMany(validados);
    logger.info('Sync masivo completado', { total: validados.length });
    return { sincronizados: validados.length, ...resultado };
  }

  /**
   * Sync desde el sistema fuente de estudiantes (ETL institucional). Sin
   * `tipo` en el payload (no aplica: ya se sabe que viene de la fuente
   * estudiantes). Usa el merge compartido con precedencia de empleado sobre
   * estudiante, ver `comunidadRepository._upsertPorFuente`.
   * @param {object} payload
   */
  async syncEstudiantes(payload) {
    return this._syncPorFuente(payload, 'estudiante');
  }

  /**
   * Sync desde el sistema fuente de empleados/RRHH (ETL institucional). Sin
   * `tipo` en el payload. Los datos de empleado son autoritativos y siempre
   * sobrescriben facultad/correo/id_carnet/numero_contacto.
   * @param {object} payload
   */
  async syncEmpleados(payload) {
    return this._syncPorFuente(payload, 'empleado');
  }

  async _syncPorFuente(payload, fuente) {
    const registros = Array.isArray(payload.registros)
      ? payload.registros
      : payload.registro
        ? [payload.registro]
        : [];

    if (!registros.length) {
      throw ApiError.badRequest('Debe enviar al menos un registro (campo "registro" o "registros")');
    }

    const validados = registros.map((r, i) => this._validarRegistroSinTipo(r, i));
    const metodo = fuente === 'empleado' ? 'upsertEmpleados' : 'upsertEstudiantes';
    const resultado = await comunidadRepository[metodo](validados);
    logger.info(`Sync de ${fuente}s completado`, { total: validados.length, fuente });
    return { sincronizados: validados.length, ...resultado };
  }

  async actualizar(id, data) {
    const persona = await comunidadRepository.findById(id);
    if (!persona) throw ApiError.notFound('Persona no encontrada');

    const CAMPOS_PERMITIDOS = ['nombre', 'tipo', 'facultad', 'correo', 'id_carnet', 'numero_contacto'];
    const actualizado = {};
    for (const campo of CAMPOS_PERMITIDOS) {
      if (data[campo] !== undefined) actualizado[campo] = String(data[campo]).trim();
    }
    if (actualizado.tipo && !TIPOS_COMUNIDAD.includes(actualizado.tipo)) {
      throw ApiError.badRequest(`tipo debe ser uno de: ${TIPOS_COMUNIDAD.join(', ')}`);
    }
    if (actualizado.correo) actualizado.correo = actualizado.correo.toLowerCase();
    if (!Object.keys(actualizado).length) throw ApiError.badRequest('No hay campos para actualizar');

    return comunidadRepository.updateById(id, actualizado);
  }

  async eliminar(id) {
    const persona = await comunidadRepository.deleteById(id);
    if (!persona) throw ApiError.notFound('Persona no encontrada');
    return persona;
  }

  _validarRegistro(r, idx) {
    if (!r.numero_documento?.trim()) {
      throw ApiError.badRequest(`Registro ${idx}: numero_documento es requerido`);
    }
    if (!r.nombre?.trim()) {
      throw ApiError.badRequest(`Registro ${idx}: nombre es requerido`);
    }
    if (!r.tipo || !TIPOS_COMUNIDAD.includes(r.tipo)) {
      throw ApiError.badRequest(
        `Registro ${idx}: tipo debe ser uno de: ${TIPOS_COMUNIDAD.join(', ')}`
      );
    }

    return {
      numero_documento: String(r.numero_documento).trim(),
      nombre: String(r.nombre).trim(),
      tipo: r.tipo,
      facultad: String(r.facultad || '').trim(),
      correo: String(r.correo || '').trim().toLowerCase(),
      id_carnet: String(r.id_carnet || '').trim(),
    };
  }

  /**
   * Valida un registro de los sync `/sync/estudiantes` y `/sync/empleados`:
   * mismos campos que `_validarRegistro`, sin `tipo` (la fuente ya lo
   * determina) y con `numero_contacto` incluido (sí participa en el merge).
   * @param {object} r @param {number} idx
   */
  _validarRegistroSinTipo(r, idx) {
    if (!r.numero_documento?.trim()) {
      throw ApiError.badRequest(`Registro ${idx}: numero_documento es requerido`);
    }
    if (!r.nombre?.trim()) {
      throw ApiError.badRequest(`Registro ${idx}: nombre es requerido`);
    }

    return {
      numero_documento: String(r.numero_documento).trim(),
      nombre: String(r.nombre).trim(),
      facultad: String(r.facultad || '').trim(),
      correo: String(r.correo || '').trim().toLowerCase(),
      id_carnet: String(r.id_carnet || '').trim(),
      numero_contacto: String(r.numero_contacto || '').trim(),
    };
  }
}

module.exports = new ComunidadService();
