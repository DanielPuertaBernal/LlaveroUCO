import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import llaveDomain from '../src/features/llaves/llave.domain.js';

const {
  horarioCubiertoPorPrestamo,
  agruparClasesConsecutivas,
  encontrarClaseActual,
  construirClasesProcesadas,
  construirRegistroPrestamo,
  construirRegistrosPrestamo,
  construirRegistrosEntregaManual,
  construirDatosDevolucion,
  calcularEstadoVisual,
  toClientFormat,
} = llaveDomain;

/** Un instante fijo expresado en hora de Bogotá (UTC-5, sin DST). */
const bogota = (isoLocal) => new Date(`${isoLocal}-05:00`);

// 2026-03-02 es lunes: `getDiaActual()` debe resolver a 'Lunes'.
const LUNES_0650 = bogota('2026-03-02T06:50:00');

describe('horarioCubiertoPorPrestamo', () => {
  it('reconoce una clase contenida en un préstamo ya registrado', () => {
    expect(horarioCubiertoPorPrestamo('08:00 A 09:00', ['07:00 A 09:00'])).toBe(true);
    expect(horarioCubiertoPorPrestamo('07:00 A 09:00', ['07:00 A 09:00'])).toBe(true);
  });

  it('no cubre una clase que se sale del préstamo, aunque solape', () => {
    expect(horarioCubiertoPorPrestamo('08:00 A 10:00', ['07:00 A 09:00'])).toBe(false);
    expect(horarioCubiertoPorPrestamo('10:00 A 11:00', ['07:00 A 09:00'])).toBe(false);
  });

  it('ignora horarios ilegibles en vez de darlos por cubiertos', () => {
    expect(horarioCubiertoPorPrestamo('sin horario', ['07:00 A 09:00'])).toBe(false);
    expect(horarioCubiertoPorPrestamo('08:00 A 09:00', ['basura'])).toBe(false);
    expect(horarioCubiertoPorPrestamo('08:00 A 09:00', [])).toBe(false);
    expect(horarioCubiertoPorPrestamo('08:00 A 09:00', null)).toBe(false);
  });
});

describe('agruparClasesConsecutivas', () => {
  const clase = (horario, extra = {}) => ({
    numero_documento: '123',
    aula: 'A101',
    materia: 'Cálculo',
    horario,
    ...extra,
  });

  it('fusiona clases pegadas del mismo docente y aula en un solo bloque', () => {
    const [bloque, ...resto] = agruparClasesConsecutivas([
      clase('07:00 A 08:00'),
      clase('08:00 A 09:00'),
    ]);

    expect(resto).toHaveLength(0);
    expect(bloque.horario).toBe('07:00 A 09:00');
    expect(bloque.hora_fin).toBe('09:00');
    expect(bloque._clasesOriginales).toHaveLength(2);
  });

  it('corta el bloque cuando hay un hueco entre clases', () => {
    const bloques = agruparClasesConsecutivas([
      clase('07:00 A 08:00'),
      clase('09:00 A 10:00'),
    ]);

    expect(bloques.map((b) => b.horario)).toEqual(['07:00 A 08:00', '09:00 A 10:00']);
  });

  it('ordena por hora de inicio antes de fusionar, no confía en el orden de entrada', () => {
    const [bloque] = agruparClasesConsecutivas([
      clase('08:00 A 09:00'),
      clase('07:00 A 08:00'),
    ]);

    expect(bloque.horario).toBe('07:00 A 09:00');
  });

  it('no mezcla docentes ni aulas distintas', () => {
    const bloques = agruparClasesConsecutivas([
      clase('07:00 A 08:00'),
      clase('08:00 A 09:00', { aula: 'B202' }),
      clase('08:00 A 09:00', { numero_documento: '999' }),
    ]);

    expect(bloques).toHaveLength(3);
  });

  it('agrupa pese a la cola decimal del documento y a la caja del aula', () => {
    const [bloque, ...resto] = agruparClasesConsecutivas([
      clase('07:00 A 08:00', { numero_documento: '123.0', aula: 'a101' }),
      clase('08:00 A 09:00', { numero_documento: '123', aula: 'A101' }),
    ]);

    expect(resto).toHaveLength(0);
    expect(bloque.horario).toBe('07:00 A 09:00');
  });

  it('concatena las materias del bloque sin repetirlas', () => {
    const [bloque] = agruparClasesConsecutivas([
      clase('07:00 A 08:00', { materia: 'Cálculo' }),
      clase('08:00 A 09:00', { materia: 'Álgebra' }),
      clase('09:00 A 10:00', { materia: 'Cálculo' }),
    ]);

    expect(bloque.materia).toBe('Cálculo, Álgebra');
  });

  it('conserva la clase suelta con su propio `_clasesOriginales`', () => {
    const unica = clase('07:00 A 08:00');
    const [bloque] = agruparClasesConsecutivas([unica]);

    expect(bloque._clasesOriginales).toEqual([unica]);
  });

  it('no falla con una lista vacía', () => {
    expect(agruparClasesConsecutivas()).toEqual([]);
  });
});

