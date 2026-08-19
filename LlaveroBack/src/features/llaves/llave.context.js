'use strict';

const llaveRepository = require('./llave.repository');
const comunidadRepository = require('../comunidad/comunidad.repository');
const programacionRepository = require('../programacion/programacion.repository');
const monitorRepository = require('../monitores/monitor.repository');
const reservasSemestralesRepository = require('../reservas_semestrales/reservas_semestrales.repository');
const reservaRepository = require('../reservas/reserva.repository');
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

/** Placeholders del Excel de programación sin llave física real detrás. */
const AULAS_SIN_LLAVE = new Set(['NO REQUIERE AULA', 'PENDIENTE']);

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
 * Mapea una reserva individual en modo de reclamo diferido
 * (`entregar_llave: false`, aún `pendiente_nfc`, no reclamada) al mismo
 * formato de clase — mismo patrón que `reservaSemestralToClase`. Las
 * reservas individuales en modo de entrega inmediata (`entregar_llave: true`,
 * llave entregada en mostrador al crearse) no pasan por acá: esas no tienen
 * un momento de reclamo posterior que encadenar.
 * @param {object} reserva
 * @returns {object}
 */
function reservaIndividualToClase(reserva) {
  return {
    id: reserva.id,
    numero_documento: normalizarDocumento(reserva.solicitante_documento),
    dia: getDiaActual(),
    horario: `${reserva.hora_inicio} A ${reserva.hora_fin}`,
    hora_inicio: reserva.hora_inicio || '',
    hora_fin: reserva.hora_fin || '',
    aula: reserva.nombre_salon || '',
    facultad: 'Reserva Individual',
    materia: reserva.motivo || 'Reserva de salón',
    _origen: 'individual',
  };
}

/**
 * Trae y unifica, para un docente y fecha dados, todas las franjas de HOY en
 * las que podría necesitar la llave de un salón: clases regulares de
 * programación, reservas semestrales, y reservas individuales en modo de
 * reclamo diferido. Las tres se mapean a la misma forma de "clase" para que
 * `agruparClasesConsecutivas` pueda fusionar bloques consecutivos del mismo
 * docente+aula sin importar de qué sistema vino cada uno.
 * @param {string} documento
 * @param {string} diaActual - nombre del día (ej. "Lunes"), para programación/RS
 * @param {string} fecha - YYYY-MM-DD, para reservas individuales
 * @returns {Promise<object[]>}
 */
async function obtenerFranjasDelDiaDocente(documento, diaActual, fecha) {
  const [todasClases, reservasSemestralesHoy, reservasIndividualesHoy] = await Promise.all([
    programacionRepository.findByDia(diaActual),
    reservasSemestralesRepository.findByDia(diaActual, new Date()),
    reservaRepository.findPendientesNFCByDocumentoYFecha(documento, fecha),
  ]);

  // Las clases "NO REQUIERE AULA"/"PENDIENTE" no tienen llave física
  // asociada — ver nota en `resolverContextoNFC` (evita que
  // `encontrarClaseActual` prefiera un bloque sin aula real sobre la clase
  // física del docente). Las marcadas `sin_entrega_llave` (ej. clases del
  // Colegio Mauj, ver 020_programaciones_sin_entrega_llave.js) sí tienen
  // aula real pero son solo indicativas — no deben ofrecerse en el flujo
  // NFC de entrega/devolución.
  const clasesProgramacion = (todasClases || []).filter(
    (clase) => normalizarDocumento(clase.numero_documento) === documento
      && !AULAS_SIN_LLAVE.has(normalizeAula(clase.aula))
      && !clase.sin_entrega_llave
  );

  const clasesSemestrales = (reservasSemestralesHoy || [])
    .filter((r) => normalizarDocumento(r.numero_documento) === documento)
    .map(reservaSemestralToClase);

  const clasesIndividuales = (reservasIndividualesHoy || []).map(reservaIndividualToClase);

  return [...clasesProgramacion, ...clasesSemestrales, ...clasesIndividuales];
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
  const fechaHoy = getFechaHoy();
  const [franjasDelDia, registrosHoy] = await Promise.all([
    obtenerFranjasDelDiaDocente(documento, diaActual, fechaHoy),
    llaveRepository.findByFecha(fechaHoy),
  ]);

  if (franjasDelDia.length) {
    return resolverContextoDocente({ persona, documento, franjasDelDia, registrosHoy });
  }

  return resolverContextoMonitor({ persona, documento, registrosHoy });
}

/** Resuelve contexto cuando la persona es un docente con clases/reservas de hoy (programación, semestral o individual). */
async function resolverContextoDocente({ persona, documento, franjasDelDia = [], registrosHoy }) {
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

  // Unificar programación+RS+RI en un solo pase de agrupación permite que
  // `agruparClasesConsecutivas` fusione bloques consecutivos del mismo
  // docente+aula sin importar de qué sistema vino cada clase.
  const clasesDisponibles = agruparClasesConsecutivas(
    franjasDelDia.filter(
      (clase) => !horarioCubiertoPorPrestamo(String(clase.horario || '').trim(), horariosProcesados)
    )
  );

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
    // Unifica programación+RS+RI (mismo criterio que `resolverContextoDocente`)
    // para que una clase consecutiva con una reserva del mismo docente+aula
    // también se resuelva como bloque fusionado acá.
    const franjasDelDia = await obtenerFranjasDelDiaDocente(documento, diaActual, getFechaHoy());
    const clasesEnAula = franjasDelDia.filter((item) => normalizeAula(item.aula) === aulaNormalizada);
    const agrupadas = agruparClasesConsecutivas(clasesEnAula);
    clase = agrupadas.find((item) => normalizeHorario(item.horario) === horarioNormalizado);
  }

  return { clase, docenteDoc };
}

module.exports = {
  buscarPersonaPorCarnet,
  resolverContextoNFC,
  buscarClaseParaConfirmacion,
};
