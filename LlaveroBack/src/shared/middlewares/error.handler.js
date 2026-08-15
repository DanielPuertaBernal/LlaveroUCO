'use strict';
const { createLogger } = require('../utils/logger');
const log = createLogger('ErrorHandler');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  log.error(`${req.method} ${req.path}`, err);

  // Zod validation error
  if (err.name === 'ZodError') {
    return res.status(400).json({
      ok: false,
      message: 'Datos inválidos',
      errors: err.errors.map((e) => ({ campo: e.path.join('.'), mensaje: e.message })),
    });
  }

  // Postgres: violación de unicidad (unique_violation)
  if (err.code === '23505') {
    return res.status(409).json({
      ok: false,
      message: 'Ya existe un registro con esos datos',
    });
  }

  // Postgres: violación de FK / restrict_violation (borrado bloqueado por hijos activos)
  if (err.code === '23503' || err.code === '23001') {
    return res.status(409).json({
      ok: false,
      message: 'Conflicto de datos: la operación afecta registros relacionados',
    });
  }

  // Postgres: violación de CHECK constraint
  if (err.code === '23514') {
    return res.status(422).json({
      ok: false,
      message: 'Datos inválidos: no cumplen las reglas del sistema',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ ok: false, message: 'Token inválido' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ ok: false, message: 'Token expirado' });
  }

  // Errores con statusCode personalizados
  const status = err.statusCode || err.status || 500;
  const message = status < 500 ? err.message : 'Error interno del servidor';
  const body = { ok: false, message };
  if (err.data !== undefined) body.data = err.data;

  return res.status(status).json(body);
}

module.exports = errorHandler;
