'use strict';
/**
 * Prestamo Service
 * Equivale a: application/services/prestamo_service.py
 *           + application/services/devolucion_service.py
 *
 * Fase S5 de la migración Mongo → Postgres: primer uso de un
 * `knex.transaction()` real de múltiples sentencias (header + líneas). El
 * código Mongo original no tenía transacciones reales en la base de datos
 * en ningún punto de la aplicación (ver hallazgo de la exploración); esta
 * fase introduce la primera.
 */
const pgClient = require('../../shared/db/pg.client');
const ApiError = require('../../shared/errors/api.error');
const { prestamoRepository, devolucionRepository } = require('./prestamo.repository');
const equipoRepository = require('../equipos/equipo.repository');
const comunidadRepository = require('../comunidad/comunidad.repository');
const ubicacionRepository = require('../ubicaciones/ubicacion.repository');
const porterosService = require('../porteros/porteros.service');
const { ROLES } = require('../auth/auth.constants');
const { normalizeKey } = require('../../shared/utils/normalize.helper');
const { createLogger } = require('../../shared/utils/logger');
const {
  OPERACIONES_UBICACION,
  UBICACIONES: { OFICINA: UBICACION_OFICINA },
} = require('../../shared/constants/nfc.constants');

const logger = createLogger('Prestamos');

/**
 * Gate de autorización por rol para PRÉSTAMO de equipos (crear un préstamo
 * nuevo o agregar un equipo a uno abierto). Regla de negocio: portería
 * nunca puede prestar equipos, sin importar los flags de `portero_bloques`
 * — solo puede recibirlos de vuelta (ver `verificarPermisoRecepcionEquipos`).
 * Solo admin/aux pueden prestar equipos.
 * @param {{sub:string, rol:string}} user
 */
async function verificarPermisoPrestamoEquipos(user) {
  if (!user) throw ApiError.unauthorized('No autenticado');
  if (user.rol === ROLES.ADMIN || user.rol === ROLES.AUX) return;

  throw ApiError.forbidden('La portería no puede prestar equipos, solo recibirlos');
}

/**
 * Gate de autorización por rol para RECEPCIÓN (devolución) de equipos.
 * Reemplaza la validación anterior contra `ubicaciones_operativas`. Los
 * equipos no están ligados a ningún salón/bloque en el modelo de datos
 * actual, así que a diferencia de las llaves (que sí se pueden acotar por
 * bloque del salón), portería solo puede tener este permiso habilitado o no
 * — si tiene el flag activo en al menos un bloque asignado, puede recibir
 * equipos sin más granularidad posible hoy.
 * @param {{sub:string, rol:string}} user
 */
async function verificarPermisoRecepcionEquipos(user) {
  if (!user) throw ApiError.unauthorized('No autenticado');
  if (user.rol === ROLES.ADMIN || user.rol === ROLES.AUX) return;

  if (user.rol !== ROLES.PORTERIA) {
    throw ApiError.forbidden('Rol no autorizado para esta operación');
  }

  const permitido = await porterosService.tienePermisoGlobal(user.sub, OPERACIONES_UBICACION.RECEPCION_EQUIPOS);
  if (!permitido) {
    throw ApiError.forbidden('No tiene permiso de portería para la recepción de equipos');
  }
}

class PrestamoService {
  async listar() { return prestamoRepository.findAll(); }
  async activos() { return prestamoRepository.findActivos(); }
  async porDocente(codigoNfc) { return prestamoRepository.findByDocente(codigoNfc); }

  async obtener(id) {
    const p = await prestamoRepository.findById(id);
    if (!p) throw ApiError.notFound('Préstamo no encontrado');
    return p;
  }