describe('encontrarClaseActual', () => {
  const clases = [
    { horario: '07:00 A 08:00' },
    { horario: '10:00 A 11:00' },
    { horario: '14:00 A 16:00' },
  ];

  it('elige la clase en curso por encima de las siguientes', () => {
    expect(encontrarClaseActual(clases, 10 * 60 + 30)).toEqual({ horario: '10:00 A 11:00' });
  });

  it('descarta las clases que ya terminaron', () => {
    expect(encontrarClaseActual(clases, 9 * 60)).toEqual({ horario: '10:00 A 11:00' });
  });

  it('devuelve null cuando ya no queda ninguna clase por delante', () => {
    expect(encontrarClaseActual(clases, 17 * 60)).toBeNull();
  });

  it('salta los horarios mal formados en vez de romperse', () => {
    const conBasura = [{ horario: 'sin hora' }, { horario: '10:00' }, ...clases];
    expect(encontrarClaseActual(conBasura, 10 * 60)).toEqual({ horario: '10:00 A 11:00' });
  });
});

describe('construirClasesProcesadas', () => {
  it('normaliza documento, horario y aula de cada registro', () => {
    expect(construirClasesProcesadas([
      { numero_documento: ' 123.0 ', horario: ' 07:00 a 08:00 ', aula: ' a101 ' },
    ])).toEqual([
      { documento: '123', horario: '07:00 a 08:00', aula: 'A101' },
    ]);
  });
});

describe('construirRegistroPrestamo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LUNES_0650);
  });
  afterEach(() => vi.useRealTimers());

  const docente = { numero_documento: '123.0', nombre: 'Ana Ríos' };

  it('deja el registro abierto y fecha el día de entrega en hora de Bogotá', () => {
    const registro = construirRegistroPrestamo({
      docente,
      clase: { id: 7, dia: 'Lunes', horario: '07:00 A 08:00', aula: 'A101' },
      seReclamoATiempo: true,
      tiempoRetraso: null,
      ubicacionPrestamo: 'porteria',
    });

    expect(registro.numero_documento).toBe('123');
    expect(registro.estado).toBe('en_prestamo');
    expect(registro.fecha_hora_devolucion).toBeNull();
    expect(registro.dia_entrega).toBe('2026-03-02');
    expect(registro.programacion_id).toBe(7);
  });

  it('guarda el retraso solo cuando viene como número de minutos', () => {
    const base = { docente, clase: {}, ubicacionPrestamo: 'porteria' };

    expect(construirRegistroPrestamo({ ...base, tiempoRetraso: 12 }).tiempo_retraso_minutos).toBe(12);
    expect(construirRegistroPrestamo({ ...base, tiempoRetraso: '12min' }).tiempo_retraso_minutos).toBeNull();
  });

  it('no guarda el id de una reserva individual como `programacion_id`', () => {
    const registro = construirRegistroPrestamo({
      docente,
      clase: { id: 42, _origen: 'individual' },
      ubicacionPrestamo: 'porteria',
    });

    expect(registro.programacion_id).toBeNull();
  });

  it('deja que un `programacionId` explícito gane sobre el id de la clase', () => {
    const registro = construirRegistroPrestamo({
      docente,
      clase: { id: 42, _origen: 'individual' },
      programacionId: 9,
      ubicacionPrestamo: 'porteria',
    });

    expect(registro.programacion_id).toBe(9);
  });

  it('cae en el día actual cuando la clase no trae uno', () => {
    expect(construirRegistroPrestamo({ docente, clase: {} }).dia).toBe('Lunes');
  });
});

