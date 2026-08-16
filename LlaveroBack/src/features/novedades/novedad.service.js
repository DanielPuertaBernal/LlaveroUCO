'use strict';
const novedadRepository = require('./novedad.repository');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('Novedades');

// Orden de avance: una novedad solo puede moverse hacia adelante
// (abierta → en_revision → resuelta), nunca retroceder — evita el rastro
// inconsistente de ir y volver entre estados sin dejar registro de quién lo
// hizo (ver migración 016_novedades_estado_monotonico).
const RANGO_ESTADO = { abierta: 0, en_revision: 1, resuelta: 2 };

class NovedadService {
  async registrar(datos) {
    const novedad = await novedadRepository.create(datos);
    logger.info('Novedad registrada', {
      id: novedad.id,
      tipo: datos.tipo_recurso,
      categoria: datos.categoria,
    });
    return novedad;
  }

  async listar(filters, pagination) {
    return novedadRepository.findAll(filters, pagination);
  }

  async obtenerPorId(id) {
    const novedad = await novedadRepository.findById(id);
    if (!novedad) {
      const ApiError = require('../../shared/errors/api.error');
      throw ApiError.notFound('Novedad no encontrada');
    }
    return novedad;
  }

  async actualizarEstado(id, estado, resolucion, actor = {}) {
    const ApiError = require('../../shared/errors/api.error');
    const novedad = await novedadRepository.findById(id);
    if (!novedad) {
      throw ApiError.notFound('Novedad no encontrada');
    }

    const rangoActual = RANGO_ESTADO[novedad.estado] ?? 0;
    const rangoNuevo = RANGO_ESTADO[estado];
    if (rangoNuevo === undefined) {
      throw ApiError.badRequest(`Estado inválido: ${estado}`);
    }
    if (rangoNuevo < rangoActual) {
      throw ApiError.badRequest(
        `No se puede regresar una novedad de "${novedad.estado}" a "${estado}"`
      );
    }
    if (!String(resolucion || '').trim()) {
      throw ApiError.badRequest('La resolución es obligatoria');
    }

    const nombreActor = actor.nombre || actor.documento || '';
    const updates = { estado };
    if (resolucion !== undefined) updates.resolucion = resolucion;
    if (estado === 'en_revision' && novedad.estado !== 'en_revision') {
      updates.en_revision_por = nombreActor;
      updates.en_revision_en = new Date();
    }
    if (estado === 'resuelta') {
      updates.fecha_resolucion = new Date();
      updates.resuelto_por = nombreActor;
    }

    const updated = await novedadRepository.updateById(id, updates);
    logger.info('Novedad actualizada', { id, estado, actor: nombreActor });
    return updated;
  }

  async estadisticas() {
    return novedadRepository.estadisticas();
  }
}

module.exports = new NovedadService();
