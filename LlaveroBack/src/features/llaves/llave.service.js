'use strict';
const llaveRepository = require('./llave.repository');
const comunidadRepository = require('../comunidad/comunidad.repository');
const salonRepository = require('../salones/salon.repository');
const porterosService = require('../porteros/porteros.service');
const ApiError = require('../../shared/errors/api.error');
const { ROLES } = require('../auth/auth.constants');
const { normalizeKey } = require('../../shared/utils/normalize.helper');
const { createLogger } = require('../../shared/utils/logger');
const {
  buscarPersonaPorCarnet,
  resolverContextoNFC,
  buscarClaseParaConfirmacion,
} = require('./llave.context');
const {
  obtenerHistorialFormateado,
  formatearPendientes,
} = require('./llave.read-model');
const { createLlaveWorkflows } = require('./llave.workflows');
const {
  validarEntregaManual,
  normalizarOrigenRegistro,
  persistirPrestamo,
  persistirDevolucion,
} = require('./llave.write-model');
const { generateExcel } = require('../../shared/utils/excel.parser');
const { getFechaHoy } = require('../../shared/utils/date.helper');
const {
  construirClasesProcesadas,
  toClientFormat,
} = require('./llave.domain');
const {
  UBICACIONES: { OFICINA: UBICACION_OFICINA },
  OPERACIONES_UBICACION,
} = require('../../shared/constants/nfc.constants');
const reservaRepository = require('../reservas/reserva.repository');

const LIMITE_HORAS_DEMORA = 4;
const logger = createLogger('Llaves');

function toPlain(record) {
  return typeof record?.toObject === 'function' ? record.toObject() : record;
}

function formatRegistroLlave(registro) {
  return toClientFormat(registro, LIMITE_HORAS_DEMORA);
}

/**
 * Ya NO autoriza la operación contra `ubicaciones_operativas` (ver
 * `verificarPermisoLlave`, que reemplaza ese gate por rol+bloque) — solo
 * normaliza la clave de ubicación para el snapshot histórico
 * (`ubicacion_prestamo`/`ubicacion_devolucion`), que sigue existiendo por
 * compatibilidad aunque ya no se valide.
 * @param {string} _operacion - sin uso, se mantiene por compatibilidad de firma
 * @param {string} [ubicacion]
 */
async function normalizarUbicacion(_operacion, ubicacion = UBICACION_OFICINA) {
  return normalizeKey(ubicacion) || UBICACION_OFICINA;
}

/**
 * Gate de autorización por rol para operaciones de llaves. Reemplaza la
 * validación anterior (`ubicacionService.validarOperacion` sobre la `clave`
 * de `ubicaciones_operativas` elegida libremente en el payload del
 * request): admin/aux mantienen acceso total sin restricción (mismo
 * comportamiento de siempre); portería solo puede operar sobre el bloque al
 * que el salón de la llave pertenece, según sus permisos en
 * `portero_bloques`.
 * @param {{sub:string, rol:string}} user - `req.user`
 * @param {{salonId?:string, salonNombre?:string}} salonRef - uno de los dos, lo que ya se conozca en ese punto del flujo
 * @param {string} operacion - una de OPERACIONES_UBICACION
 */
async function verificarPermisoLlave(user, { salonId, salonNombre } = {}, operacion) {
  if (!user) throw ApiError.unauthorized('No autenticado');
  if (user.rol === ROLES.ADMIN || user.rol === ROLES.AUX) return;

  if (user.rol !== ROLES.PORTERIA) {
    throw ApiError.forbidden('Rol no autorizado para esta operación');
  }

  const salon = salonId
    ? await salonRepository.findById(salonId)
    : (salonNombre ? await salonRepository.findByNombre(salonNombre) : null);
  const bloqueId = salon?.bloque_id;

  if (!bloqueId) {
    throw ApiError.forbidden('No se pudo determinar el bloque del salón para validar el permiso de portería');
  }

  const permitido = await porterosService.tienePermiso(user.sub, bloqueId, operacion);
  if (!permitido) {
    throw ApiError.forbidden('No tiene permiso de portería para esta operación en este bloque');
  }
}