describe('construirRegistrosPrestamo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const original = (horario, materia) => ({
    numero_documento: '123',
    aula: 'A101',
    horario,
    materia,
  });

  const params = (ahora) => ({
    docente: { numero_documento: '123', nombre: 'Ana Ríos' },
    clase: {
      numero_documento: '123',
      aula: 'A101',
      horario: '07:00 A 09:00',
      materia: 'Cálculo, Álgebra',
      _clasesOriginales: [original('07:00 A 08:00', 'Cálculo'), original('08:00 A 09:00', 'Álgebra')],
    },
    seReclamoATiempo: true,
    tiempoRetraso: null,
    ubicacionPrestamo: 'porteria',
    ahora,
  });

  it('genera un solo registro cuando la clase no viene de un bloque fusionado', () => {
    vi.setSystemTime(LUNES_0650);
    const registros = construirRegistrosPrestamo({
      docente: { numero_documento: '123' },
      clase: { horario: '07:00 A 08:00' },
      ahora: LUNES_0650,
    });

    expect(registros).toHaveLength(1);
    expect(registros[0]._origenClase).toEqual({ horario: '07:00 A 08:00' });
  });

  it('encadena un registro por clase original, cerrando cada uno en su propio límite', () => {
    vi.setSystemTime(LUNES_0650);
    const registros = construirRegistrosPrestamo(params(LUNES_0650));

    expect(registros).toHaveLength(2);
    expect(registros[0].materia).toBe('Cálculo');
    expect(registros[1].materia).toBe('Álgebra');

    expect(registros[0].fecha_hora_entrega).toEqual(LUNES_0650);
    expect(registros[0].fecha_hora_devolucion).toEqual(bogota('2026-03-02T08:00:00'));
    expect(registros[0].duracion_minutos).toBe(70);
    expect(registros[0].estado).toBe('entregado');
    expect(registros[0].tipo_devolucion).toBe('automatica');
  });

  it('deja solo el último eslabón realmente en préstamo', () => {
    vi.setSystemTime(LUNES_0650);
    const registros = construirRegistrosPrestamo(params(LUNES_0650));
    const ultimo = registros[registros.length - 1];

    expect(ultimo.estado).toBe('en_prestamo');
    expect(ultimo.fecha_hora_devolucion).toBeNull();
    expect(ultimo.duracion_minutos).toBeNull();
    // El siguiente abre exactamente donde cerró el anterior: sin huecos.
    expect(ultimo.fecha_hora_entrega).toEqual(registros[0].fecha_hora_devolucion);
  });

  it('atribuye el retraso del reclamo solo a la primera clase de la cadena', () => {
    vi.setSystemTime(LUNES_0650);
    const registros = construirRegistrosPrestamo({
      ...params(LUNES_0650),
      seReclamoATiempo: false,
      tiempoRetraso: 15,
    });

    expect(registros[0].se_reclamo_a_tiempo).toBe(false);
    expect(registros[0].tiempo_retraso_minutos).toBe(15);
    expect(registros[1].se_reclamo_a_tiempo).toBe(true);
    expect(registros[1].tiempo_retraso_minutos).toBeNull();
    expect(registros[1].retraso_entrega).toBe(false);
  });

  it('no fabrica registros retroactivos por las clases que ya terminaron', () => {
    const tarde = bogota('2026-03-02T08:30:00');
    vi.setSystemTime(tarde);
    const registros = construirRegistrosPrestamo(params(tarde));

    expect(registros).toHaveLength(1);
    expect(registros[0].materia).toBe('Álgebra');
    expect(registros[0].estado).toBe('en_prestamo');
  });

  it('conserva la última clase cuando el bloque entero ya terminó', () => {
    const nocheAhora = bogota('2026-03-02T20:00:00');
    vi.setSystemTime(nocheAhora);
    const registros = construirRegistrosPrestamo(params(nocheAhora));

    expect(registros).toHaveLength(1);
    expect(registros[0].materia).toBe('Álgebra');
  });
});

