'use strict';
/**
 * Date Helper - Equivale a application/helpers/date_helper.py y time_helper.py
 */

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Toda la operación de LlaveroUCO ocurre en hora de Bogotá (UTC-5, sin DST),
 * pero el proceso no corre necesariamente ahí: el contenedor de despliegue
 * arranca en UTC. Leer `getHours()`/`getDay()` del `Date` toma el reloj LOCAL
 * del proceso y desplaza el horario académico cinco horas — un reclamo de las
 * 07:20 se leía como las 12:20 y fabricaba 320 minutos de retraso. Las dos
 * funciones de abajo son el único punto donde un instante se traduce a
 * "fecha/hora del día" para el negocio.
 */
const TZ_BOGOTA = 'America/Bogota';

/** Fecha calendario ("YYYY-MM-DD") del instante, en Bogotá. */
function fechaEnBogota(fecha = new Date()) {
  return fecha.toLocaleDateString('en-CA', { timeZone: TZ_BOGOTA });
}

/** Hora del reloj de Bogotá ("HH:MM", 24h) para ese instante. */
function horaEnBogota(fecha = new Date()) {
  return fecha.toLocaleTimeString('en-GB', {
    timeZone: TZ_BOGOTA,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Minutos transcurridos desde la medianoche de Bogotá para ese instante. */
function minutosDelDiaEnBogota(fecha = new Date()) {
  return horaAMinutos(horaEnBogota(fecha));
}

/**
 * Camino inverso: una fecha ("YYYY-MM-DD") y una hora ("HH:MM" o "HH:MM:SS")
 * del negocio se leen COMO horario de Bogotá y se devuelven como instante
 * absoluto. `new Date(`${fecha}T${hora}`)` sin offset las interpretaría en la
 * zona local del proceso — en un contenedor UTC, una reserva de las 14:00
 * quedaría anclada a las 09:00 de Bogotá.
 * @returns {Date|null} null si falta la fecha o la hora no es parseable
 */
function instanteEnBogota(fechaStr, horaStr) {
  const parsed = parseHora(horaStr);
  if (!fechaStr || !parsed) return null;
  const dia = String(fechaStr).slice(0, 10);
  const hh = String(parsed.hours).padStart(2, '0');
  const mm = String(parsed.minutes).padStart(2, '0');
  const fecha = new Date(`${dia}T${hh}:${mm}:00-05:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Formatea una cantidad de minutos en texto legible (min / h min / d h min)
 * @param {number} minutos
 * @returns {string} Ej: "45min", "2h 15min", "3d 8h 33min"
 */
function formatMinutos(minutos) {
  const total = Math.max(0, Math.round(minutos));
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (mins > 0 || partes.length === 0) partes.push(`${mins}min`);
  return partes.join(' ');
}

/**
 * Retorna el nombre del día actual en español, según el calendario de Bogotá.
 * @returns {string} Ej: "Lunes"
 */
function getDiaActual() {
  // El mediodía UTC de esa fecha cae en el mismo día calendario en cualquier
  // zona, así que `getUTCDay()` sobre él da el día de la semana sin volver a
  // depender del reloj local.
  return DIAS_ES[new Date(`${fechaEnBogota()}T12:00:00Z`).getUTCDay()];
}

/**
 * Retorna la fecha actual en formato YYYY-MM-DD, en hora de Bogotá.
 * `toISOString()` da la fecha en UTC — eso ya muestra el día siguiente entre
 * las 7pm y medianoche de Bogotá, desalineando esta fecha con `getDiaActual()`
 * y con cualquier filtro de "hoy".
 * @returns {string}
 */
function getFechaHoy() {
  return fechaEnBogota();
}

/**
 * Bordes del día calendario de Bogotá para una fecha "YYYY-MM-DD" (acepta un
 * ISO completo y se queda con su parte de fecha), como par [inicio, fin] de
 * instantes absolutos. Sin el offset explícito, `new Date(`${fecha}T00:00:00`)`
 * abre el día en la zona del proceso: en UTC el rango se corre cinco horas y
 * un reporte "de hoy" arrastra la madrugada del día siguiente.
 *
 * El cierre es 23:59:59.999 y no la medianoche siguiente porque los filtros
 * que lo consumen usan `whereBetween`, que es inclusivo en ambos extremos.
 * @param {string} fechaStr
 * @returns {[Date, Date]|null} null si la fecha no es parseable
 */
function rangoDelDiaEnBogota(fechaStr) {
  const dia = String(fechaStr ?? '').slice(0, 10);
  const inicio = new Date(`${dia}T00:00:00.000-05:00`);
  const fin = new Date(`${dia}T23:59:59.999-05:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
  return [inicio, fin];
}

/**
 * Parsea una hora en formato "HH:MM" o "HH:MM:SS" y retorna objeto {hours, minutes}
 * @param {string} horaStr
 * @returns {{hours: number, minutes: number} | null}
 */
function parseHora(horaStr) {
  if (!horaStr) return null;
  const parts = String(horaStr).trim().split(':');
  if (parts.length < 2) return null;
  return {
    hours: parseInt(parts[0], 10),
    minutes: parseInt(parts[1], 10),
  };
}

/**
 * Convierte hora "HH:MM" a minutos desde medianoche
 * @param {string} horaStr
 * @returns {number | null}
 */
function horaAMinutos(horaStr) {
  const parsed = parseHora(horaStr);
  if (!parsed) return null;
  return parsed.hours * 60 + parsed.minutes;
}

/**
 * Ancla la hora de fin de un `horario` ("HH:MM A HH:MM") al día calendario
 * de `fechaBase` (Date o string "YYYY-MM-DD"/ISO), devolviendo un `Date`
 * absoluto en hora Bogotá (UTC-5). Usado por `calcularRetrasoDevolucion(Minutos)`
 * para comparar por timestamp real en vez de solo minuto-del-día — así un
 * retraso que cruza medianoche (llave devuelta al día siguiente) se computa
 * correctamente en vez de compararse contra la hora actual como si fuera el
 * mismo día de la entrega.
 * @param {string} horaFinStr  Ej: "09:00"
 * @param {Date|string} fechaBase
 * @returns {Date|null}
 */
function anclarHoraFinADia(horaFinStr, fechaBase) {
  const fechaStr = fechaBase instanceof Date ? fechaEnBogota(fechaBase) : fechaBase;
  return instanteEnBogota(fechaStr, horaFinStr);
}

/**
 * Evalúa si hay retraso en DEVOLUCIÓN (> 1 hora después de fin de clase).
 *
 * Bugfix: la versión anterior solo comparaba `ahora.getHours()*60+minutes`
 * contra `horaFin+60`, sin mirar cuántos días calendario pasaron desde
 * `fechaEntrega` — una llave devuelta un día (o más) después, a una hora del
 * día que por sí sola luce "temprana", se clasificaba como a tiempo. Ahora
 * se ancla `horaFin` al día calendario real de `fechaEntrega` y se compara
 * por timestamp absoluto contra `ahora`, así el retraso se detecta sin
 * importar cuántos días transcurrieron.
 * @param {string} horario  Ej: "07:00 A 09:00"
 * @param {Date|string} fechaEntrega  Fecha (Date) o "YYYY-MM-DD" del día de la entrega
 * @param {Date} ahora
 * @returns {string} Descripción del retraso o string vacío
 */
function calcularRetrasoDevolucion(horario, fechaEntrega, ahora = new Date()) {
  const minutos = calcularRetrasoDevolucionMinutos(horario, fechaEntrega, ahora);
  return minutos ? formatMinutos(minutos) : '';
}

/**
 * Calcula la duración entre entrega y devolución
 * @param {Date} fechaEntrega
 * @param {Date} ahora
 * @returns {string}
 */
function calcularDuracion(fechaEntrega, ahora = new Date()) {
  try {
    if (!fechaEntrega) return '';
    const diffMs = ahora - fechaEntrega;
    const diffMin = Math.floor(diffMs / 60000);
    return formatMinutos(diffMin);
  } catch {
    return '';
  }
}

/**
 * Verifica si hay gap mínimo de 30 min entre clases continuas del mismo docente
 * Equivale a ProgramacionCleaner.evaluar_clases_continuas
 * @param {Array<{horaFin: string}>} clasesDocente  Clases del docente ordenadas
 * @param {string} nuevaHoraInicio
 * @returns {boolean} true si hay gap suficiente o no hay clases previas
 */
function tieneGapMinimo(clasesDocente, nuevaHoraInicio, gapMinutos = 30) {
  if (!clasesDocente.length) return true;
  const ultimaClase = clasesDocente[clasesDocente.length - 1];
  const finUltima = horaAMinutos(ultimaClase.horaFin);
  const inicioNueva = horaAMinutos(nuevaHoraInicio);
  if (finUltima === null || inicioNueva === null) return true;
  return (inicioNueva - finUltima) >= gapMinutos;
}

/**
 * Verifica si el reclamo es anticipado (más de 30 minutos antes del inicio de la clase)
 * Dentro de 30 min antes se considera reclamo normal a tiempo
 * @param {string} horario  Ej: "07:00 A 09:00"
 * @param {Date} ahora
 * @returns {boolean}
 */
function esReclamoAnticipado(horario, ahora = new Date()) {
  try {
    if (!horario) return false;
    const partes = String(horario).toUpperCase().split(' A ');
    if (partes.length < 1) return false;
    const horaInicio = horaAMinutos(partes[0].trim());
    if (horaInicio === null) return false;
    const minutosAhora = minutosDelDiaEnBogota(ahora);
    return minutosAhora < horaInicio - 30;
  } catch {
    return false;
  }
}

/**
 * Calcula duración desde el inicio de la clase hasta la devolución
 * @param {string} horario  Ej: "07:00 A 09:00"
 * @param {Date} fechaDevolucion
 * @returns {string}
 */
function calcularDuracionClase(horario, fechaDevolucion = new Date()) {
  try {
    if (!horario) return '';
    const partes = String(horario).toUpperCase().split(' A ');
    if (partes.length < 1) return '';
    const horaInicio = horaAMinutos(partes[0].trim());
    if (horaInicio === null) return '';
    const minutosDevolucion = minutosDelDiaEnBogota(fechaDevolucion);
    const diffMin = minutosDevolucion - horaInicio;
    if (diffMin <= 0) return '0min';
    return formatMinutos(diffMin);
  } catch {
    return '';
  }
}

/**
 * Calcula tiempo de retraso al reclamar llave después del inicio de clase
 * @param {string} horario  Ej: "07:00 A 09:00"
 * @param {Date} ahora
 * @returns {string}
 */
function calcularTiempoRetraso(horario, ahora = new Date()) {
  try {
    if (!horario) return '';
    const partes = String(horario).toUpperCase().split(' A ');
    if (partes.length < 1) return '';
    const horaInicio = horaAMinutos(partes[0].trim());
    if (horaInicio === null) return '';
    const minutosAhora = minutosDelDiaEnBogota(ahora);
    const diff = minutosAhora - horaInicio;
    if (diff <= 0) return '';
    return formatMinutos(diff);
  } catch {
    return '';
  }
}

/**
 * Variante numérica de `calcularRetrasoDevolucion` — Postgres S4 almacena
 * `tiempo_retraso_devolucion_minutos` (int) en vez del string formateado
 * ("2h 15min") que usaba Mongo; el formateo para el cliente se hace en
 * `llave.domain.js` con `formatMinutos` al leer.
 * @param {string} horario @param {Date|string} fechaEntrega Fecha (Date) o "YYYY-MM-DD" del día de la entrega
 * @param {Date} ahora
 * @returns {number|null} Minutos de retraso, o null si no hay retraso
 */
function calcularRetrasoDevolucionMinutos(horario, fechaEntrega, ahora = new Date()) {
  try {
    if (!horario || !fechaEntrega) return null;
    const partes = String(horario).toUpperCase().split(' A ');
    if (partes.length < 2) return null;

    const limiteFin = anclarHoraFinADia(partes[1].trim(), fechaEntrega);
    if (!limiteFin) return null;

    // Comparación por timestamp absoluto (no minuto-del-día): así una
    // devolución uno o más días calendario después de `limiteFin` se marca
    // como retraso real, aunque la hora del reloj de `ahora` sea "temprana".
    const umbralMs = limiteFin.getTime() + 60 * 60000; // 1 hora de gracia
    if (ahora.getTime() > umbralMs) {
      return Math.floor((ahora.getTime() - limiteFin.getTime()) / 60000);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Variante numérica de `calcularDuracion` — ver nota de
 * `calcularRetrasoDevolucionMinutos`.
 * @param {Date} fechaEntrega @param {Date} ahora
 * @returns {number|null} Minutos transcurridos, o null si no hay fecha de entrega
 */
function calcularDuracionMinutos(fechaEntrega, ahora = new Date()) {
  try {
    if (!fechaEntrega) return null;
    const diffMs = ahora - fechaEntrega;
    return Math.max(0, Math.floor(diffMs / 60000));
  } catch {
    return null;
  }
}

/**
 * Variante numérica de `calcularTiempoRetraso` — ver nota de
 * `calcularRetrasoDevolucionMinutos`.
 * @param {string} horario @param {Date} ahora
 * @returns {number|null} Minutos de retraso al reclamar, o null si no hay retraso
 */
function calcularTiempoRetrasoMinutos(horario, ahora = new Date()) {
  try {
    if (!horario) return null;
    const partes = String(horario).toUpperCase().split(' A ');
    if (partes.length < 1) return null;
    const horaInicio = horaAMinutos(partes[0].trim());
    if (horaInicio === null) return null;
    const minutosAhora = minutosDelDiaEnBogota(ahora);
    const diff = minutosAhora - horaInicio;
    return diff > 0 ? diff : null;
  } catch {
    return null;
  }
}

module.exports = {
  TZ_BOGOTA,
  fechaEnBogota,
  horaEnBogota,
  minutosDelDiaEnBogota,
  instanteEnBogota,
  rangoDelDiaEnBogota,
  getDiaActual,
  getFechaHoy,
  horaAMinutos,
  formatMinutos,
  calcularRetrasoDevolucion,
  calcularRetrasoDevolucionMinutos,
  calcularDuracion,
  calcularDuracionMinutos,
  calcularDuracionClase,
  calcularTiempoRetraso,
  calcularTiempoRetrasoMinutos,
  esReclamoAnticipado,
  tieneGapMinimo,
  DIAS_ES,
};