  /**
   * Crea un nuevo préstamo de equipos (o agrega equipos a uno ya abierto
   * del mismo docente). Equivale a PréstamoService.crear_prestamo (Python).
   *
   * Transacción: resolución de FKs de negocio (comunidad/ubicación) se lee
   * fuera de la transacción (son catálogos ya comprometidos, de solo
   * lectura); la creación/actualización de la cabecera `prestamos` y la
   * inserción de las líneas `prestamo_equipos` ocurren dentro del mismo
   * `knex.transaction()` — si la línea de un equipo falla (p. ej. FK a un
   * `equipo_id` inexistente), la cabecera tampoco queda persistida.
   * @param {object} datos
   */
  async crear({ docente_codigo_nfc, docente_nombre, solicitante_tipo = '', docente_responsable_codigo = '', docente_responsable_nombre = '', equipos, auxiliar_prestamista, ubicacion_prestamo = UBICACION_OFICINA }, user = null) {
    if (!equipos || !equipos.length) {
      throw ApiError.badRequest('Debe prestar al menos un equipo');
    }

    await verificarPermisoPrestamoEquipos(user);

    const ubicacionPrestamoClave = await this._validarUbicacionOperacion(
      ubicacion_prestamo,
      'La ubicación seleccionada no está autorizada para préstamos de equipos'
    );

    const equiposIds = this._normalizarEquipos(equipos);
    const knex = pgClient.getKnex();

    const prestamoId = await knex.transaction(async (trx) => {
      const equiposMap = await this._cargarEquiposDisponibles(equiposIds, trx);
      const prestamoAbierto = await prestamoRepository.findActivoByDocente(docente_codigo_nfc, trx);
      this._validarNoDuplicadosEnPrestamo(prestamoAbierto, equiposIds, equiposMap);

      let header;
      if (prestamoAbierto) {
        const ubicacion = await ubicacionRepository.findByClave(ubicacionPrestamoClave);
        header = await prestamoRepository.update(
          prestamoAbierto.id,
          {
            docente_nombre: docente_nombre || prestamoAbierto.docente_nombre,
            auxiliar_prestamista: auxiliar_prestamista || prestamoAbierto.auxiliar_prestamista || 'Auxiliar',
            ubicacion_prestamo_id: ubicacion ? ubicacion.id : null,
            gestionado_por_usuario_id: user?.sub || prestamoAbierto.gestionado_por_usuario_id || null,
          },
          trx
        );
      } else {
        const [docenteComunidad, responsableComunidad, ubicacion] = await Promise.all([
          docente_codigo_nfc ? comunidadRepository.findByDocumento(docente_codigo_nfc) : null,
          docente_responsable_codigo ? comunidadRepository.findByDocumento(docente_responsable_codigo) : null,
          ubicacionRepository.findByClave(ubicacionPrestamoClave),
        ]);
        header = await prestamoRepository.create({
          docente_comunidad_id: docenteComunidad ? docenteComunidad.id : null,
          docente_codigo_nfc,
          docente_nombre,
          solicitante_tipo,
          docente_responsable_id: responsableComunidad ? responsableComunidad.id : null,
          docente_responsable_nombre,
          auxiliar_prestamista: auxiliar_prestamista || 'Auxiliar',
          ubicacion_prestamo_id: ubicacion ? ubicacion.id : null,
          estado: 'activo',
          gestionado_por_usuario_id: user?.sub || null,
        }, trx);
      }

      const detalles = equiposIds.map((id) => this._crearDetalleEquipo(equiposMap.get(String(id))));
      await prestamoRepository.addEquiposLinea(header.id, detalles, trx);

      return header.id;
    });

    logger.info('Préstamo creado', { docente: docente_codigo_nfc, equipos: equiposIds.length, ubicacion: ubicacionPrestamoClave });
    return this.obtener(prestamoId);
  }

  /**
   * Agrega un equipo adicional a un préstamo existente.
   */
  async agregarEquipo(prestamoId, equipoId, auxiliar, user = null) { // eslint-disable-line no-unused-vars
    await verificarPermisoPrestamoEquipos(user);
    const knex = pgClient.getKnex();

    await knex.transaction(async (trx) => {
      const prestamo = await prestamoRepository.findById(prestamoId, trx);
      if (!prestamo) throw ApiError.notFound('Préstamo no encontrado');
      if (prestamo.estado === 'completamente_devuelto') {
        throw ApiError.badRequest('El préstamo ya fue devuelto completamente');
      }

      const equiposMap = await this._cargarEquiposDisponibles([equipoId], trx);
      this._validarNoDuplicadosEnPrestamo(prestamo, [equipoId], equiposMap);

      const equipo = equiposMap.get(String(equipoId));
      const detalle = this._crearDetalleEquipo(equipo);
      await prestamoRepository.addEquiposLinea(prestamoId, [detalle], trx);
    });

    logger.info('Equipo agregado a préstamo', { prestamoId, equipoId });
    return this.obtener(prestamoId);
  }