describe('construirRegistrosEntregaManual', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const infoClase = {
    hora_inicio: '07:00',
    hora_fin: '08:00',
    aula: 'A101',
    profesor: 'Ana Ríos',
    motivo: 'Cálculo',
    programacion_id: 7,
  };

  it('marca el préstamo a tiempo cuando la entrega ocurre antes del inicio', () => {
    vi.setSystemTime(LUNES_0650);
    const [registro] = construirRegistrosEntregaManual({
      infoClase,
      documento: '123.0',
      ubicacionPrestamo: 'porteria',
      origenRegistro: 'programacion',
    });

    expect(registro.horario).toBe('07:00 A 08:00');
    expect(registro.tipo_entrega).toBe('manual');
    expect(registro.se_reclamo_a_tiempo).toBe(true);
    expect(registro.retraso_entrega).toBe(false);
    expect(registro.tiempo_retraso_minutos).toBeNull();
    expect(registro.dia).toBe('Lunes');
  });

  it('calcula el retraso y lo marca en el registro cuando la entrega llega tarde', () => {
    vi.setSystemTime(bogota('2026-03-02T07:20:00'));
    const [registro] = construirRegistrosEntregaManual({
      infoClase,
      documento: '123',
      ubicacionPrestamo: 'porteria',
      origenRegistro: 'programacion',
    });

    expect(registro.tiempo_retraso_minutos).toBe(20);
    expect(registro.se_reclamo_a_tiempo).toBe(false);
    expect(registro.retraso_entrega).toBe(true);
  });

  it('encadena el resto del bloque consecutivo sin repetir la entrega manual', () => {
    vi.setSystemTime(LUNES_0650);
    const registros = construirRegistrosEntregaManual({
      infoClase,
      documento: '123',
      ubicacionPrestamo: 'porteria',
      origenRegistro: 'programacion',
      grupoClase: {
        _clasesOriginales: [
          { numero_documento: '123', aula: 'A101', horario: '07:00 A 08:00', materia: 'Cálculo' },
          { numero_documento: '123', aula: 'A101', horario: '08:00 A 09:00', materia: 'Álgebra' },
        ],
      },
    });

    expect(registros).toHaveLength(2);
    expect(registros[0].estado).toBe('entregado');
    expect(registros[1].estado).toBe('en_prestamo');
    expect(registros.every((r) => r.tipo_entrega === 'manual')).toBe(true);
  });
});

