'use strict';
const monitorRepository = require('./monitor.repository');
const comunidadRepository = require('../comunidad/comunidad.repository');
const programacionRepository = require('../programacion/programacion.repository');
const ApiError = require('../../shared/errors/api.error');
const { createLogger } = require('../../shared/utils/logger');
const { normalizeLookupKey, normalizeHorario } = require('../../shared/utils/normalize.helper');

const logger = createLogger('Monitores');

class MonitorService {
  async listarTodos() {
    return monitorRepository.findAll();
  }

  async listarPorDocente(documentoDocente) {
    return monitorRepository.findByDocente(documentoDocente);
  }

  async obtenerClasesDocente(documentoDocente) {
    return programacionRepository.findByDocumento(documentoDocente);
  }

  /**
   * Resuelve la fila de `programaciones` que corresponde a la asignación
   * (docente + materia, y dia/horario si se enviaron). Reemplaza el antiguo
   * almacenamiento de materia/aula/horario/dia como texto libre en
   * `monitores` por un FK real `programacion_id` (S4). Tolerante: si no hay
   * coincidencia exacta se deja `null` — pero sin ese vínculo el monitor no
   * aparecerá en la resolución de contexto NFC (`llave.context.js`), porque
   * ya no hay campos de texto libre a los que volver.
   * @param {string} numeroDocumentoDocente @param {{materia: string, dia?: string, horario?: string}} datos
   * @returns {Promise<string|null>}
   */
  async #resolverProgramacionId(numeroDocumentoDocente, { materia, dia, horario }) {
    if (!materia) return null;
    const clasesDelDocente = await programacionRepository.findByDocumento(numeroDocumentoDocente);
    const materiaKey = normalizeLookupKey(materia);
    const diaKey = dia ? normalizeLookupKey(dia) : null;
    const horarioKey = horario ? normalizeHorario(horario) : null;

    const match = (clasesDelDocente || []).find((clase) => {
      if (normalizeLookupKey(clase.materia) !== materiaKey) return false;
      if (diaKey && normalizeLookupKey(clase.dia) !== diaKey) return false;
      if (horarioKey && normalizeHorario(clase.horario) !== horarioKey) return false;
      return true;
    });

    return match ? match.id : null;
  }

  async registrar({ numero_documento_docente, numero_documento_monitor, materia, aula, horario, dia }) {
    const docente = await comunidadRepository.findByDocumento(numero_documento_docente);
    if (!docente) throw ApiError.notFound('Docente no encontrado');

    const monitor = await comunidadRepository.findByDocumento(numero_documento_monitor);
    if (!monitor) throw ApiError.notFound('Persona no encontrada en el sistema');

    if (numero_documento_docente === numero_documento_monitor) {
      throw ApiError.badRequest('El docente no puede ser monitor de sí mismo');
    }

    const programacionId = await this.#resolverProgramacionId(docente.numero_documento, { materia, dia, horario });
    if (!programacionId) {
      throw ApiError.badRequest(
        'No se encontró una clase en la programación del docente que coincida con los datos ingresados'
      );
    }

    const registro = await monitorRepository.create({
      docente_comunidad_id: docente.id,
      monitor_comunidad_id: monitor.id,
      monitor_nombre: monitor.nombre,
      monitor_id_carnet: monitor.id_carnet || '',
      monitor_facultad: monitor.facultad || '',
      monitor_correo: monitor.correo || '',
      programacion_id: programacionId,
      activo: true,
    });

    return { ok: true, mensaje: `Monitor ${monitor.nombre} registrado para ${materia}`, registro };
  }

  async eliminar(id) {
    const existing = await monitorRepository.findById(id);
    if (!existing) throw ApiError.notFound('Monitor no encontrado');
    await monitorRepository.deleteById(id);
    logger.info('Monitor eliminado', { id, nombre: existing.monitor_nombre });
    return { ok: true, mensaje: 'Monitor eliminado correctamente' };
  }

  // Busca si un carnet pertenece a un monitor activo de alguna clase
  async buscarMonitorPorCarnet(idCarnet) {
    return monitorRepository.findByCarnetMonitor(idCarnet);
  }

  async buscarMonitorPorDocumento(documento) {
    return monitorRepository.findByDocumentoMonitor(documento);
  }
}

module.exports = new MonitorService();
