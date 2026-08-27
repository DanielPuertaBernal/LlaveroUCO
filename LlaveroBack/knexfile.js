'use strict';

require('./src/shared/config/env').loadEnv();
const { buildKnexConfig } = require('./src/shared/db/pg.config');

/** @type {import('knex').Knex.Config} */
const config = buildKnexConfig();

module.exports = {
  development: config,
  production: config,
};
