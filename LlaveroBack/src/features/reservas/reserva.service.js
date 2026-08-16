'use strict';
const reservaRepository = require('./reserva.repository');
const comunidadRepository = require('../comunidad/comunidad.repository');
const llaveRepository = require('../llaves/llave.repository');
const salonRepository = require('../salones/salon.repository');
const {
  UBICACIONES: { OFICINA: UBICACION_OFICINA },
} = require('../../shared/constants/nfc.constants');
const { createLogger } = require('../../shared/utils/logger');

/**
 * Fase S6 de la migración Mongo → Postgres — PRIORIDAD MÁXIMA (ver
 * apply-progress S4/S5): antes de esta fase, `crear()` escribía la llave
 * entregada directo al modelo Mongoose `Llave` mientras `registros_llaves`
 * ya vivía en Postgres desde S4 — split-brain de escritura real. Ahora toda
 * llave se crea/actualiza vía `llaveRepository` (Postgres). También se deja
 * de leer `programacion`/`Salon` Mongoose directo: los conflictos de
 * horario contra programación académica/semestral usan
 * `reservaRepository.findClasesRegulares`/`findClasesSemestrales`
 * (Postgres, JOIN a `programacion_semestres` porque S3 movió
 * `fecha_inicio_semestre`/`fecha_fin_semestre` fuera de la fila base).
 */

const DIAS_ES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const ZONA_HORARIA_APP = 'America/Bogota';

const logger = createLogger('Reservas');

