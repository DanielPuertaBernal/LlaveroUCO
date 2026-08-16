'use strict';

const ApiError = require('../../shared/errors/api.error');
const {
  construirRegistrosPrestamo,
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
  const registros = construirRegistrosPrestamo({
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

  // Si la clase venía de varias franjas consecutivas fusionadas, esto crea
  // varios registros encadenados (ver `construirRegistrosPrestamo`); solo el
  // último queda abierto ("en_prestamo") y es el que se devuelve como
  // préstamo activo para el resto del flujo (devolución, UI). Si alguno de
  // los registros de la cadena vino de una reserva individual en modo de
  // reclamo diferido (`_origenClase._origen === 'individual'`), se recopila
  // el vínculo para que el caller marque esa reserva como reclamada.
  let created;
  const vinculosReservaIndividual = [];
  for (const registro of registros) {
    const origenClase = registro._origenClase;
    created = await llaveRepository.create(registro);
    if (origenClase?._origen === 'individual' && origenClase?.id) {
      vinculosReservaIndividual.push({ reservaId: origenClase.id, registroLlaveId: created.id });
    }
  }
  return { registro: toClientFormat(toPlain(created)), vinculosReservaIndividual };
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
