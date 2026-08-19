'use strict';

function normalizeString(value = '') {
  return String(value ?? '').trim();
}

function normalizeUpperString(value = '') {
  return normalizeString(value).toUpperCase();
}

function removeDiacritics(value = '') {
  return normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeLookupKey(value = '') {
  return removeDiacritics(value).toLowerCase();
}

function normalizeDocumento(value = '') {
  return normalizeString(value).replace(/\.0+$/, '');
}

/**
 * Quita ceros a la izquierda del ID de carnet. El ETL institucional nunca
 * los envía (el carnet viaja como número, no como texto, en el sistema
 * origen) — si un registro manual sí trae ceros a la izquierda, nunca
 * calzaría contra lo que manda el ETL ni contra lo que lee el lector NFC.
 * Se normaliza a un mismo formato canónico (sin ceros a la izquierda) en
 * todo punto donde se guarda o se busca por carnet.
 */
function normalizeCarnet(value = '') {
  const str = normalizeString(value);
  if (!str) return str;
  const sinCeros = str.replace(/^0+/, '');
  return sinCeros || '0'; // si el valor original era solo ceros, conservar un '0'
}

function normalizeHorario(value = '') {
  return normalizeUpperString(value);
}

function normalizeAula(value = '') {
  return normalizeUpperString(value);
}

function normalizeKey(value = '') {
  return normalizeLookupKey(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

module.exports = {
  normalizeString,
  normalizeUpperString,
  removeDiacritics,
  normalizeLookupKey,
  normalizeDocumento,
  normalizeCarnet,
  normalizeHorario,
  normalizeAula,
  normalizeKey,
};
