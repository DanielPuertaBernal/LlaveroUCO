/**
 * `createLlaveWorkflows(deps)` recibe cada acceso a datos por inyección, así
 * que la orquestación NFC se prueba con fakes, sin base ni mocks de Knex.
 * Los tests van contra la superficie pública (los cinco workflows), no contra
 * los closures internos.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import workflowsModule from '../src/features/llaves/llave.workflows.js';
import authConstants from '../src/features/auth/auth.constants.js';

const { createLlaveWorkflows } = workflowsModule;
const { ROLES } = authConstants;

const bogota = (isoLocal) => new Date(`${isoLocal}-05:00`);
const LUNES_0650 = bogota('2026-03-02T06:50:00');

const PERSONA = { numero_documento: '123.0', nombre: 'Ana Ríos' };
const CLASE = { horario: '07:00 A 09:00', aula: 'A101', materia: 'Cálculo' };

/** Dependencias inertes: cada test sobrescribe solo lo que le importa. */
function crearWorkflows(overrides = {}) {
  const deps = {
    buscarPersonaPorCarnet: vi.fn(async () => PERSONA),
    resolverContextoNFC: vi.fn(async () => ({
      rol: 'docente',
      docente: PERSONA,
      clasesDisponibles: [],
      prestamoActivo: null,
      prestamosActivos: [],
    })),
    buscarClaseParaConfirmacion: vi.fn(async () => null),
    findPendienteByDocumento: vi.fn(async () => null),
    findRegistroById: vi.fn(async () => null),
    findReservaPendienteNFCByDocumento: vi.fn(async () => null),
    findReservaById: vi.fn(async () => null),
    marcarReservaCheckinNFC: vi.fn(async () => {}),
    findDocenteByDocumento: vi.fn(async () => PERSONA),
    createRegistro: vi.fn(async () => ({ id: 'reg-1' })),
    normalizarUbicacionPrestamo: vi.fn(async (u) => u || 'porteria'),
    normalizarUbicacionDevolucion: vi.fn(async (u) => u || 'porteria'),
    persistirPrestamo: vi.fn(async () => ({ registro: { id: 'reg-1' }, vinculosReservaIndividual: [] })),
    persistirDevolucion: vi.fn(async () => ({ mensaje: 'Llave devuelta' })),
    verificarPermiso: vi.fn(async () => {}),
    validarEntregaManual: vi.fn(async () => {}),
    normalizarOrigenRegistro: vi.fn((o) => o),
    ...overrides,
  };
  return { workflows: createLlaveWorkflows(deps), deps };
}

describe('procesarLecturaNFC — enrutamiento', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LUNES_0650);
  });
  afterEach(() => vi.useRealTimers());

  it('rechaza un carnet que no corresponde a ninguna persona', async () => {
    const { workflows, deps } = crearWorkflows({ buscarPersonaPorCarnet: vi.fn(async () => null) });
    const resultado = await workflows.procesarLecturaNFC('999', 'porteria');

    expect(resultado).toEqual({ tipo: 'error', mensaje: 'Persona no encontrada para este carnet' });
    expect(deps.resolverContextoNFC).not.toHaveBeenCalled();
  });

  it('devuelve la llave cuando ya hay un préstamo activo, sin mirar clases', async () => {
    const { workflows, deps } = crearWorkflows({
      resolverContextoNFC: vi.fn(async () => ({
        rol: 'docente',
        docente: PERSONA,
        clasesDisponibles: [CLASE],
        prestamoActivo: { id: 'reg-1', salon_id: 's1' },
      })),
    });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.tipo).toBe('devolucion');
    expect(deps.persistirDevolucion).toHaveBeenCalledOnce();
    expect(deps.persistirPrestamo).not.toHaveBeenCalled();
  });

  it('pide elegir cuando el docente tiene más de un préstamo activo', async () => {
    const prestamosActivos = [{ id: 'a' }, { id: 'b' }];
    const { workflows, deps } = crearWorkflows({
      resolverContextoNFC: vi.fn(async () => ({
        rol: 'docente', docente: PERSONA, clasesDisponibles: [CLASE],
        prestamoActivo: null, prestamosActivos,
      })),
    });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.tipo).toBe('seleccion_devolucion');
    expect(resultado.prestamosActivos).toBe(prestamosActivos);
    expect(deps.persistirDevolucion).not.toHaveBeenCalled();
    expect(deps.persistirPrestamo).not.toHaveBeenCalled();
  });

  it('normaliza el documento antes de resolver el contexto', async () => {
    const { workflows, deps } = crearWorkflows();
    await workflows.procesarLecturaNFC('123', 'porteria');

    expect(deps.resolverContextoNFC).toHaveBeenCalledWith(PERSONA, '123');
  });
});

