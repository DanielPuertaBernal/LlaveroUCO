'use strict';

const llaveRepository = require('./llave.repository');
const comunidadRepository = require('../comunidad/comunidad.repository');
const programacionRepository = require('../programacion/programacion.repository');
const monitorRepository = require('../monitores/monitor.repository');
const reservasSemestralesRepository = require('../reservas_semestrales/reservas_semestrales.repository');
const {
  getFechaHoy,
  getDiaActual,
} = require('../../shared/utils/date.helper');
const {
  normalizeAula,
  normalizeHorario,
} = require('../../shared/utils/normalize.helper');
const {
  normalizarDocumento,
  horarioCubiertoPorPrestamo,
  agruparClasesConsecutivas,
} = require('./llave.domain');

/**
 * Mapea una reserva semestral al formato de clase esperado por los workflows de llaves.
 * @param {object} reserva
 * @returns {object}
 */
function reservaSemestralToClase(reserva) {
  return {
    id: reserva.id,
    numero_documento: normalizarDocumento(reserva.numero_documento),
    dia: reserva.dia || '',
    horario: reserva.horario || '',
    hora_inicio: reserva.hora_inicio || '',
    hora_fin: reserva.hora_fin || '',
    aula: reserva.aula || '',
    facultad: 'Reserva Semestral',
    materia: reserva.materia || '',
    _origen: 'reserva_semestral',
  };
}

/**
 * Busca una persona de la comunidad por su ID de carnet NFC, o por número de
 * documento si no hay match de carnet (el modal de entrega acepta escribir
 * el documento manualmente cuando no se tiene el carnet a mano).
 */
async function buscarPersonaPorCarnet(idCarnet) {
  const porCarnet = await comunidadRepository.findByCarnet(idCarnet);
  if (porCarnet) return porCarnet;
  return comunidadRepository.findByDocumento(normalizarDocumento(idCarnet));
}

/**
 * Resuelve el contexto completo para una lectura NFC: préstamo activo, rol y clases disponibles.
 * Prioriza devolución si hay préstamo pendiente, luego evalua si es docente o monitor.
 * @param {Object} persona - Persona encontrada por carnet
 * @param {string} documento - Documento normalizado
 * @returns {Promise<{ rol, docente, prestamoActivo, clasesDisponibles, mensajeSinClase? }>}
 */
async function resolverContextoNFC(persona, documento) {
  // Priorizar devolución: si el documento escaneado ya tiene llaves en préstamo,
  // debe permitirse devolver incluso sin clases en programación.
  const prestamosActivos = await llaveRepository.findPendientesByDocumento(documento);
  if (prestamosActivos.length === 1) {
    return { rol: 'docente', docente: persona, prestamoActivo: prestamosActivos[0], prestamosActivos, clasesDisponibles: [] };
  }
  if (prestamosActivos.length > 1) {
    return { rol: 'docente', docente: persona, prestamoActivo: null, prestamosActivos, clasesDisponibles: [] };
  }

  const diaActual = getDiaActual();
  const [todasClases, registrosHoy, reservasSemestralesHoy] = await Promise.all([
    programacionRepository.findByDia(diaActual),
    llaveRepository.findByFecha(getFechaHoy()),
    reservasSemestralesRepository.findByDia(diaActual, new Date()),
  ]);

  const clasesDocente = (todasClases || []).filter(
    (clase) => normalizarDocumento(clase.numero_documento) === documento
  );

  const reservasDocente = (reservasSemestralesHoy || []).filter(
    (r) => normalizarDocumento(r.numero_documento) === documento
  );

  if (clasesDocente.length || reservasDocente.length) {
    return resolverContextoDocente({ persona, documento, clasesDocente, reservasDocente, registrosHoy });
  }

  return resolverContextoMonitor({ persona, documento, registrosHoy });
}