class LlaveService {
  constructor() {
    this.workflows = createLlaveWorkflows({
      buscarPersonaPorCarnet,
      resolverContextoNFC,
      buscarClaseParaConfirmacion,
      findPendienteByDocumento: (documento) => llaveRepository.findPendienteByDocumento(documento),
      findRegistroById: (id) => llaveRepository.findById(id),
      findReservaPendienteNFCByDocumento: (documento, now) => reservaRepository.findReservaPendienteNFCByDocumento(documento, now),
      findReservaById: (id) => reservaRepository.findById(id),
      marcarReservaCheckinNFC: (payload) => reservaRepository.marcarCheckinNFC(payload),
      findDocenteByDocumento: (documento) => comunidadRepository.findByDocumento(documento),
      createRegistro: (registro) => llaveRepository.create(registro),
      normalizarUbicacionPrestamo: (loc) => normalizarUbicacion(OPERACIONES_UBICACION.PRESTAMO_LLAVES, loc),
      normalizarUbicacionDevolucion: (loc) => normalizarUbicacion(OPERACIONES_UBICACION.DEVOLUCION_LLAVES, loc),
      persistirPrestamo: (payload) => persistirPrestamo({
        llaveRepository,
        ...payload,
        toClientFormat: formatRegistroLlave,
        toPlain,
      }),
      persistirDevolucion: (registro, entregaInfo = {}) => persistirDevolucion({
        llaveRepository,
        registro,
        entregaInfo,
        ubicacionPorDefecto: UBICACION_OFICINA,
        gestionadoPorUsuarioId: entregaInfo.gestionadoPorUsuarioId,
        toClientFormat: formatRegistroLlave,
        toPlain,
      }),
      verificarPermiso: verificarPermisoLlave,
      validarEntregaManual,
      normalizarOrigenRegistro,
    });
  }

  async #enriquecerConCorreos(pendientes) {
    const documentos = [...new Set(pendientes.map((p) => p.documento).filter(Boolean))];
    const correoMap = new Map();
    for (const doc of documentos) {
      const docente = await comunidadRepository.findByDocumento(doc);
      if (docente?.correo) correoMap.set(doc, docente.correo);
    }
    return pendientes.map((p) => ({ ...p, correo: correoMap.get(p.documento) || '' }));
  }

  async #enriquecerConDatosReclama(registros) {
    const documentos = [...new Set(registros.map((r) => r.documentoReclama).filter(Boolean))];
    if (!documentos.length) return registros;
    const personas = await comunidadRepository.findManyByDocumentos(documentos);
    const map = new Map(personas.map((p) => [p.numero_documento, p]));
    return registros.map((r) => {
      const persona = map.get(r.documentoReclama);
      return {
        ...r,
        correoReclama: persona?.correo || '',
        numeroContactoReclama: persona?.numero_contacto || '',
      };
    });
  }

  async obtenerPendientes() {
    const raw = await llaveRepository.findPendientes();
    const pendientes = await formatearPendientes(raw, formatRegistroLlave);
    return this.#enriquecerConCorreos(pendientes);
  }

  async obtenerTodosPendientes() {
    const raw = await llaveRepository.findPendientes();
    return this.#enriquecerConCorreos(raw.map(formatRegistroLlave));
  }

  async obtenerPendientesHoy() {
    const raw = await llaveRepository.findPendientesByFecha(getFechaHoy());
    return formatearPendientes(raw, formatRegistroLlave);
  }

  async obtenerHistorial(filters = {}, pagination = null) {
    const resultado = await obtenerHistorialFormateado(filters, pagination, formatRegistroLlave);
    if (pagination) {
      return { ...resultado, data: await this.#enriquecerConDatosReclama(resultado.data) };
    }
    return this.#enriquecerConDatosReclama(Array.isArray(resultado) ? resultado : resultado.data || resultado);
  }

  async obtenerClasesProcesadasHoy() {
    const registros = await llaveRepository.findByFecha(getFechaHoy());
    return construirClasesProcesadas(registros);
  }

  async procesarLecturaNFC(idCarnet, ubicacion = UBICACION_OFICINA, user = null) {
    logger.info('Procesando lectura NFC', { idCarnet, ubicacion });
    return this.workflows.procesarLecturaNFC(idCarnet, ubicacion, user);
  }

  async confirmarPrestamoAnticipado(payload, user = null) {
    return this.workflows.confirmarPrestamoAnticipado({
      ...payload,
      ubicacion: payload?.ubicacion || UBICACION_OFICINA,
      user,
    });
  }

  async registrarEntrega(infoClase, user = null) {
    logger.info('Registrando entrega manual de llave', { salon: infoClase?.salon });
    return this.workflows.registrarEntrega(
      infoClase,
      (record) => formatRegistroLlave(toPlain(record)),
      user,
    );
  }

  async registrarDevolucion(documento, ubicacion = UBICACION_OFICINA, user = null) {
    logger.info('Registrando devolución de llave', { documento, ubicacion });
    return this.workflows.registrarDevolucion(documento, ubicacion, user);
  }

  async registrarDevolucionPorId(registroId, ubicacion = UBICACION_OFICINA, user = null) {
    logger.info('Registrando devolución de llave por ID', { registroId, ubicacion });
    return this.workflows.registrarDevolucionPorId(registroId, ubicacion, user);
  }

  async exportarHistorial(filters = {}) {
    logger.info('Exportando historial de llaves', filters);
    const result = await llaveRepository.findHistorial(filters);
    const registros = (result.data || result).map((registro) => formatRegistroLlave(registro));
    return generateExcel(registros, 'Historial Llaves');
  }
}

module.exports = new LlaveService();