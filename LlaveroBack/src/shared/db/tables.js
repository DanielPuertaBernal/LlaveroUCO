'use strict';

/**
 * Constantes con los nombres de tabla de Postgres.
 * Los repositorios importan de aquí en vez de codificar strings sueltos,
 * y reemplazan los antiguos imports de modelos Mongoose.
 */
const TABLES = Object.freeze({
  // Catálogos / referencia
  BLOQUES: 'bloques',
  TIPOS_SILLETERIA: 'tipos_silleteria',
  SALONES: 'salones',
  CONFIGURACION_BLOQUES: 'configuracion_bloques',
  UBICACIONES_OPERATIVAS: 'ubicaciones_operativas',
  ELEMENTOS_AFECTADOS: 'elementos_afectados',
  COMUNIDAD: 'comunidad',
  EQUIPOS: 'equipos',

  // Auth
  USUARIOS: 'usuarios',
  USUARIO_SESIONES: 'usuario_sesiones',
  PORTERO_BLOQUES: 'portero_bloques',

  // Programación
  PROGRAMACION_SEMESTRES: 'programacion_semestres',
  PROGRAMACIONES: 'programaciones',
  PROGRAMACIONES_REGULARES: 'programaciones_regulares',
  PROGRAMACIONES_SEMESTRALES: 'programaciones_semestrales',
  PROGRAMACIONES_FANTASMA: 'programaciones_fantasma',
  V_PROGRAMACIONES: 'v_programaciones',

  // Llaves
  REGISTROS_LLAVES: 'registros_llaves',

  // Préstamos de equipos
  PRESTAMOS: 'prestamos',
  PRESTAMO_EQUIPOS: 'prestamo_equipos',
  DEVOLUCIONES: 'devoluciones',
  DEVOLUCION_EQUIPOS: 'devolucion_equipos',

  // Monitores, reservas, NFC, notificaciones, novedades
  MONITORES: 'monitores',
  RESERVAS: 'reservas',
  NFC_EVENTOS: 'nfc_eventos',
  NOTIFICACIONES: 'notificaciones',
  NOVEDADES: 'novedades',
});

module.exports = { TABLES };