const SLOTS = [];
for (let h = 6; h <= 23; h++) {
  SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

/** Convierte "H:MM"/"HH:MM"/"HH:MM:SS" a minutos. Evita bugs de comparación lexicográfica. */
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

class ReservaService {
  async _buscarConflictos(datos) {
    const conflictos = [];

    // Conflictos con otras reservas
    const resConflictos = await reservaRepository.findConflictos(
      datos.nombre_salon,
      datos.fecha,
      datos.hora_inicio,
      datos.hora_fin
    );
    resConflictos.forEach((c) =>
      conflictos.push({ tipo: 'reserva', detalle: `${c.solicitante_nombre || 'Reserva'} (${c.hora_inicio}-${c.hora_fin})`, data: c })
    );

    // Conflictos con programación académica y semestrales
    const fechaObj = new Date(`${datos.fecha}T12:00:00`);
    const diaNombre = DIAS_ES[fechaObj.getDay()];

    const progSalon = await reservaRepository.findClasesRegulares(datos.nombre_salon, diaNombre, datos.fecha);
    for (const p of progSalon) {
      if (p.hora_inicio && p.hora_fin) {
        if (toMin(p.hora_inicio) < toMin(datos.hora_fin) && toMin(p.hora_fin) > toMin(datos.hora_inicio)) {
          conflictos.push({
            tipo: 'programacion',
            detalle: `${p.docente_nombre || 'Docente'} — ${p.materia || ''} (${p.hora_inicio}-${p.hora_fin})`,
            data: p,
          });
        }
      }
    }

    const semestrales = await reservaRepository.findClasesSemestrales(datos.nombre_salon, diaNombre, datos.fecha);
    for (const s of semestrales) {
      if (s.hora_inicio && s.hora_fin && toMin(s.hora_inicio) < toMin(datos.hora_fin) && toMin(s.hora_fin) > toMin(datos.hora_inicio)) {
        conflictos.push({
          tipo: 'semestral',
          detalle: `${s.docente_nombre || 'Docente'} — ${s.materia || ''} (${s.hora_inicio}-${s.hora_fin})`,
          data: s,
        });
      }
    }

    return conflictos;
  }

  async validar(datos) {
    const conflictos = await this._buscarConflictos(datos);
    return { tiene_conflictos: conflictos.length > 0, conflictos };
  }

  async crear(datos) {
    if (toMin(datos.hora_fin) <= toMin(datos.hora_inicio)) {
      const ApiError = require('../../shared/errors/api.error');
      throw ApiError.badRequest('La hora de fin debe ser posterior a la hora de inicio');
    }
    if (!datos.forzar) {
      const conflictos = await this._buscarConflictos(datos);
      if (conflictos.length > 0) {
        const ApiError = require('../../shared/errors/api.error');
        const primero = conflictos[0];
        throw ApiError.conflict(
          primero.tipo === 'programacion'
            ? `Conflicto con programación académica: ${primero.detalle}`
            : `Ya existe una reserva en ese horario para ese salón: ${primero.detalle}`
        );
      }
    }

    const reserva = await reservaRepository.create(datos);
    logger.info('Reserva creada', { id: reserva.id, salon: datos.nombre_salon, fecha: datos.fecha });

    if (datos.entregar_llave !== false) {
      const fechaObj = new Date(`${datos.fecha}T12:00:00`);
      const dia = DIAS_ES[fechaObj.getDay()] || '';
      const ahora = new Date();
      const responsableEsValido = datos.tipo_solicitante === 'estudiante'
        && String(datos.responsable_documento || '').trim()
        && String(datos.responsable_nombre || '').trim();
      const documentoReclama = responsableEsValido ? datos.responsable_documento : datos.solicitante_documento;
      const nombreReclama = responsableEsValido ? datos.responsable_nombre : datos.solicitante_nombre;
      const quienReclama = responsableEsValido ? 'docente' : (datos.tipo_solicitante === 'estudiante' ? 'monitor' : 'docente');

      const prestamo = await llaveRepository.create({
        numero_documento: datos.solicitante_documento,
        docente: datos.solicitante_nombre,
        aula: datos.nombre_salon,
        horario: `${datos.hora_inicio} A ${datos.hora_fin}`,
        dia,
        fecha_hora_entrega: ahora,
        se_reclamo_a_tiempo: true,
        estado: 'en_prestamo',
        tipo_entrega: 'manual',
        origen_registro: 'individual',
        ubicacion_prestamo: UBICACION_OFICINA,
        quien_reclama: quienReclama,
        numero_documento_reclama: documentoReclama,
        nombre_reclama: nombreReclama,
      });
      await reservaRepository.updateById(reserva.id, {
        llave_entregada: true,
        registro_llave_id: prestamo.id,
        checkin_estado: 'entregado_oficina',
        checkin_canal: 'oficina',
        checkin_at: new Date(),
      });
      logger.info('Llave entregada al crear reserva', { salon: datos.nombre_salon });
    } else {
      await reservaRepository.updateById(reserva.id, {
        checkin_estado: 'pendiente_nfc',
      });
    }

    return reserva;
  }

  async sincronizarEstadosVencidos() {
    const now = new Date();
    const hoy = now.toLocaleDateString('en-CA', {
      timeZone: ZONA_HORARIA_APP,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const horaActual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    await this._bulkCompletarVencidas(hoy, horaActual);
  }

  /**
   * Reemplaza `reservaRepository.bulkCompletarVencidas` (Mongo): la lógica
   * ahora vive en el servicio porque necesita orquestar `llaveRepository` +
   * `notificacionRepository` + `comunidadRepository` (Postgres, todos S6),
   * en vez de requerir esos modelos Mongoose inline como hacía el
   * repositorio original.
   */
  async _bulkCompletarVencidas(fechaHoy, horaActual) {
    const notificacionRepository = require('../notificaciones/notificacion.repository');
    const configuracionService = require('../configuracion/configuracion.service');

    const candidatas = await reservaRepository.findActivas();
    const actualMin = toMin(horaActual);

    const vencidas = candidatas.filter((reserva) => {
      const fechaReserva = reserva.fecha;
      const inicioMin = toMin(reserva.hora_inicio);
      const finMin = toMin(reserva.hora_fin);

      // Reserva que cruza medianoche (hora_fin <= hora_inicio): la fecha real de cierre es el día siguiente
      if (finMin <= inicioMin) {
        const d = new Date(`${fechaReserva}T12:00:00`);
        d.setDate(d.getDate() + 1);
        const fechaCierre = d.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA_APP, year: 'numeric', month: '2-digit', day: '2-digit' });
        return fechaCierre < fechaHoy || (fechaCierre === fechaHoy && actualMin >= finMin);
      }

      return fechaReserva < fechaHoy || (fechaReserva === fechaHoy && actualMin >= finMin);
    });

    for (const reserva of vencidas) {
      let nuevoEstado;
      let nextCheckinEstado = reserva.checkin_estado || (reserva.entregar_llave === false ? 'pendiente_nfc' : 'entregado_oficina');

      if (reserva.llave_entregada) {
        nuevoEstado = 'completada';
      } else if (reserva.entregar_llave === false) {
        let llave = null;

        if (reserva.registro_llave_id) {
          llave = await llaveRepository.findById(reserva.registro_llave_id);
        }

        // Compatibilidad hacia atrás para reservas históricas sin enlace directo.
        // Rango del día en ZONA_HORARIA_APP (offset fijo -05:00, sin DST) —
        // no depender de la hora local del servidor, igual que
        // `sincronizarEstadosVencidos`/`findReservaPendienteNFCByDocumento`.
        if (!llave) {
          const diaStart = new Date(`${reserva.fecha}T00:00:00-05:00`);
          const diaEnd = new Date(`${reserva.fecha}T23:59:59.999-05:00`);
          llave = await llaveRepository.findUltimaByAulaDocumentoFecha(
            reserva.nombre_salon, reserva.solicitante_documento, diaStart, diaEnd
          );
        }

        nuevoEstado = llave ? 'completada' : 'no_reclamada';
        if (llave) {
          if (nextCheckinEstado === 'pendiente_nfc') {
            nextCheckinEstado = 'nfc_en_tiempo';
          }
        } else {
          nextCheckinEstado = 'no_show';
        }
      } else {
        nuevoEstado = 'no_reclamada';
        nextCheckinEstado = 'no_show';
      }

      await reservaRepository.updateById(reserva.id, {
        estado: nuevoEstado,
        checkin_estado: nextCheckinEstado,
      });

      if (nuevoEstado === 'no_reclamada') {
        try {
          const bloque = reserva.nombre_bloque || '';
          const config = await configuracionService.obtenerPorBloque(bloque);
          if (!config.notificaciones_activas) continue;

          const persona = await comunidadRepository.findByDocumento(reserva.solicitante_documento);
          if (!persona?.correo) continue;

          const fechaStr = new Date(`${reserva.fecha}T12:00:00`).toLocaleDateString('es-CO', {
            timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric',
          });

          // Dedupe: `ux_notificaciones_dedupe_reserva` (partial unique en
          // reserva_id+tipo_notificacion) rechaza el insert con 23505 si ya
          // existe una notificación de este tipo para la reserva — mismo
          // efecto que el `$setOnInsert`+`upsert:true` de Mongo, sin
          // necesidad de un lookup previo.
          await notificacionRepository.create({
            destinatario_nombre: reserva.solicitante_nombre,
            destinatario_documento: reserva.solicitante_documento,
            destinatario_correo: persona.correo,
            numero_contacto_destinatario: persona.numero_contacto || '',
            tipo_mensaje: 'predeterminado',
            asunto: 'Reserva finalizada — Llave no reclamada - Llavero',
            salon: reserva.nombre_salon,
            tipo_notificacion: 'reserva_no_reclamada',
            estado_envio: 'pendiente',
            enviado_por: 'sistema',
            fecha_envio: new Date(),
            reserva_id: reserva.id,
            reserva_fecha: fechaStr,
            reserva_hora_inicio: reserva.hora_inicio,
            reserva_hora_fin: reserva.hora_fin,
          });
        } catch (_) {
          // no bloquear el flujo principal si falla la notificación (incluye
          // 23505 de duplicado, comportamiento esperado)
        }
      }
    }
  }

  async listar(filters, pagination) {
    await this.sincronizarEstadosVencidos();
    const resultado = await reservaRepository.findHistorial(filters, pagination);

    // Enriquecer con correo de comunidad cuando se listan reservas no reclamadas
    if (filters?.estado === 'no_reclamada') {
      const reservas = Array.isArray(resultado) ? resultado : (resultado?.reservas ?? resultado?.data ?? []);
      const documentos = [...new Set(reservas.map((r) => r.solicitante_documento).filter(Boolean))];
      if (documentos.length) {
        const personas = await comunidadRepository.findManyByDocumentos(documentos);
        const correoMap = new Map(personas.map((p) => [p.numero_documento, p.correo]));
        const enriquecidas = reservas.map((r) => ({
          ...r,
          solicitante_correo: correoMap.get(r.solicitante_documento) || '',
        }));
        if (Array.isArray(resultado)) return enriquecidas;
        return { ...resultado, reservas: enriquecidas, data: enriquecidas };
      }
    }

    return resultado;
  }

  async aprobar(id, aprobadoPor, aprobadoPorUsuarioId) {
    const reserva = await this._obtener(id);
    if (reserva.estado !== 'pendiente') {
      const ApiError = require('../../shared/errors/api.error');
      throw ApiError.badRequest(`No se puede aprobar una reserva en estado "${reserva.estado}"`);
    }
    return reservaRepository.updateById(id, {
      estado: 'aprobada',
      aprobado_por: aprobadoPor,
      aprobado_por_usuario_id: aprobadoPorUsuarioId || null,
    });
  }

  async rechazar(id, aprobadoPor, aprobadoPorUsuarioId) {
    const reserva = await this._obtener(id);
    if (reserva.estado !== 'pendiente') {
      const ApiError = require('../../shared/errors/api.error');
      throw ApiError.badRequest(`No se puede rechazar una reserva en estado "${reserva.estado}"`);
    }
    return reservaRepository.updateById(id, {
      estado: 'rechazada',
      aprobado_por: aprobadoPor,
      aprobado_por_usuario_id: aprobadoPorUsuarioId || null,
    });
  }

  async cancelar(id) {
    const reserva = await this._obtener(id);
    if (!['pendiente', 'aprobada'].includes(reserva.estado)) {
      const ApiError = require('../../shared/errors/api.error');
      throw ApiError.badRequest(`No se puede cancelar una reserva en estado "${reserva.estado}"`);
    }

    const fechaHoraFin = this._fechaHoraFinReserva(reserva);
    if (!fechaHoraFin || new Date() >= fechaHoraFin) {
      const ApiError = require('../../shared/errors/api.error');
      throw ApiError.badRequest('Solo se puede cancelar una reserva antes de su hora de fin');
    }

    let devolucionAutomaticaRegistrada = false;
    if (reserva.llave_entregada) {
      devolucionAutomaticaRegistrada = await this._registrarDevolucionAutomaticaPorCancelacion(reserva);
    }

    const actualizada = await reservaRepository.updateById(id, { estado: 'cancelada' });
    return {
      ...actualizada,
      devolucion_automatica_registrada: devolucionAutomaticaRegistrada,
    };
  }

  async editar(id, datos) {
    const ApiError = require('../../shared/errors/api.error');
    const reserva = await this._obtener(id);

    if (!['pendiente', 'aprobada'].includes(reserva.estado)) {
      throw ApiError.badRequest(`No se puede editar una reserva en estado "${reserva.estado}"`);
    }

    const fechaHoraFin = this._fechaHoraFinReserva(reserva);
    const now = new Date();

    if (!fechaHoraFin || now >= fechaHoraFin) {
      throw ApiError.badRequest('La reserva ya ha finalizado y no puede ser editada');
    }

    // Effective values: new data takes precedence over existing reservation values
    const nuevoSalon = datos.nombre_salon || reserva.nombre_salon;
    const nuevaFechaStr = datos.fecha || reserva.fecha;
    const nuevoHoraInicio = datos.hora_inicio || reserva.hora_inicio;
    const nuevoHoraFin = datos.hora_fin || reserva.hora_fin;

    if (toMin(nuevoHoraFin) <= toMin(nuevoHoraInicio)) {
      throw ApiError.badRequest('La hora de fin debe ser posterior a la hora de inicio');
    }

    const nuevaFechaFin = new Date(`${nuevaFechaStr}T${nuevoHoraFin}:00`);
    if (!nuevaFechaFin || Number.isNaN(nuevaFechaFin.getTime()) || nuevaFechaFin <= now) {
      throw ApiError.badRequest('La nueva hora de fin no puede estar en el pasado');
    }

    if (!datos.forzar) {
      const conflictosReserva = await reservaRepository.findConflictos(
        nuevoSalon, nuevaFechaStr, nuevoHoraInicio, nuevoHoraFin, id
      );
      if (conflictosReserva.length > 0) {
        const c = conflictosReserva[0];
        const quien = c.solicitante_nombre || 'otro solicitante';
        const motivo = c.motivo ? ` — motivo: «${c.motivo}»` : '';
        throw ApiError.conflict(`Conflicto con reserva de ${quien}${motivo} — ${c.hora_inicio}–${c.hora_fin}`);
      }

      // También verificar cruces con programación académica y semestral
      const fechaObjEdit = new Date(`${nuevaFechaStr}T12:00:00`);
      const diaNombreEdit = DIAS_ES[fechaObjEdit.getDay()];
      const [progAcademicaEdit, progSemestralEdit] = await Promise.all([
        reservaRepository.findClasesRegulares(nuevoSalon, diaNombreEdit, nuevaFechaStr),
        reservaRepository.findClasesSemestrales(nuevoSalon, diaNombreEdit, nuevaFechaStr),
      ]);
      const cruceClase = [...progAcademicaEdit, ...progSemestralEdit].find(
        (p) => p.hora_inicio && p.hora_fin
          && toMin(p.hora_inicio) < toMin(nuevoHoraFin)
          && toMin(p.hora_fin) > toMin(nuevoHoraInicio)
      );
      if (cruceClase) {
        const tipo = cruceClase.tipo === 'semestral' ? 'clase semestral' : 'clase programada';
        const materia = cruceClase.materia || '';
        const docente = cruceClase.docente_nombre || '';
        const detallClase = [materia, docente].filter(Boolean).join(' — ');
        const detallMsg = detallClase ? ` «${detallClase}»` : '';
        throw ApiError.conflict(`Conflicto con ${tipo}${detallMsg} — ${cruceClase.hora_inicio}–${cruceClase.hora_fin}`);
      }
    }

    const updates = {};
    if (datos.nombre_bloque !== undefined) updates.nombre_bloque = datos.nombre_bloque;
    if (datos.nombre_salon !== undefined) updates.nombre_salon = datos.nombre_salon;
    if (datos.fecha !== undefined) updates.fecha = datos.fecha;
    if (datos.hora_inicio !== undefined) updates.hora_inicio = datos.hora_inicio;
    if (datos.hora_fin !== undefined) updates.hora_fin = datos.hora_fin;
    if (datos.motivo !== undefined) updates.motivo = datos.motivo;

    const reservaActualizada = await reservaRepository.updateById(id, updates);
    logger.info('Reserva editada', { id, updates });
    return reservaActualizada;
  }

  async disponibilidad(nombre_salon, fecha) {
    const reservas = await reservaRepository.findBySalonYFecha(nombre_salon, fecha);

    // Obtener programación académica y semestral para ese día
    const fechaObj = new Date(`${fecha}T12:00:00`);
    const diaNombre = DIAS_ES[fechaObj.getDay()];

    const [progAcademica, progSemestral] = await Promise.all([
      reservaRepository.findClasesRegulares(nombre_salon, diaNombre, fecha),
      reservaRepository.findClasesSemestrales(nombre_salon, diaNombre, fecha),
    ]);

    // Generar la lista de slots con su estado
    const slots = SLOTS.map((slot) => {
      const nextSlot = this._nextSlot(slot);
      const slotMin = toMin(slot);
      const nextMin = toMin(nextSlot);

      // Verificar si está ocupado por reserva normal (se calcula antes para reserva_solapada)
      const resConflicto = reservas.find((r) =>
        toMin(r.hora_inicio) < nextMin && toMin(r.hora_fin) > slotMin
      );

      // Verificar si está ocupado por programación académica
      const progConflicto = progAcademica.find((p) =>
        p.hora_inicio && p.hora_fin && toMin(p.hora_inicio) < nextMin && toMin(p.hora_fin) > slotMin
      );
      const reservaDetalle = resConflicto
        ? [resConflicto.solicitante_nombre, resConflicto.motivo].filter(Boolean).join(' — ') || 'Reserva'
        : undefined;

      if (progConflicto) {
        return {
          hora: slot, disponible: false, motivo: 'programacion',
          detalle: [progConflicto.docente_nombre, progConflicto.materia].filter(Boolean).join(' — ') || 'Clase programada',
          ...(resConflicto ? { reserva_solapada: true, reserva_detalle: reservaDetalle } : {}),
        };
      }

      // Verificar si está ocupado por reserva semestral
      const semConflicto = progSemestral.find((s) =>
        s.hora_inicio && s.hora_fin && toMin(s.hora_inicio) < nextMin && toMin(s.hora_fin) > slotMin
      );
      if (semConflicto) {
        return {
          hora: slot, disponible: false, motivo: 'semestral',
          detalle: [semConflicto.docente_nombre, semConflicto.materia].filter(Boolean).join(' — ') || 'Reserva semestral',
          ...(resConflicto ? { reserva_solapada: true, reserva_detalle: reservaDetalle } : {}),
        };
      }

      if (resConflicto) {
        return {
          hora: slot, disponible: false, motivo: 'reserva',
          detalle: [resConflicto.solicitante_nombre, resConflicto.motivo].filter(Boolean).join(' — ') || 'Reserva',
        };
      }

      return { hora: slot, disponible: true };
    });

    return { nombre_salon, fecha, slots };
  }

  async disponibilidadSmart(nombre_salon, fecha) {
    const reservas = await reservaRepository.findBySalonYFecha(nombre_salon, fecha);

    const fechaObj = new Date(`${fecha}T12:00:00`);
    const diaNombre = DIAS_ES[fechaObj.getDay()];
    const progAcademica = await reservaRepository.findClasesRegulares(nombre_salon, diaNombre, fecha);

    // Check for an active key loan in this salon on this date — rango del
    // día en ZONA_HORARIA_APP (offset fijo -05:00, sin DST), no hora local
    // del servidor.
    const startOfDay = new Date(`${fecha}T00:00:00-05:00`);
    const endOfDay = new Date(`${fecha}T23:59:59.999-05:00`);
    const llaveActiva = await llaveRepository.findActivaByAulaFecha(nombre_salon, startOfDay, endOfDay);

    const slots = SLOTS.map((slot) => {
      const nextSlot = this._nextSlot(slot);
      const slotMin = toMin(slot);
      const nextMin = toMin(nextSlot);

      const progConflicto = progAcademica.find((p) =>
        p.hora_inicio && p.hora_fin && toMin(p.hora_inicio) < nextMin && toMin(p.hora_fin) > slotMin
      );
      if (progConflicto) {
        if (llaveActiva) {
          return { hora: slot, disponible: false, motivo: 'programacion_con_llave', detalle: 'Salón en uso — llave prestada' };
        }
        return { hora: slot, disponible: true, motivo: 'programacion_sin_llave', detalle: progConflicto.materia || 'Clase programada sin llave reclamada' };
      }

      const resConflicto = reservas.find((r) => toMin(r.hora_inicio) < nextMin && toMin(r.hora_fin) > slotMin);
      if (resConflicto) {
        return { hora: slot, disponible: false, motivo: 'reserva', detalle: resConflicto.solicitante_nombre };
      }

      return { hora: slot, disponible: true };
    });

    return { nombre_salon, fecha, slots };
  }

  async salonesDisponibles(fecha, hora_inicio, hora_fin) {
    const fechaObj = new Date(`${fecha}T12:00:00`);
    const diaNombre = DIAS_ES[fechaObj.getDay()];

    const ocupados = await reservaRepository.findAulasOcupadasOverlap(diaNombre, fecha, hora_inicio, hora_fin);

    const todos = await salonRepository.findAll();
    const ordenados = [...todos].sort((a, b) =>
      String(a.nombre_bloque || '').localeCompare(String(b.nombre_bloque || ''))
      || String(a.nombre_salon || '').localeCompare(String(b.nombre_salon || ''))
    );
    return ordenados.filter((s) => !ocupados.has(s.nombre_salon));
  }

  _nextSlot(slot) {
    const [h, m] = slot.split(':').map(Number);
    if (m === 0) return `${String(h).padStart(2, '0')}:30`;
    return `${String(h + 1).padStart(2, '0')}:00`;
  }

  _calcularDuracion(fechaInicio, fechaFin = new Date()) {
    const inicio = fechaInicio instanceof Date ? fechaInicio : new Date(fechaInicio);
    if (Number.isNaN(inicio.getTime())) return 0;

    const diffMs = Math.max(0, fechaFin - inicio);
    return Math.floor(diffMs / (1000 * 60));
  }

  async _registrarDevolucionAutomaticaPorCancelacion(reserva) {
    const ahora = new Date();

    let prestamo = null;
    if (reserva.registro_llave_id) {
      prestamo = await llaveRepository.findById(reserva.registro_llave_id);
    }

    if (!prestamo) {
      // Rango del día en ZONA_HORARIA_APP (offset fijo -05:00, sin DST) — no
      // depender de la hora local del servidor.
      const diaStart = new Date(`${reserva.fecha}T00:00:00-05:00`);
      const diaEnd = new Date(`${reserva.fecha}T23:59:59.999-05:00`);
      prestamo = await llaveRepository.findUltimaByAulaDocumentoFecha(
        reserva.nombre_salon, reserva.solicitante_documento, diaStart, diaEnd
      );
    }

    if (!prestamo) return false;
    if (prestamo.estado !== 'en_prestamo') return true;

    await llaveRepository.update(prestamo.id, {
      fecha_hora_devolucion: ahora,
      duracion_minutos: this._calcularDuracion(prestamo.fecha_hora_entrega, ahora),
      tiempo_retraso_devolucion_minutos: 0,
      retraso_entrega: false,
      estado: 'entregado',
      tipo_devolucion: 'manual',
      ubicacion_devolucion: UBICACION_OFICINA,
      quien_entrega: 'docente',
      numero_documento_entrega: reserva.solicitante_documento,
      nombre_entrega: reserva.solicitante_nombre,
    });

    return true;
  }

  _fechaHoraInicioReserva(reserva) {
    if (!reserva?.fecha || !reserva?.hora_inicio) return null;
    const fechaHora = new Date(`${reserva.fecha}T${String(reserva.hora_inicio).slice(0, 5)}:00`);
    return Number.isNaN(fechaHora.getTime()) ? null : fechaHora;
  }

  _fechaHoraFinReserva(reserva) {
    if (!reserva?.fecha || !reserva?.hora_fin) return null;
    const fechaHora = new Date(`${reserva.fecha}T${String(reserva.hora_fin).slice(0, 5)}:00`);
    return Number.isNaN(fechaHora.getTime()) ? null : fechaHora;
  }

  async _obtener(id) {
    const reserva = await reservaRepository.findById(id);
    if (!reserva) {
      const ApiError = require('../../shared/errors/api.error');
      throw ApiError.notFound('Reserva no encontrada');
    }
    return reserva;
  }
}

module.exports = new ReservaService();
