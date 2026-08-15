'use strict';

const ApiError = require('../../shared/errors/api.error');
const {
  construirRegistroPrestamo,
  construirDatosDevolucion,
} = require('./llave.domain');

function validarEntregaManual(infoClase) {
  for (const campo of ['nroidenti', 'profesor', 'aula']) {
    if (!infoClase?.[campo]) {
      throw ApiError.badRequest(`Campo '${campo}' requerido`);
    }
  }
}

function normalizarOrigenRegistro(origen = 'individual') {
  if (!['individual', 'programacion', 'reserva_semestral'].includes(origen)) {
    throw ApiError.badRequest('Origen de préstamo no válido');
  }
  return origen;
}

async function persistirPrestamo({
  llaveRepository,
  docente,
  clase,
  seReclamoATiempo,
  tiempoRetraso,
  reclamaInfo = {},
  tipoEntrega = 'carnet',
  ubicacionPrestamo,
  origenRegistro = 'programacion',
  gestionadoPorUsuarioId = null,
  toClientFormat,
  toPlain,
}) {
  const registro = construirRegistroPrestamo({
    docente,
    clase,
    seReclamoATiempo,
    tiempoRetraso,
    reclamaInfo,
    tipoEntrega,
    ubicacionPrestamo,
    origenRegistro,
    gestionadoPorUsuarioId,
  });

  const created = await llaveRepository.create(registro);
  return toClientFormat(toPlain(created));
}

async function persistirDevolucion({
  llaveRepository,
  registro,
  entregaInfo = {},
  ubicacionPorDefecto = '',
  gestionadoPorUsuarioId = null,
  toClientFormat,
  toPlain,
}) {
  const { updates, mensaje } = construirDatosDevolucion({
    registro,
    entregaInfo,
    ubicacionPorDefecto,
    gestionadoPorUsuarioId,
  });

  const updated = await llaveRepository.update(registro.id, updates);
  return {
    mensaje,
    registro: toClientFormat(toPlain(updated)),
  };
}

module.exports = {
  validarEntregaManual,
  normalizarOrigenRegistro,
  persistirPrestamo,
  persistirDevolucion,
};