describe('procesarLecturaNFC — préstamo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LUNES_0650);
  });
  afterEach(() => vi.useRealTimers());

  const contextoConClase = (clases = [CLASE]) => vi.fn(async () => ({
    rol: 'docente', docente: PERSONA, clasesDisponibles: clases,
    prestamoActivo: null, prestamosActivos: [],
  }));

  it('no persiste nada cuando el reclamo es anticipado, solo avisa', async () => {
    // 06:00 es una hora antes del inicio: más de los 30 minutos de ventana.
    vi.setSystemTime(bogota('2026-03-02T06:00:00'));
    const { workflows, deps } = crearWorkflows({ resolverContextoNFC: contextoConClase() });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.tipo).toBe('anticipado');
    expect(deps.persistirPrestamo).not.toHaveBeenCalled();
    expect(deps.verificarPermiso).not.toHaveBeenCalled();
  });

  it('presta dentro de la ventana de 30 minutos previa al inicio', async () => {
    const { workflows, deps } = crearWorkflows({ resolverContextoNFC: contextoConClase() });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.tipo).toBe('prestamo');
    expect(resultado.se_reclamo_a_tiempo).toBe(true);
    expect(deps.persistirPrestamo).toHaveBeenCalledOnce();
  });

  it('registra el retraso cuando la clase ya empezó', async () => {
    vi.setSystemTime(bogota('2026-03-02T07:25:00'));
    const { workflows, deps } = crearWorkflows({ resolverContextoNFC: contextoConClase() });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.se_reclamo_a_tiempo).toBe(false);
    expect(resultado.tiempo_retraso).toBe(25);
    expect(deps.persistirPrestamo.mock.calls[0][0].tiempoRetraso).toBe(25);
  });

  it('avisa cuando no hay ni clase ni reserva, con el mensaje del contexto', async () => {
    const { workflows, deps } = crearWorkflows({
      resolverContextoNFC: vi.fn(async () => ({
        rol: 'monitor', docente: PERSONA, clasesDisponibles: [],
        prestamoActivo: null, prestamosActivos: [],
        mensajeSinClase: 'El monitor no tiene clase asignada',
      })),
    });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.tipo).toBe('sin_clase');
    expect(resultado.mensaje).toBe('El monitor no tiene clase asignada');
    expect(deps.persistirPrestamo).not.toHaveBeenCalled();
  });

  it('da prioridad a la clase sobre una reserva que cae a la misma hora', async () => {
    const reserva = {
      _id: 'res-1', nombre_salon: 'B202', hora_inicio: '07:00', hora_fin: '09:00',
      solicitante_documento: '123', solicitante_nombre: 'Ana Ríos',
    };
    const { workflows, deps } = crearWorkflows({
      resolverContextoNFC: contextoConClase(),
      findReservaPendienteNFCByDocumento: vi.fn(async () => reserva),
    });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.clase.aula).toBe('A101');
    expect(resultado.reserva).toBeUndefined();
    expect(deps.marcarReservaCheckinNFC).not.toHaveBeenCalled();
  });

  it('cae en la reserva individual cuando no hay clase, y la marca como reclamada', async () => {
    const reserva = {
      _id: 'res-1', nombre_salon: 'B202', hora_inicio: '07:00', hora_fin: '09:00',
      solicitante_documento: '456', solicitante_nombre: 'Luis Paz', motivo: 'Asesoría',
    };
    const { workflows, deps } = crearWorkflows({
      findReservaPendienteNFCByDocumento: vi.fn(async () => reserva),
    });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria');

    expect(resultado.tipo).toBe('prestamo');
    expect(resultado.reserva).toEqual({ id: 'res-1' });
    expect(deps.persistirPrestamo.mock.calls[0][0].origenRegistro).toBe('individual');
    expect(deps.marcarReservaCheckinNFC).toHaveBeenCalledWith(
      expect.objectContaining({ reservaId: 'res-1', checkinEstado: 'nfc_en_tiempo' }),
    );
  });

  it('marca el check-in de la reserva como con retraso cuando llega tarde', async () => {
    vi.setSystemTime(bogota('2026-03-02T07:25:00'));
    const reserva = {
      _id: 'res-1', nombre_salon: 'B202', hora_inicio: '07:00', hora_fin: '09:00',
      solicitante_documento: '456', solicitante_nombre: 'Luis Paz',
    };
    const { workflows, deps } = crearWorkflows({
      findReservaPendienteNFCByDocumento: vi.fn(async () => reserva),
    });
    await workflows.procesarLecturaNFC('123', 'porteria');

    expect(deps.marcarReservaCheckinNFC).toHaveBeenCalledWith(
      expect.objectContaining({ checkinEstado: 'nfc_retraso' }),
    );
  });

  it('encadena las reservas individuales que quedaron dentro del préstamo', async () => {
    const { workflows, deps } = crearWorkflows({
      resolverContextoNFC: contextoConClase(),
      persistirPrestamo: vi.fn(async () => ({
        registro: { id: 'reg-1' },
        vinculosReservaIndividual: [{ reservaId: 'res-9', registroLlaveId: 'reg-2' }],
      })),
    });
    await workflows.procesarLecturaNFC('123', 'porteria');

    expect(deps.marcarReservaCheckinNFC).toHaveBeenCalledWith(
      expect.objectContaining({ reservaId: 'res-9', llavePrestamoId: 'reg-2' }),
    );
  });

  it('traduce el choque del índice de dedupe a un error de negocio legible', async () => {
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    const { workflows } = crearWorkflows({
      resolverContextoNFC: contextoConClase(),
      persistirPrestamo: vi.fn(async () => { throw err; }),
    });

    await expect(workflows.procesarLecturaNFC('123', 'porteria'))
      .rejects.toThrow('La llave de este salón ya está en préstamo hoy');
  });

  it('deja pasar cualquier otro error de persistencia sin disfrazarlo', async () => {
    const { workflows } = crearWorkflows({
      resolverContextoNFC: contextoConClase(),
      persistirPrestamo: vi.fn(async () => { throw new Error('conexión perdida'); }),
    });

    await expect(workflows.procesarLecturaNFC('123', 'porteria')).rejects.toThrow('conexión perdida');
  });

  it('devuelve el fallo de ubicación como resultado, no como excepción', async () => {
    const { workflows } = crearWorkflows({
      resolverContextoNFC: contextoConClase(),
      normalizarUbicacionPrestamo: vi.fn(async () => { throw new Error('Ubicación no reconocida'); }),
    });
    const resultado = await workflows.procesarLecturaNFC('123', 'inexistente');

    expect(resultado).toMatchObject({ tipo: 'error', mensaje: 'Ubicación no reconocida' });
  });
});

