'use strict';

const path = require('path');

/**
 * Resuelve la configuración de conexión a Postgres a partir de variables de
 * entorno. Usado tanto por `knexfile.js` (migraciones) como por
 * `pg.client.js` (runtime) para que ambos jamás diverjan.
 *
 * Prioridad: `DATABASE_URL` (forma de URL única) si está definida, si no,
 * las variables discretas `PG*`.
 *
 * @returns {import('knex').Knex.Config['connection']}
 */
function resolveConnection() {
  const ssl = process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false;

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl,
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl,
  };
}

const statementTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 15000;

/** @returns {import('knex').Knex.Config} */
function buildKnexConfig() {
  return {
    client: 'pg',
    connection: resolveConnection(),
    pool: {
      min: Number(process.env.PG_POOL_MIN) || 2,
      max: Number(process.env.PG_POOL_MAX) || 10,
      acquireTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 10000,
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
      afterCreate(conn, done) {
        conn.query(`SET statement_timeout = ${statementTimeoutMs}`, (err) => done(err, conn));
      },
    },
    migrations: {
      directory: path.join(__dirname, '..', '..', '..', 'migrations'),
      tableName: 'knex_migrations',
    },
  };
}

module.exports = { resolveConnection, buildKnexConfig };
