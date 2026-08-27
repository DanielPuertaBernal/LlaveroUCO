'use strict';

const path = require('path');
const dotenv = require('dotenv');

/**
 * Carga el `.env` único del monorepo, que vive en la raíz del repositorio
 * (un nivel por encima de `LlaveroBack/`), no en el paquete backend.
 *
 * Se resuelve contra `__dirname` y no contra `process.cwd()` a propósito: el
 * runtime arranca desde `LlaveroBack/` (`pnpm dev`) pero las migraciones
 * pueden invocarse desde la raíz, y con `cwd` ambos leerían archivos
 * distintos —o ninguno—. Usado por `server.js` y por `knexfile.js` para que
 * jamás diverjan.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function loadEnv() {
  return dotenv.config({ path: path.join(REPO_ROOT, '.env') });
}

module.exports = { loadEnv, REPO_ROOT };
