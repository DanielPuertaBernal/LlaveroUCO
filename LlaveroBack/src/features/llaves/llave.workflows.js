'use strict';

const ApiError = require('../../shared/errors/api.error');
const { ROLES } = require('../auth/auth.constants');
const {
  OPERACIONES_UBICACION,
} = require('../../shared/constants/nfc.constants');
const {
  calcularTiempoRetrasoMinutos,
  esReclamoAnticipado,
} = require('../../shared/utils/date.helper');
const {
  normalizarDocumento,
  encontrarClaseActual,
  construirResultadoError,
  construirResultadoSinClase,
  construirResultadoAnticipado,
  construirResultadoPrestamo,
  construirResultadoDevolucion,
  construirRegistroEntregaManual,
} = require('./llave.domain');

/**
 * Crea los workflows de gestión de llaves inyectando dependencias.
 * @param {Object} deps - Repositorios y helpers inyectados
 * @returns {{ procesarLecturaNFC, confirmarPrestamoAnticipado, registrarEntrega, registrarDevolucion }}
 */
function createLlaveWorkflows({
  buscarPersonaPorCarnet,
  resolverContextoNFC,
  buscarClaseParaConfirmacion,
  findPendienteByDocumento,
  findRegistroById,
  findReservaPendienteNFCByDocumento,
  findReservaById,
  marcarReservaCheckinNFC,
  findDocenteByDocumento,
  createRegistro,
  normalizarUbicacionPrestamo,
  normalizarUbicacionDevolucion,
  persistirPrestamo,
  persistirDevolucion,
  verificarPermiso,
  validarEntregaManual,
  normalizarOrigenRegistro,
}) {
  /**
   * Regla de negocio: la devolución de una llave prestada por una portería
   * concreta (`registro.gestionado_por_usuario_id`) solo puede registrarla
   * esa misma portería (mismo `usuario_id` — cada cuenta portero es un
   * puesto físico fijo, no una persona individual). Otra portería, aunque
   * tenga permiso de devolución en el mismo bloque, debe ser rechazada.
   * Admin/aux no tienen esta restricción (acceso total, sin importar quién
   * prestó). IMPORTANTE: `gestionado_por_usuario_id` se guarda siempre que
   * hay un `user` (portería, admin o aux — ver `registrarEntrega`), así que
   * NO basta con mirar si el campo es NULL para saber si "fue portería": se
   * valida el ROL de quien gestionó (`registro.gestionado_por_rol`,
   * expuesto por el JOIN de `llave.repository.js._readQuery` contra
   * `usuarios`). Si el registro no viene de esa query (p. ej. un objeto
   * plano recién insertado sin ese join) o el gestor no era portería, o no
   * hay gestor, no se aplica ninguna restricción adicional — cualquier
   * portería con permiso de bloque puede devolverla (comportamiento previo).
   * @param {{sub:string, rol:string}} user
   * @param {object} registro - el préstamo activo que se va a devolver
   */
  function verificarMismaPorteria(user, registro) {
    if (!user || user.rol !== ROLES.PORTERIA) return;
    const gestorId = registro?.gestionado_por_usuario_id;
    if (!gestorId) return;
    if (registro?.gestionado_por_rol !== ROLES.PORTERIA) return;
    if (String(gestorId) !== String(user.sub)) {
      throw ApiError.forbidden('Esta llave fue entregada por otra portería; solo esa portería puede registrar la devolución');
    }
  }

  function construirClaseDesdeReserva(reserva) {
    return {
      aula: reserva.nombre_salon,
      horario: `${reserva.hora_inicio} A ${reserva.hora_fin}`,
      materia: reserva.motivo || 'Reserva de salón',
      facultad: 'Reserva',
      dia: reserva.nombre_bloque || '',
    };
  }

  function resolverEstadoCheckinReserva({ anticipado, tiempoRetraso }) {
    if (anticipado) return 'nfc_anticipado';
    if (tiempoRetraso) return 'nfc_retraso';
    return 'nfc_en_tiempo';
  }

  /** Procesa la devolución de una llave a partir del contexto NFC. */
  async function resolverResultadoDevolucion({ contexto, persona, documento, ubicacion, user }) {
    try {
      await verificarPermiso(
        user,
        { salonId: contexto.prestamoActivo?.salon_id },
        OPERACIONES_UBICACION.DEVOLUCION_LLAVES
      );
      verificarMismaPorteria(user, contexto.prestamoActivo);
      const ubicacionDevolucion = await normalizarUbicacionDevolucion(ubicacion);
      const result = await persistirDevolucion(contexto.prestamoActivo, {
        canal: 'carnet',
        quien: contexto.rol,
        documento,
        nombre: persona.nombre,
        ubicacion: ubicacionDevolucion,
        gestionadoPorUsuarioId: user?.sub || null,
      });

      return construirResultadoDevolucion({
        contexto,
        persona,
        result,
        ubicacion: ubicacionDevolucion,
      });
    } catch (err) {
      return construirResultadoError({ contexto, persona, mensaje: err.message });
    }
  }

  /** Resuelve el préstamo de llave: busca clase actual, valida anticipación y persiste. */
  async function resolverResultadoPrestamo({ contexto, persona, documento, ubicacion, user }) {
    let ubicacionPrestamo;
    try {
      ubicacionPrestamo = await normalizarUbicacionPrestamo(ubicacion);
    } catch (err) {
      return construirResultadoError({ contexto, persona, mensaje: err.message });
    }

    const ahora = new Date();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const claseTarget = encontrarClaseActual(contexto.clasesDisponibles, minutosAhora);
    const reservaPendiente = await findReservaPendienteNFCByDocumento(documento, ahora);

    if (!claseTarget && !reservaPendiente) {
      return construirResultadoSinClase({
        contexto,
        persona,
        mensaje: contexto.mensajeSinClase || 'No hay clases o reservas disponibles en el horario actual o próximo',
      });
    }

    // Regla de prioridad solicitada: si hay clase y reserva al tiempo, primero se procesa clase.
    if (!claseTarget && reservaPendiente) {
      const claseReserva = construirClaseDesdeReserva(reservaPendiente);
      const anticipado = esReclamoAnticipado(claseReserva.horario, ahora);
      const tiempoRetraso = calcularTiempoRetrasoMinutos(claseReserva.horario, ahora);
      const seReclamoATiempo = !tiempoRetraso;

      if (anticipado) {
        return {
          ...construirResultadoAnticipado({ contexto, persona, clase: claseReserva }),
          reserva: { id: String(reservaPendiente._id) },
        };
      }

      await verificarPermiso(user, { salonNombre: claseReserva.aula }, OPERACIONES_UBICACION.PRESTAMO_LLAVES);

      const registro = await persistirPrestamo({
        docente: {
          numero_documento: reservaPendiente.solicitante_documento,
          nombre: reservaPendiente.solicitante_nombre,
        },
        clase: claseReserva,
        seReclamoATiempo,
        tiempoRetraso,
        reclamaInfo: {
          quien: contexto.rol,
          documento,
          nombre: persona.nombre,
        },
        tipoEntrega: 'carnet',
        ubicacionPrestamo,
        origenRegistro: 'individual',
        gestionadoPorUsuarioId: user?.sub || null,
      });

      await marcarReservaCheckinNFC({
        reservaId: reservaPendiente._id,
        llavePrestamoId: registro.id,
        checkinEstado: resolverEstadoCheckinReserva({ anticipado: false, tiempoRetraso }),
        now: ahora,
      });

      return {
        ...construirResultadoPrestamo({
          contexto,
          persona,
          clase: claseReserva,
          registro,
          ubicacion: ubicacionPrestamo,
          seReclamoATiempo,
          tiempoRetraso,
        }),
        reserva: { id: String(reservaPendiente._id) },
      };
    }

    const anticipado = esReclamoAnticipado(claseTarget.horario, ahora);
    const tiempoRetraso = calcularTiempoRetrasoMinutos(claseTarget.horario, ahora);
    const seReclamoATiempo = !tiempoRetraso;

    if (anticipado) {
      return construirResultadoAnticipado({ contexto, persona, clase: claseTarget });
    }

    await verificarPermiso(user, { salonNombre: claseTarget.aula }, OPERACIONES_UBICACION.PRESTAMO_LLAVES);

    const registro = await persistirPrestamo({
      docente: contexto.docente,
      clase: claseTarget,
      seReclamoATiempo,
      tiempoRetraso,
      reclamaInfo: {
        quien: contexto.rol,
        documento,
        nombre: persona.nombre,
      },
      tipoEntrega: 'carnet',
      ubicacionPrestamo,
      origenRegistro: claseTarget._origen === 'reserva_semestral' ? 'reserva_semestral' : 'programacion',
      gestionadoPorUsuarioId: user?.sub || null,
    });

    return construirResultadoPrestamo({
      contexto,
      persona,
      clase: claseTarget,
      registro,
      ubicacion: ubicacionPrestamo,
      seReclamoATiempo,
      tiempoRetraso,
    });
  }

  /**
   * Punto de entrada principal: procesa una lectura NFC y decide si es préstamo o devolución.
   * @param {string} idCarnet - ID del carnet leído
   * @param {string} ubicacion - Ubicación del lector NFC
   * @returns {Promise<Object>} Resultado con tipo (prestamo|devolucion|error|sin_clase|anticipado)
   */
  async function procesarLecturaNFC(idCarnet, ubicacion, user = null) {
    const persona = await buscarPersonaPorCarnet(idCarnet);
    if (!persona) {
      return { tipo: 'error', mensaje: 'Persona no encontrada para este carnet' };
    }

    const documento = normalizarDocumento(persona.numero_documento);
    const contexto = await resolverContextoNFC(persona, documento);

    if (contexto.prestamoActivo) {
      return resolverResultadoDevolucion({ contexto, persona, documento, ubicacion, user });
    }

    // Múltiples préstamos activos: el docente debe elegir cuál devolver
    if (contexto.prestamosActivos && contexto.prestamosActivos.length > 1) {
      return {
        tipo: 'seleccion_devolucion',
        docente: persona,
        prestamosActivos: contexto.prestamosActivos,
        id_carnet: idCarnet,
        ubicacion,
      };
    }

    return resolverResultadoPrestamo({ contexto, persona, documento, ubicacion, user });
  }

  /** Confirma un préstamo que fue marcado como anticipado por el usuario. */
  async function confirmarPrestamoAnticipado({
    id_carnet,
    horario,
    aula,
    reserva_id,
    rol,
    documento_persona,
    nombre_persona,
    ubicacion,
    user,
  }) {
    const ubicacionPrestamo = await normalizarUbicacionPrestamo(ubicacion);
    const persona = await buscarPersonaPorCarnet(id_carnet);
    if (!persona) {
      throw ApiError.notFound('Persona no encontrada');
    }

    let clase;
    let docenteDoc;

    if (reserva_id) {
      const reserva = await findReservaById(reserva_id);
      if (!reserva) {
        throw ApiError.notFound('Reserva no encontrada para confirmar préstamo anticipado');
      }
      if (reserva.entregar_llave !== false) {
        throw ApiError.badRequest('La reserva seleccionada no requiere reclamación NFC');
      }
      if (reserva.llave_entregada) {
        throw ApiError.conflict('La llave de esta reserva ya fue entregada');
      }

      clase = construirClaseDesdeReserva(reserva);
      docenteDoc = normalizarDocumento(reserva.solicitante_documento);
    } else {
      const match = await buscarClaseParaConfirmacion({
        persona,
        aula,
        horario,
        rol,
      });
      clase = match.clase;
      docenteDoc = match.docenteDoc;
    }

    if (!clase) {
      throw ApiError.notFound('Clase no encontrada en la programación');
    }

    const existing = await findPendienteByDocumento(docenteDoc);
    if (existing) {
      // Ya no bloqueamos: el docente puede tener múltiples llaves
    }

    await verificarPermiso(user, { salonNombre: clase.aula }, OPERACIONES_UBICACION.PRESTAMO_LLAVES);

    const docente = await findDocenteByDocumento(docenteDoc);
    const registro = await persistirPrestamo({
      docente: docente || persona,
      clase,
      seReclamoATiempo: true,
      tiempoRetraso: '',
      reclamaInfo: {
        quien: rol || 'docente',
        documento: documento_persona || docenteDoc,
        nombre: nombre_persona || persona.nombre,
      },
      tipoEntrega: 'carnet',
      ubicacionPrestamo,
      origenRegistro: reserva_id ? 'individual' : (clase._origen || 'programacion'),
      gestionadoPorUsuarioId: user?.sub || null,
    });

    if (reserva_id) {
      await marcarReservaCheckinNFC({
        reservaId: reserva_id,
        llavePrestamoId: registro.id,
        checkinEstado: 'nfc_anticipado',
        now: new Date(),
      });
    }

    return {
      ok: true,
      mensaje: `Llave entregada a ${(docente || persona).nombre}`,
      registro,
      docente: docente || persona,
    };
  }

  /** Registra una entrega manual de llave (sin NFC). */
  async function registrarEntrega(infoClase, formatRegistro, user = null) {
    const ubicacionPrestamo = await normalizarUbicacionPrestamo(infoClase.ubicacion);
    const origenRegistro = normalizarOrigenRegistro(infoClase.origen);
    validarEntregaManual(infoClase);
    await verificarPermiso(user, { salonNombre: infoClase.aula }, OPERACIONES_UBICACION.PRESTAMO_LLAVES);

    const documento = normalizarDocumento(infoClase.nroidenti);

    const registro = construirRegistroEntregaManual({
      infoClase,
      documento,
      ubicacionPrestamo,
      origenRegistro,
      gestionadoPorUsuarioId: user?.sub || null,
    });

    // Fecha del día sin hora para el índice único de prevención de duplicados
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    registro.dia_entrega = hoy;

    let created;
    try {
      created = await createRegistro(registro);
    } catch (err) {
      // Postgres unique_violation (dedupe: comunidad_id + salon_id + dia_entrega)
      if (err.code === '23505') {
        throw ApiError.conflict('La llave de este salón ya está en préstamo hoy');
      }
      throw err;
    }

    return {
      ok: true,
      mensaje: `Llave entregada a ${infoClase.profesor}`,
      registro: formatRegistro(created),
    };
  }

  /** Registra una devolución manual de llave (sin NFC). */
  async function registrarDevolucion(documento, ubicacion, user = null) {
    const doc = normalizarDocumento(documento);
    const registro = await findPendienteByDocumento(doc);
    if (!registro) {
      throw ApiError.notFound('No se encontró llave en préstamo para este docente');
    }

    await verificarPermiso(user, { salonId: registro.salon_id }, OPERACIONES_UBICACION.DEVOLUCION_LLAVES);
    verificarMismaPorteria(user, registro);

    const ubicacionDevolucion = await normalizarUbicacionDevolucion(ubicacion);
    const result = await persistirDevolucion(registro, {
      canal: 'manual',
      ubicacion: ubicacionDevolucion,
      gestionadoPorUsuarioId: user?.sub || null,
    });
    return { ok: true, ...result };
  }

  /** Registra la devolución de una llave específica por su _id (cuando el docente tiene varias). */
  async function registrarDevolucionPorId(registroId, ubicacion, user = null) {
    const registro = await findRegistroById(registroId);
    if (!registro || !['en_prestamo', 'en_mora', 'demora_entrega'].includes(registro.estado)) {
      throw ApiError.notFound('No se encontró llave en préstamo con ese identificador');
    }

    await verificarPermiso(user, { salonId: registro.salon_id }, OPERACIONES_UBICACION.DEVOLUCION_LLAVES);
    verificarMismaPorteria(user, registro);

    const ubicacionDevolucion = await normalizarUbicacionDevolucion(ubicacion);
    const result = await persistirDevolucion(registro, {
      canal: 'nfc_seleccion',
      ubicacion: ubicacionDevolucion,
      gestionadoPorUsuarioId: user?.sub || null,
    });
    return { ok: true, ...result };
  }

  return {
    procesarLecturaNFC,
    confirmarPrestamoAnticipado,
    registrarEntrega,
    registrarDevolucion,
    registrarDevolucionPorId,
  };
}

module.exports = {
  createLlaveWorkflows,
};