  /**
   * Registra devolución (parcial o completa).
   * Equivale a DevolucionService.crear_devolucion (Python).
   *
   * Transacción: marcar cada línea de `prestamo_equipos` como devuelta,
   * actualizar el estado de la cabecera `prestamos`, e insertar la
   * cabecera+líneas de `devoluciones`/`devolucion_equipos` ocurren en el
   * mismo `knex.transaction()` — atómico: o toda la devolución queda
   * registrada, o ninguna escritura persiste (ni el cambio de estado del
   * préstamo, ni la devolución, ni sus líneas).
   */
  async registrarDevolucion({
    prestamo_id,
    docente_codigo_nfc,
    docente_nombre,
    equipos,
    auxiliar_que_recibio,
    ubicacion_devolucion = UBICACION_OFICINA,
  }, user = null) {
    await verificarPermisoRecepcionEquipos(user);

    const ubicacionDevolucionClave = await this._validarUbicacionOperacion(
      ubicacion_devolucion,
      'La ubicación seleccionada no está autorizada para devoluciones de equipos'
    );

    const knex = pgClient.getKnex();

    const { devolucionId, nuevoEstado } = await knex.transaction(async (trx) => {
      const prestamo = await prestamoRepository.findById(prestamo_id, trx);
      if (!prestamo) throw ApiError.notFound('Préstamo no encontrado');
      if (prestamo.estado === 'completamente_devuelto') {
        throw ApiError.badRequest('El préstamo ya fue devuelto completamente');
      }

      const equiposADevolver = equipos && equipos.length
        ? this._normalizarEquipos(equipos)
        : prestamo.equipos
            .filter((e) => e.estado_equipo === 'entregado')
            .map((e) => String(e.equipo_id));

      const now = new Date();
      const equiposDevueltosLineas = [];
      const lineasADevolver = [];

      for (const eq of prestamo.equipos) {
        const strId = String(eq.equipo_id);
        if (equiposADevolver.includes(strId) && eq.estado_equipo === 'entregado') {
          lineasADevolver.push(eq);
          equiposDevueltosLineas.push({
            equipo_id: eq.equipo_id,
            nombre: eq.equipo_nombre,
            cantidad: 1,
            estado: 'bueno',
          });
        }
      }

      if (!equiposDevueltosLineas.length) {
        throw ApiError.badRequest('No hay equipos entregados que coincidan con la devolución solicitada');
      }

      for (const linea of lineasADevolver) {
        await prestamoRepository.updateEquipoLinea(linea.id, {
          estado_equipo: 'devuelto',
          fecha_devolucion: now,
          auxiliar_que_recibio_devolucion: auxiliar_que_recibio || 'Auxiliar',
        }, trx);
      }

      const idsDevueltos = new Set(lineasADevolver.map((l) => l.id));
      const aunEntregados = prestamo.equipos.filter(
        (eq) => eq.estado_equipo === 'entregado' && !idsDevueltos.has(eq.id)
      );
      const esCompleta = aunEntregados.length === 0;
      const nuevoEstadoPrestamo = esCompleta ? 'completamente_devuelto' : 'parcialmente_devuelto';

      await prestamoRepository.update(prestamo_id, { estado: nuevoEstadoPrestamo }, trx);

      const [docenteComunidad, ubicacion] = await Promise.all([
        docente_codigo_nfc ? comunidadRepository.findByDocumento(docente_codigo_nfc) : null,
        ubicacionRepository.findByClave(ubicacionDevolucionClave),
      ]);

      const devolucionHeader = await devolucionRepository.create({
        prestamo_id,
        docente_comunidad_id: docenteComunidad ? docenteComunidad.id : null,
        docente_codigo_nfc: docente_codigo_nfc || '',
        docente_nombre: docente_nombre || '',
        ubicacion_devolucion_id: ubicacion ? ubicacion.id : null,
        auxiliar_que_recibio: auxiliar_que_recibio || 'Auxiliar',
        es_devolucion_completa: esCompleta,
        gestionado_por_usuario_id: user?.sub || null,
      }, trx);

      await devolucionRepository.addEquiposLinea(devolucionHeader.id, equiposDevueltosLineas, trx);

      return { devolucionId: devolucionHeader.id, nuevoEstado: nuevoEstadoPrestamo };
    });

    const devolucion = await devolucionRepository.findById(devolucionId);
    logger.info('Devolución registrada', { prestamo_id, estado: nuevoEstado, equipos: devolucion.equipos_devueltos.length });
    return { devolucion, prestamo_estado: nuevoEstado };
  }

