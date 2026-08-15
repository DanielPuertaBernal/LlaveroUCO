'use strict';

const { uuidv7 } = require('uuidv7');

/**
 * Genera un UUID v7 (ordenado temporalmente) para usar como id de fila.
 * Toda inserción en Postgres debe fijar `id` explícitamente con este valor;
 * las columnas `id` no tienen default en la base de datos.
 * @returns {string} UUID v7
 */
function newId() {
  return uuidv7();
}

module.exports = { newId };
