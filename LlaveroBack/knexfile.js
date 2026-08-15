'use strict';

require('dotenv').config();
const { buildKnexConfig } = require('./src/shared/db/pg.config');

/** @type {import('knex').Knex.Config} */
const config = buildKnexConfig();

module.exports = {
  development: config,
  production: config,
};
