'use strict';
const knexLib = require('knex');
const { types: pgTypes } = require('pg');
const { createLogger } = require('../utils/logger');
const { buildKnexConfig } = require('./pg.config');

const log = createLogger('Postgres');

/**
 * Por defecto `node-pg` parsea columnas `date` (OID 1082) como objetos
 * `Date` de JS a medianoche en la timezone LOCAL del proceso — ambiguo
 * entre entornos (Docker en UTC vs. desarrollo local) y propenso a
 * desfases de día al serializar con `toISOString()`. S6 introdujo el
 * primer uso real de columnas `date` puras fuera de `programacion_semestres`
 * (`reservas.fecha`) con lógica de negocio que concatena esa fecha con
 * columnas `time` (`_fechaHoraFinReserva` en `reserva.service.js`) — se fija
 * el parser globalmente para devolver el string `YYYY-MM-DD` tal cual llega
 * de Postgres, eliminando la ambigüedad de una vez para toda la app
 * (afecta también a `programacion_semestres.fecha_inicio/fecha_fin`, sin
 * cambio de comportamiento observado ahí porque ya se usaban solo para
 * comparaciones `WHERE`, nunca para aritmética de fechas en JS).
 */
pgTypes.setTypeParser(1082, (val) => val);

class PgClient {
  constructor() {
    this._knex = null;
  }

  /** @returns {Promise<import('knex').Knex>} */
  async connect() {
    if (this._knex) return this._knex;

    try {
      this._knex = knexLib(buildKnexConfig());
      // Verifica que el pool realmente pueda conectar (falla rápido si no).
      await this._knex.raw('select 1');
      log.info(`Conectado a ${process.env.PGDATABASE || 'la base de datos configurada en DATABASE_URL'}`);
      return this._knex;
    } catch (err) {
      log.error('Error de conexión', err);
      throw err;
    }
  }

  async disconnect() {
    if (this._knex) {
      await this._knex.destroy();
      this._knex = null;
    }
    log.info('Desconectado');
  }

  /** @returns {import('knex').Knex} */
  getKnex() {
    if (!this._knex) {
      throw new Error('PgClient no está conectado. Llamar a connect() primero.');
    }
    return this._knex;
  }
}

module.exports = new PgClient();
