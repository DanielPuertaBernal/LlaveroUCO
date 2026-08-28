import { describe, it, expect } from 'vitest';
import dateHelper from '../src/shared/utils/date.helper.js';

const {
  horaAMinutos,
  formatMinutos,
  calcularDuracionMinutos,
  calcularRetrasoDevolucionMinutos,
  esReclamoAnticipado,
  tieneGapMinimo,
} = dateHelper;

describe('horaAMinutos', () => {
  it('convierte una hora a minutos desde medianoche', () => {
    expect(horaAMinutos('00:00')).toBe(0);
    expect(horaAMinutos('07:30')).toBe(450);
    expect(horaAMinutos('23:59')).toBe(1439);
  });

  it('devuelve null en vez de NaN cuando la entrada no sirve', () => {
    expect(horaAMinutos('')).toBeNull();
    expect(horaAMinutos(null)).toBeNull();
    expect(horaAMinutos('no es una hora')).toBeNull();
  });
});

describe('formatMinutos', () => {
  it('escala de minutos a días', () => {
    expect(formatMinutos(45)).toBe('45min');
    expect(formatMinutos(135)).toBe('2h 15min');
    expect(formatMinutos(4713)).toBe('3d 6h 33min');
  });

  it('omite las unidades en cero salvo que no quede nada que mostrar', () => {
    expect(formatMinutos(120)).toBe('2h');
    expect(formatMinutos(1440)).toBe('1d');
    expect(formatMinutos(0)).toBe('0min');
  });

  it('no produce duraciones negativas', () => {
    expect(formatMinutos(-30)).toBe('0min');
  });
});

describe('calcularDuracionMinutos', () => {
  it('mide el intervalo entre dos instantes', () => {
    const inicio = new Date('2026-08-27T10:00:00Z');
    const fin = new Date('2026-08-27T12:30:00Z');
    expect(calcularDuracionMinutos(inicio, fin)).toBe(150);
  });

  it('cuenta correctamente cruzando la medianoche', () => {
    const inicio = new Date('2026-08-27T23:30:00Z');
    const fin = new Date('2026-08-28T00:30:00Z');
    expect(calcularDuracionMinutos(inicio, fin)).toBe(60);
  });
});

describe('calcularRetrasoDevolucionMinutos', () => {
  // El motivo de que esta función ancle la hora de fin a un día calendario:
  // comparar solo el minuto-del-día haría que una llave devuelta al día
  // siguiente apareciera como devuelta temprano.
  const horario = '07:00 A 09:00';
  const diaEntrega = '2026-08-27';

  it('no marca retraso cuando se devuelve antes del fin de la clase', () => {
    const ahora = new Date('2026-08-27T13:30:00Z'); // 08:30 Bogotá
    expect(calcularRetrasoDevolucionMinutos(horario, diaEntrega, ahora)).toBeNull();
  });

  // Hay una hora de gracia después del fin de clase: devolver dentro de esa
  // ventana no cuenta como retraso.
  it('no marca retraso dentro de la hora de gracia', () => {
    const ahora = new Date('2026-08-27T14:45:00Z'); // 09:45 Bogotá, 45min pasado
    expect(calcularRetrasoDevolucionMinutos(horario, diaEntrega, ahora)).toBeNull();
  });

  it('tampoco marca retraso en el borde exacto de la gracia', () => {
    const ahora = new Date('2026-08-27T15:00:00Z'); // 10:00 Bogotá, exactamente 60min
    expect(calcularRetrasoDevolucionMinutos(horario, diaEntrega, ahora)).toBeNull();
  });

  it('cuenta desde el fin de clase, no desde el fin de la gracia', () => {
    const ahora = new Date('2026-08-27T15:30:00Z'); // 10:30 Bogotá
    expect(calcularRetrasoDevolucionMinutos(horario, diaEntrega, ahora)).toBe(90);
  });

  it('acumula el retraso de una devolución al día siguiente, no lo reinicia', () => {
    const ahora = new Date('2026-08-28T14:00:00Z'); // 09:00 Bogotá del día después
    expect(calcularRetrasoDevolucionMinutos(horario, diaEntrega, ahora)).toBe(1440);
  });

  it('devuelve null cuando falta el horario o la fecha de entrega', () => {
    expect(calcularRetrasoDevolucionMinutos('', diaEntrega)).toBeNull();
    expect(calcularRetrasoDevolucionMinutos(horario, null)).toBeNull();
  });

  it('devuelve null cuando el horario no trae hora de fin', () => {
    expect(calcularRetrasoDevolucionMinutos('07:00', diaEntrega)).toBeNull();
  });
});

describe('esReclamoAnticipado', () => {
  // La ventana de 30 minutos antes de la clase cuenta como reclamo normal.
  const horario = '07:00 A 09:00';
  const alas = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };

  it('marca anticipado más de 30 minutos antes del inicio', () => {
    expect(esReclamoAnticipado(horario, alas(6, 0))).toBe(true);
  });

  it('no marca anticipado dentro de la ventana de 30 minutos', () => {
    expect(esReclamoAnticipado(horario, alas(6, 45))).toBe(false);
  });

  it('trata el borde exacto de los 30 minutos como reclamo normal', () => {
    expect(esReclamoAnticipado(horario, alas(6, 30))).toBe(false);
  });

  it('no marca anticipado si la clase ya empezó', () => {
    expect(esReclamoAnticipado(horario, alas(7, 30))).toBe(false);
  });

  it('devuelve false ante un horario inutilizable en vez de lanzar', () => {
    expect(esReclamoAnticipado('', alas(6, 0))).toBe(false);
    expect(esReclamoAnticipado('cualquier cosa', alas(6, 0))).toBe(false);
  });
});

describe('tieneGapMinimo', () => {
  // Regla de negocio: 30 minutos entre clases continuas del mismo docente.
  it('acepta cuando el docente no tiene clases previas', () => {
    expect(tieneGapMinimo([], '07:00')).toBe(true);
  });

  it('rechaza cuando el hueco es menor al mínimo', () => {
    expect(tieneGapMinimo([{ horaFin: '09:00' }], '09:15')).toBe(false);
  });

  it('acepta el borde exacto de 30 minutos', () => {
    expect(tieneGapMinimo([{ horaFin: '09:00' }], '09:30')).toBe(true);
  });

  it('mide contra la última clase, no contra la primera', () => {
    const clases = [{ horaFin: '08:00' }, { horaFin: '11:00' }];
    expect(tieneGapMinimo(clases, '11:10')).toBe(false);
  });

  it('acepta cuando alguna hora es ilegible, para no bloquear por un dato sucio', () => {
    expect(tieneGapMinimo([{ horaFin: 'ilegible' }], '09:15')).toBe(true);
  });
});