describe('construirDatosDevolucion', () => {
  const registro = {
    numero_documento: '123',
    docente: 'Ana Ríos',
    horario: '07:00 A 09:00',
    fecha_hora_entrega: bogota('2026-03-02T06:50:00'),
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cierra el registro con duración y sin retraso dentro de la hora de gracia', () => {
    vi.setSystemTime(bogota('2026-03-02T09:30:00'));
    const { updates } = construirDatosDevolucion({ registro, ubicacionPorDefecto: 'porteria' });

    expect(updates.estado).toBe('entregado');
    expect(updates.duracion_minutos).toBe(160);
    expect(updates.tiempo_retraso_devolucion_minutos).toBeNull();
    expect(updates.retraso_entrega).toBe(false);
    expect(updates.ubicacion_devolucion).toBe('porteria');
    expect(updates.tipo_devolucion).toBe('manual');
  });

  it('cuenta el retraso desde el fin de clase una vez vencida la gracia', () => {
    vi.setSystemTime(bogota('2026-03-02T10:30:00'));
    const { updates } = construirDatosDevolucion({ registro });

    expect(updates.tiempo_retraso_devolucion_minutos).toBe(90);
    expect(updates.retraso_entrega).toBe(true);
  });

  it('detecta el retraso de una devolución al día siguiente aunque la hora luzca temprana', () => {
    vi.setSystemTime(bogota('2026-03-03T07:30:00'));
    const { updates } = construirDatosDevolucion({ registro });

    expect(updates.tiempo_retraso_devolucion_minutos).toBe(22 * 60 + 30);
  });

  it('usa los datos de quien entrega y no pisa al gestor del préstamo', () => {
    vi.setSystemTime(bogota('2026-03-02T09:30:00'));
    const { mensaje, updates } = construirDatosDevolucion({
      registro,
      entregaInfo: { canal: 'carnet', quien: 'monitor', documento: '999', nombre: 'Luis Paz' },
      gestionadoPorUsuarioId: 5,
    });

    expect(mensaje).toBe('Llave devuelta por Luis Paz');
    expect(updates.tipo_devolucion).toBe('carnet');
    expect(updates.quien_entrega).toBe('monitor');
    expect(updates.nombre_entrega).toBe('Luis Paz');
    expect(updates.gestionado_por_devolucion_usuario_id).toBe(5);
    expect(updates).not.toHaveProperty('gestionado_por_usuario_id');
  });
});

describe('calcularEstadoVisual', () => {
  it('cualquier registro con devolución está entregado', () => {
    expect(calcularEstadoVisual({ estado: 'en_mora', fecha_hora_devolucion: new Date() })).toBe('entregado');
  });

  it('respeta el estado que escribió el scheduler', () => {
    expect(calcularEstadoVisual({ estado: 'en_mora' })).toBe('en_mora');
    expect(calcularEstadoVisual({})).toBe('en_prestamo');
    expect(calcularEstadoVisual(null)).toBe('en_prestamo');
  });
});

describe('toClientFormat', () => {
  it('formatea fechas y horas en Bogotá y descarta los segundos', () => {
    const cliente = toClientFormat({
      id: 1,
      numero_documento: '123.0',
      docente_nombre: 'Ana Ríos',
      fecha_hora_entrega: new Date('2026-03-02T12:30:07Z'),
      fecha_hora_devolucion: new Date('2026-03-03T02:15:59Z'),
    });

    expect(cliente.documento).toBe('123');
    expect(cliente.docente).toBe('Ana Ríos');
    expect(cliente.fechaEntrega).toBe('2026-03-02');
    expect(cliente.horaEntrega).toBe('07:30');
    expect(cliente.fechaDevolucion).toBe('2026-03-02');
    expect(cliente.horaDevolucion).toBe('21:15');
  });

  it('convierte los minutos enteros al texto que ya consume el frontend', () => {
    const cliente = toClientFormat({
      duracion_minutos: 135,
      tiempo_retraso_minutos: 0,
      tiempo_retraso_devolucion_minutos: null,
    });

    expect(cliente.duracion).toBe('2h 15min');
    // 0 es un dato real ("sin retraso"), no un hueco: se formatea, no se vacía.
    expect(cliente.tiempoRetraso).toBe('0min');
    expect(cliente.tiempoRetrasoDevolucion).toBe('');
  });

  it('deja strings vacíos, no fechas inventadas, cuando el registro viene sin datos', () => {
    const cliente = toClientFormat({});

    expect(cliente.fechaEntrega).toBe('');
    expect(cliente.horaEntrega).toBe('');
    expect(cliente.duracion).toBe('');
    expect(cliente.estado).toBe('en_prestamo');
  });

  it('cae al nombre plano del registro cuando el JOIN no trajo `docente_nombre`', () => {
    expect(toClientFormat({ docente: 'Ana Ríos' }).docente).toBe('Ana Ríos');
  });
});
