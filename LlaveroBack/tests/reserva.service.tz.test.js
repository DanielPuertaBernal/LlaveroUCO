/**
 * Las reservas guardan `fecha` ("YYYY-MM-DD") y `hora_inicio`/`hora_fin`
 * ("HH:MM:SS") como horario de Bogotá. Convertirlas a un instante con
 * `new Date("2026-03-02T14:00:00")` las lee en la zona LOCAL del proceso —
 * en un contenedor UTC eso adelanta la reserva cinco horas y rompe la
 * ventana de cancelación. Estos tests fuerzan `TZ=UTC`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import reservaService from '../src/features/reservas/reserva.service.js';

describe('instantes de una reserva bajo un proceso en UTC', () => {
  beforeEach(() => vi.stubEnv('TZ', 'UTC'));
  afterEach(() => vi.unstubAllEnvs());

  const reserva = { fecha: '2026-03-02', hora_inicio: '14:00:00', hora_fin: '16:00:00' };

  it('ancla el inicio y el fin a la hora de Bogotá', () => {
    // 14:00 y 16:00 en Bogotá son 19:00Z y 21:00Z.
    expect(reservaService._fechaHoraInicioReserva(reserva).toISOString())
      .toBe('2026-03-02T19:00:00.000Z');
    expect(reservaService._fechaHoraFinReserva(reserva).toISOString())
      .toBe('2026-03-02T21:00:00.000Z');
  });

  it('deja cancelar mientras la reserva no ha terminado en Bogotá', () => {
    // 20:30Z son las 15:30 de Bogotá: la reserva sigue en curso.
    const fin = reservaService._fechaHoraFinReserva(reserva);
    expect(new Date('2026-03-02T20:30:00Z') >= fin).toBe(false);
  });

  it('devuelve null cuando la reserva no tiene fecha u hora', () => {
    expect(reservaService._fechaHoraInicioReserva({ fecha: '2026-03-02' })).toBeNull();
    expect(reservaService._fechaHoraFinReserva({ hora_fin: '16:00:00' })).toBeNull();
    expect(reservaService._fechaHoraInicioReserva(null)).toBeNull();
  });
});