describe('devolución: la portería que prestó es la que recibe', () => {
  const registro = (extra = {}) => ({
    id: 'reg-1', salon_id: 's1', estado: 'en_prestamo',
    gestionado_por_usuario_id: 'p1', gestionado_por_rol: ROLES.PORTERIA,
    ...extra,
  });

  it('acepta la devolución en la misma portería que entregó', async () => {
    const { workflows, deps } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => registro()),
    });
    const resultado = await workflows.registrarDevolucion('123', 'porteria', { sub: 'p1', rol: ROLES.PORTERIA });

    expect(resultado.ok).toBe(true);
    expect(deps.persistirDevolucion).toHaveBeenCalledOnce();
  });

  it('rechaza a otra portería aunque tenga permiso sobre el bloque', async () => {
    const { workflows, deps } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => registro()),
    });

    await expect(workflows.registrarDevolucion('123', 'porteria', { sub: 'p2', rol: ROLES.PORTERIA }))
      .rejects.toThrow(/solo esa portería puede registrar la devolución/);
    expect(deps.persistirDevolucion).not.toHaveBeenCalled();
  });

  it('no restringe a admin ni a auxiliar', async () => {
    for (const rol of [ROLES.ADMIN, ROLES.AUX]) {
      const { workflows } = crearWorkflows({ findPendienteByDocumento: vi.fn(async () => registro()) });
      await expect(workflows.registrarDevolucion('123', 'porteria', { sub: 'otro', rol })).resolves.toMatchObject({ ok: true });
    }
  });

  it('no restringe cuando quien entregó no era portería', async () => {
    const { workflows } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => registro({ gestionado_por_rol: ROLES.AUX })),
    });

    await expect(workflows.registrarDevolucion('123', 'porteria', { sub: 'p2', rol: ROLES.PORTERIA }))
      .resolves.toMatchObject({ ok: true });
  });

  it('no restringe cuando el registro no trae gestor', async () => {
    const { workflows } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => registro({ gestionado_por_usuario_id: null })),
    });

    await expect(workflows.registrarDevolucion('123', 'porteria', { sub: 'p2', rol: ROLES.PORTERIA }))
      .resolves.toMatchObject({ ok: true });
  });

  it('compara los ids como texto, no por identidad de tipo', async () => {
    const { workflows } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => registro({ gestionado_por_usuario_id: 1 })),
    });

    await expect(workflows.registrarDevolucion('123', 'porteria', { sub: '1', rol: ROLES.PORTERIA }))
      .resolves.toMatchObject({ ok: true });
  });

  it('en el flujo NFC el rechazo vuelve como resultado de error, no como excepción', async () => {
    const { workflows, deps } = crearWorkflows({
      resolverContextoNFC: vi.fn(async () => ({
        rol: 'docente', docente: PERSONA, clasesDisponibles: [],
        prestamoActivo: registro(),
      })),
    });
    const resultado = await workflows.procesarLecturaNFC('123', 'porteria', { sub: 'p2', rol: ROLES.PORTERIA });

    expect(resultado.tipo).toBe('error');
    expect(resultado.mensaje).toMatch(/solo esa portería/);
    expect(deps.persistirDevolucion).not.toHaveBeenCalled();
  });
});