/** Resuelve contexto cuando la persona es un docente con clases programadas o reservas semestrales. */
async function resolverContextoDocente({ persona, documento, clasesDocente, reservasDocente = [], registrosHoy }) {
  const prestamosActivos = await llaveRepository.findPendientesByDocumento(documento);
  if (prestamosActivos.length === 1) {
    return { rol: 'docente', docente: persona, prestamoActivo: prestamosActivos[0], prestamosActivos, clasesDisponibles: [] };
  }
  if (prestamosActivos.length > 1) {
    return { rol: 'docente', docente: persona, prestamoActivo: null, prestamosActivos, clasesDisponibles: [] };
  }

  const horariosProcesados = (registrosHoy || [])
    .filter((registro) => normalizarDocumento(registro.numero_documento) === documento)
    .map((registro) => String(registro.horario || '').trim());

  const clasesProgramacion = agruparClasesConsecutivas(
    (clasesDocente || []).filter(
      (clase) => !horarioCubiertoPorPrestamo(String(clase.horario || '').trim(), horariosProcesados)
    )
  );

  const clasesReservas = (reservasDocente || [])
    .map(reservaSemestralToClase)
    .filter((r) => !horarioCubiertoPorPrestamo(String(r.horario || '').trim(), horariosProcesados));

  const clasesDisponibles = [...clasesProgramacion, ...clasesReservas];

  if (!clasesDisponibles.length) {
    return {
      rol: 'docente',
      docente: persona,
      prestamoActivo: null,
      clasesDisponibles: [],
      mensajeSinClase: 'Todas las clases y reservas de hoy ya fueron procesadas',
    };
  }

  return { rol: 'docente', docente: persona, prestamoActivo: null, clasesDisponibles };
}

/**
 * Resuelve contexto cuando la persona es un monitor autorizado.
 *
 * S4 (Postgres): antes las asignaciones de monitor traían materia/aula/
 * horario/dia como texto libre, y había que cruzarlas en memoria contra
 * `todasClases` (`matchMonitorClase`) para encontrar la clase real. Ahora
 * `monitores.programacion_id` es un FK directo a la fila de `programaciones`
 * que el monitor cubre, así que `monitorRepository.findByDocumentoMonitorYDia`
 * ya devuelve, vía JOIN SQL, exactamente esa(s) clase(s) — no hace falta
 * volver a cruzar contra un listado completo del día.
 */
async function resolverContextoMonitor({ persona, documento, registrosHoy }) {
  const diaActual = getDiaActual();
  const asignaciones = await monitorRepository.findByDocumentoMonitorYDia(documento, diaActual);
  if (!asignaciones.length) {
    return {
      rol: 'docente',
      docente: persona,
      prestamoActivo: null,
      clasesDisponibles: [],
      mensajeSinClase: 'No tiene clases programadas hoy ni es monitor autorizado',
    };
  }

  const docentesUnicos = new Set(asignaciones.map((a) => normalizarDocumento(a.numero_documento_docente)));
  for (const docenteDocumento of docentesUnicos) {
    const prestamoActivo = await llaveRepository.findPendienteByDocumento(docenteDocumento);
    if (prestamoActivo) {
      const docente = await comunidadRepository.findByDocumento(docenteDocumento);
      return {
        rol: 'monitor',
        docente: docente || { numero_documento: docenteDocumento, nombre: asignaciones.find(
          (a) => normalizarDocumento(a.numero_documento_docente) === docenteDocumento
        )?.nombre_docente },
        prestamoActivo,
        clasesDisponibles: [],
      };
    }
  }

  const clasesDisponibles = obtenerClasesDisponiblesMonitor({ asignaciones, registrosHoy });

  if (!clasesDisponibles.length) {
    return {
      rol: 'monitor',
      docente: persona,
      prestamoActivo: null,
      clasesDisponibles: [],
      mensajeSinClase: 'No hay clases disponibles para este monitor hoy',
    };
  }

  const docenteTitular = await comunidadRepository.findByDocumento(
    normalizarDocumento(clasesDisponibles[0].numero_documento)
  );

  return {
    rol: 'monitor',
    docente: docenteTitular || persona,
    prestamoActivo: null,
    clasesDisponibles,
  };
}

