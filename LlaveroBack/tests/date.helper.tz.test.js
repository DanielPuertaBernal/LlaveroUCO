/**
 * El horario académico de LlaveroUCO es siempre hora de Bogotá (UTC-5, sin
 * DST), pero el proceso no necesariamente corre ahí: el contenedor de
 * despliegue arranca en UTC. Estos tests fuerzan `TZ=UTC` para verificar que
 * los helpers no dependen del reloj local del proceso.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dateHelper from '../src/shared/utils/date.helper.js';

const {
  getDiaActual,
  getFechaHoy,
  esReclamoAnticipado,
  calcularDuracionClase,
  calcularTiempoRetraso,
  calcularTiempoRetrasoMinutos,
} = dateHelper;

describe('helpers de hora bajo un proceso en UTC', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  // 12:20Z son las 07:20 en Bogotá: 20 minutos después del inicio de clase.
  const AHORA_0720_BOGOTA = new Date('2026-03-02T12:20:00Z');

  it('mide el retraso del reclamo contra la hora de Bogotá, no la del proceso', () => {
    expect(calcularTiempoRetrasoMinutos('07:00 A 08:00', AHORA_0720_BOGOTA)).toBe(20);
    expect(calcularTiempoRetraso('07:00 A 08:00', AHORA_0720_BOGOTA)).toBe('20min');
  });

  it('no da por anticipado un reclamo que en Bogotá ya va tarde', () => {
    expect(esReclamoAnticipado('07:00 A 08:00', AHORA_0720_BOGOTA)).toBe(false);
  });

  // 11:00Z son las 06:00 en Bogotá: una hora antes del inicio.
  it('sigue reconociendo el reclamo anticipado real', () => {
    expect(esReclamoAnticipado('07:00 A 08:00', new Date('2026-03-02T11:00:00Z'))).toBe(true);
  });

  it('mide la duración desde el inicio de clase en hora de Bogotá', () => {
    expect(calcularDuracionClase('07:00 A 08:00', AHORA_0720_BOGOTA)).toBe('20min');
  });

  it('resuelve el día y la fecha de hoy en Bogotá, no en UTC', () => {
    // 2026-03-03T02:30:00Z son las 21:30 del lunes 2 en Bogotá: en UTC ya es
    // martes 3, y ese desfase desalinea cualquier filtro de "hoy".
    vi.setSystemTime(new Date('2026-03-03T02:30:00Z'));

    expect(getDiaActual()).toBe('Lunes');
    expect(getFechaHoy()).toBe('2026-03-02');
  });
});