describe('registrarDevolucion / registrarDevolucionPorId', () => {
  it('falla cuando el docente no tiene ninguna llave prestada', async () => {
    const { workflows } = crearWorkflows();
    await expect(workflows.registrarDevolucion('123', 'porteria'))
      .rejects.toThrow('No se encontró llave en préstamo para este docente');
  });

  it('normaliza el documento antes de buscar el préstamo', async () => {
    const { workflows, deps } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => ({ id: 'reg-1', estado: 'en_prestamo' })),
    });
    await workflows.registrarDevolucion('123.0', 'porteria');

    expect(deps.findPendienteByDocumento).toHaveBeenCalledWith('123');
  });

  it('rechaza un registro que ya fue entregado', async () => {
    const { workflows } = crearWorkflows({
      findRegistroById: vi.fn(async () => ({ id: 'reg-1', estado: 'entregado' })),
    });

    await expect(workflows.registrarDevolucionPorId('reg-1', 'porteria'))
      .rejects.toThrow('No se encontró llave en préstamo con ese identificador');
  });

  it('acepta los estados que siguen contando como préstamo abierto', async () => {
    for (const estado of ['en_prestamo', 'en_mora', 'demora_entrega']) {
      const { workflows } = crearWorkflows({
        findRegistroById: vi.fn(async () => ({ id: 'reg-1', estado })),
      });
      await expect(workflows.registrarDevolucionPorId('reg-1', 'porteria')).resolves.toMatchObject({ ok: true });
    }
  });

  it('distingue el canal de cada vía de devolución', async () => {
    const { workflows: wManual, deps: dManual } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => ({ id: 'reg-1', estado: 'en_prestamo' })),
    });
    await wManual.registrarDevolucion('123', 'porteria');
    expect(dManual.persistirDevolucion.mock.calls[0][1].canal).toBe('manual');

    const { workflows: wPorId, deps: dPorId } = crearWorkflows({
      findRegistroById: vi.fn(async () => ({ id: 'reg-1', estado: 'en_prestamo' })),
    });
    await wPorId.registrarDevolucionPorId('reg-1', 'porteria');
    expect(dPorId.persistirDevolucion.mock.calls[0][1].canal).toBe('nfc_seleccion');
  });

  it('guarda al gestor de la devolución cuando hay usuario', async () => {
    const { workflows, deps } = crearWorkflows({
      findPendienteByDocumento: vi.fn(async () => ({ id: 'reg-1', estado: 'en_prestamo' })),
    });
    await workflows.registrarDevolucion('123', 'porteria', { sub: 'u9', rol: ROLES.ADMIN });

    expect(deps.persistirDevolucion.mock.calls[0][1].gestionadoPorUsuarioId).toBe('u9');
  });
});
