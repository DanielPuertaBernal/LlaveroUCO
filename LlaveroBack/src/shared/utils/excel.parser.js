'use strict';
/**
 * Excel Parser - Reemplaza pandas/openpyxl de Python
 * Lee archivos Excel y retorna arrays de objetos
 */
// xlsx@0.18.5 is the last version published to npm; SheetJS has shipped newer
// releases upstream (only via their own CDN) that fix known CVEs (prototype
// pollution, ReDoS) that remain unpatched here. Migrating to a maintained
// alternative (e.g. exceljs) is a deliberate follow-up decision, not done in
// this fix, since it would require re-verifying every import/export code path
// without a test suite to catch regressions.
const XLSX = require('xlsx');
const ApiError = require('../errors/api.error');

/** Hard cap on rows accepted from an uploaded Excel file, checked right after
 * sheet_to_json runs and before any further processing. Comfortably above any
 * realistic real-semester class-schedule row count. */
const MAX_IMPORT_ROWS = 20000;

/**
 * Parsea un buffer o path de Excel y retorna array de objetos
 * @param {Buffer|string} input - Buffer del archivo o path
 * @param {object} options
 * @param {number} [options.headerRow=1] - Fila donde están los encabezados (1-indexed)
 * @param {string} [options.sheet] - Nombre de la hoja (default: primera hoja)
 * @returns {Array<object>}
 */
function parseExcel(input, options = {}) {
  const workbook = typeof input === 'string'
    ? XLSX.readFile(input)
    : XLSX.read(input, { type: 'buffer' });

  const sheetName = options.sheet || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`Hoja "${sheetName}" no encontrada en el archivo`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false, // convierte números a string para fechas/horas
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw ApiError.badRequest(
      `El archivo tiene demasiadas filas (máximo ${MAX_IMPORT_ROWS})`
    );
  }

  return rows;
}

/**
 * Limpia texto de caracteres especiales (equivale a ProgramacionCleaner.limpiar_texto)
 * @param {*} value
 * @returns {string}
 */
function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/_x000D_/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpia número de documento (elimina .0 al final)
 * @param {*} doc
 * @returns {string}
 */
function cleanDocumento(doc) {
  if (doc === null || doc === undefined) return '';
  const str = String(doc);
  return str.endsWith('.0') ? str.slice(0, -2) : str;
}

/**
 * Neutraliza un valor de texto que podría ser interpretado como fórmula
 * por Excel/Sheets al abrir el archivo exportado (CSV/formula injection).
 * @param {*} value
 * @returns {*}
 */
function neutralizeFormulaInjection(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Aplica neutralizeFormulaInjection a cada valor de tipo string de una fila,
 * de forma genérica (no depende de nombres de columnas específicos).
 * @param {object} row
 * @returns {object}
 */
function sanitizeRowForExport(row) {
  const sanitized = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = neutralizeFormulaInjection(value);
  }
  return sanitized;
}

/**
 * Genera un buffer Excel desde un array de objetos (reemplaza pandas to_excel)
 * @param {Array<object>} data
 * @param {string} [sheetName='Hoja1']
 * @returns {Buffer}
 */
function generateExcel(data, sheetName = 'Hoja1') {
  const safeData = data.map(sanitizeRowForExport);
  const worksheet = XLSX.utils.json_to_sheet(safeData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera un buffer Excel con múltiples hojas.
 * @param {Array<{name: string, data: Array<object>}>} sheets
 * @returns {Buffer}
 */
function generateExcelMultiSheet(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    const safeData = data.map(sanitizeRowForExport);
    const worksheet = XLSX.utils.json_to_sheet(safeData);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseExcel,
  cleanText,
  cleanDocumento,
  generateExcel,
  generateExcelMultiSheet,
  neutralizeFormulaInjection,
  sanitizeRowForExport,
};