/**
 * Filtra las clases (ya resueltas por JOIN en `findByDocumentoMonitorYDia`)
 * excluyendo las cuyo horario ya fue cubierto por un préstamo registrado
 * hoy, y agrupa bloques consecutivos del mismo docente/aula.
 */
function obtenerClasesDisponiblesMonitor({ asignaciones = [], registrosHoy = [] }) {
  const clasesMonitor = [];

  for (const asignacion of asignaciones) {
    if (!asignacion.programacion_id) continue; // asignación sin clase vinculada: no resoluble
    const docenteDocumento = normalizarDocumento(asignacion.numero_documento_docente);

    const horariosProcesados = (registrosHoy || [])
      .filter((registro) => normalizarDocumento(registro.numero_documento) === docenteDocumento)
      .map((registro) => String(registro.horario || '').trim());

    if (!horarioCubiertoPorPrestamo(String(asignacion.horario || '').trim(), horariosProcesados)) {
      clasesMonitor.push({
        id: asignacion.programacion_id,
        numero_documento: asignacion.numero_documento_docente,
        dia: asignacion.dia,
        horario: asignacion.horario,
        aula: asignacion.aula,
        materia: asignacion.materia,
      });
    }
  }

  return agruparClasesConsecutivas(clasesMonitor);
}

/**
 * Busca una clase específica para confirmar un préstamo anticipado (docente
 * o monitor).
 *
 * S4 (Postgres): la rama de monitor ya no cruza `programacionRepository
 * .findByDia` contra las asignaciones en memoria — usa directamente el JOIN
 * de `monitorRepository.findByDocumentoMonitorYDia`, que trae aula/horario
 * ya resueltos desde la fila de `programaciones` vinculada.
 */
async function buscarClaseParaConfirmacion({ persona, aula, horario, rol }) {
  const documento = normalizarDocumento(persona.numero_documento);
  const aulaNormalizada = normalizeAula(aula);
  const horarioNormalizado = normalizeHorario(horario);
  const esMonitor = rol === 'monitor';
  const diaActual = getDiaActual();

  let clase = null;
  let docenteDoc = documento;

  if (esMonitor) {
    const asignaciones = await monitorRepository.findByDocumentoMonitorYDia(documento, diaActual);
    const clasesAsignadas = asignaciones
      .filter((a) => a.programacion_id)
      .map((a) => ({
        id: a.programacion_id,
        numero_documento: a.numero_documento_docente,
        dia: a.dia,
        horario: a.horario,
        aula: a.aula,
        materia: a.materia,
      }));
    const clasesEnAula = clasesAsignadas.filter((item) => normalizeAula(item.aula) === aulaNormalizada);
    const agrupadas = agruparClasesConsecutivas(clasesEnAula);
    clase = agrupadas.find((item) => normalizeHorario(item.horario) === horarioNormalizado);
    if (clase) {
      docenteDoc = normalizarDocumento(clase.numero_documento);
    }
  } else {
    const clases = await programacionRepository.findByDia(diaActual);
    const clasesEnAula = (clases || []).filter(
      (item) => normalizarDocumento(item.numero_documento) === documento
        && normalizeAula(item.aula) === aulaNormalizada
    );
    const agrupadas = agruparClasesConsecutivas(clasesEnAula);
    clase = agrupadas.find((item) => normalizeHorario(item.horario) === horarioNormalizado);

    // Buscar en reservas semestrales si no se encontró en programación
    if (!clase) {
      const reservasHoy = await reservasSemestralesRepository.findByDia(diaActual, new Date());
      const reserva = (reservasHoy || []).find(
        (r) => normalizarDocumento(r.numero_documento) === docenteDoc
          && normalizeAula(r.aula) === aulaNormalizada
          && normalizeHorario(r.horario) === horarioNormalizado
      );
      if (reserva) clase = reservaSemestralToClase(reserva);
    }
  }

  return { clase, docenteDoc };
}

module.exports = {
  buscarPersonaPorCarnet,
  resolverContextoNFC,
  buscarClaseParaConfirmacion,
};
