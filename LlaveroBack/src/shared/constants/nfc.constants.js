'use strict';

const UBICACIONES = Object.freeze({
  OFICINA: 'oficina_centro_servicios_docentes',
  PORTERIA_SUPERIOR: 'porteria_superior',
});

const UBICACIONES_PERMITIDAS = Object.freeze(Object.values(UBICACIONES));
const UBICACIONES_PRESTAMO_EQUIPOS = Object.freeze([UBICACIONES.OFICINA]);

const OPERACIONES_UBICACION = Object.freeze({
  IDENTIFICACION: 'identificacion',
  PRESTAMO_LLAVES: 'prestamo_llaves',
  DEVOLUCION_LLAVES: 'devolucion_llaves',
  // Usado únicamente por `ubicacion.service.js` (tabla `ubicaciones_operativas`,
  // histórica, ya no autoriza nada). Para el permiso de portería sobre
  // equipos (`portero_bloques`) se usa RECEPCION_EQUIPOS: portería nunca
  // puede prestar equipos, solo recibirlos (ver prestamo.service.js).
  PRESTAMO_EQUIPOS: 'prestamo_equipos',
  RECEPCION_EQUIPOS: 'recepcion_equipos',
});

const NFC_MODOS = Object.freeze({
  AUTO: 'auto',
  IDENTIFICACION: 'identificacion',
});

const NFC_MODOS_PERMITIDOS = Object.freeze(Object.values(NFC_MODOS));

module.exports = {
  UBICACIONES,
  UBICACIONES_PERMITIDAS,
  UBICACIONES_PRESTAMO_EQUIPOS,
  OPERACIONES_UBICACION,
  NFC_MODOS,
  NFC_MODOS_PERMITIDOS,
};
