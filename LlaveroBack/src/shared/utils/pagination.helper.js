'use strict';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Extrae parámetros de paginación desde query params.
 * Si no se envían, retorna null (sin paginación).
 */
function parsePagination(query = {}) {
  const page = parseInt(query.page, 10);
  const limit = parseInt(query.limit, 10);
  if (!page || page < 1) return null;
  return {
    page,
    limit: Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT),
  };
}

/**
 * Aplica paginación a un query builder de Knex.
 *
 * El modo legado Mongoose fue retirado por completo en S7 (cutover final de
 * la migración Mongo → Postgres); todas las features usan Postgres desde S6.
 *
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {{ page: number, limit: number } | null} pagination
 * @returns {Promise<{ data: any[], meta?: { page, limit, total, totalPages } }>}
 */
async function applyPagination(query, pagination) {
  if (!pagination) {
    const data = await query;
    return { data };
  }

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [data, countResult] = await Promise.all([
    query.clone().offset(offset).limit(limit),
    query.clone().clearSelect().clearOrder().count({ total: '*' }).first(),
  ]);
  const total = Number(countResult?.total || 0);
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

module.exports = { parsePagination, applyPagination, DEFAULT_LIMIT, MAX_LIMIT };