  _normalizarEquipos(equipos) {
    const normalizados = equipos.map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object') {
        return String(item.equipo_id || item.id || item._id || '');
      }
      return String(item);
    }).filter(Boolean);
    return [...new Set(normalizados)];
  }

  _crearDetalleEquipo(equipo, tipoEntrega = 'manual') {
    if (!equipo) throw ApiError.notFound('Equipo no encontrado');

    return {
      equipo_id: equipo.id,
      equipo_nombre: equipo.nombre,
      equipo_marca: equipo.marca,
      equipo_codigo: equipo.codigo_inventario,
      equipo_consecutivo: equipo.consecutivo,
      equipo_codigo_barras: equipo.codigo_barras,
      estado_equipo: 'entregado',
      fecha_entrega: new Date(),
      tipo_entrega: tipoEntrega || 'manual',
    };
  }

  async _cargarEquiposDisponibles(equiposIds, trx = null) {
    const equipos = await equipoRepository.findByIds(equiposIds);
    const equiposMap = new Map(equipos.map((equipo) => [String(equipo.id), equipo]));

    const faltantes = equiposIds.filter((id) => !equiposMap.has(String(id)));
    if (faltantes.length) {
      throw ApiError.notFound(`Equipos no encontrados: ${faltantes.join(', ')}`);
    }

    const noPrestables = equipos
      .filter((equipo) => equipo.estado !== 'activo')
      .map((equipo) => equipo.nombre || equipo.codigo_inventario || String(equipo.id));

    if (noPrestables.length) {
      throw ApiError.conflict(`Los equipos ${noPrestables.join(', ')} no están disponibles para préstamo`);
    }

    await this._validarDisponibilidad(equiposIds, trx, equiposMap);
    return equiposMap;
  }

  async _validarDisponibilidad(equiposIds, trx = null, equiposMap = null) {
    const idsPrestados = await prestamoRepository.findEquiposPrestados(equiposIds, trx || undefined);
    if (!idsPrestados.length) return;

    const nombres = idsPrestados.map((id) => {
      const equipo = equiposMap?.get(String(id));
      return equipo?.nombre || equipo?.codigo_inventario || id;
    });

    throw ApiError.conflict(`Los equipos ${nombres.join(', ')} ya están prestados`);
  }

  _validarNoDuplicadosEnPrestamo(prestamo, equiposIds, equiposMap = null) {
    if (!prestamo?.equipos?.length) return;

    const equiposActivos = new Set(
      prestamo.equipos
        .filter((equipo) => equipo.estado_equipo === 'entregado')
        .map((equipo) => String(equipo.equipo_id))
    );

    const duplicados = equiposIds.filter((id) => equiposActivos.has(String(id)));
    if (!duplicados.length) return;

    const nombres = duplicados.map((id) => {
      const equipo = equiposMap?.get(String(id));
      return equipo?.nombre || equipo?.codigo_inventario || id;
    });

    throw ApiError.conflict(`El préstamo ya incluye los equipos: ${nombres.join(', ')}`);
  }

  /**
   * Ya NO autoriza la operación contra `ubicaciones_operativas` (ver
   * `verificarPermisoPrestamoEquipos`/`verificarPermisoRecepcionEquipos`,
   * que reemplazan ese gate por rol) — solo normaliza la clave para el
   * snapshot histórico (`ubicacion_prestamo_id`/
   * `ubicacion_devolucion_id`), que sigue existiendo por compatibilidad
   * aunque ya no se valide.
   */
  _validarUbicacionOperacion(ubicacion) {
    return normalizeKey(ubicacion) || UBICACION_OFICINA;
  }
}

module.exports = new PrestamoService();
