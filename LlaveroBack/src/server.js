'use strict';
require('./shared/config/env').loadEnv();
const http = require('http');
const { createLogger } = require('./shared/utils/logger');
const log = createLogger('Server');

const app = require('./app');
const pgClient = require('./shared/db/pg.client');
const ubicacionService = require('./features/ubicaciones/ubicacion.service');
const elementoAfectadoService = require('./features/elementos-afectados/elementoAfectado.service');
const notificacionScheduler = require('./features/notificaciones/notificacion.scheduler');
const usuarioRepository = require('./features/usuarios/usuario.repository');
const { ROLES, PROVEEDORES_AUTH } = require('./features/auth/auth.constants');

const PORT = process.env.PORT || 3001;

// Nota deliberada: las variables Azure/OAuth (AZURE_TENANT_ID,
// AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_REDIRECT_URI,
// OAUTH_STATE_SIGNING_SECRET, FRONTEND_POST_LOGIN_REDIRECT_URL) NO se
// agregan aquí a propósito: el login Office365 debe poder desplegarse (boot
// exitoso) sin credenciales reales de Azure configuradas; solo fallan en el
// momento en que se invoca el flujo OAuth (ver `auth.oauth.js`, que valida
// cada env var perezosamente al construir la URL de autorización o
// intercambiar el code). SUPERADMIN_EMAIL tampoco es requerida: si no está
// seteada, simplemente no se bootstrapea ningún superadmin (ver
// `bootstrapSuperadmin` más abajo).
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Variables de entorno requeridas no definidas: ${missing.join(', ')}`);
  }
}

/**
 * Bootstrap idempotente del usuario superadmin a partir de SUPERADMIN_EMAIL.
 * Si la variable no está seteada, no hace nada. Si el usuario ya existe
 * (búsqueda case-insensitive vía `findByEmail`), tampoco hace nada — permite
 * repetir el boot sin duplicar filas ni fallar. El superadmin se crea con
 * `proveedor_auth='office365'` y `hash_password=null` porque nunca hace
 * login local; solo entra vía Office365, y ese flujo NO auto-crea usuarios
 * regulares (a propósito, para que solo el superadmin quede pre-provisto).
 */
async function bootstrapSuperadmin() {
  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return;

  const existing = await usuarioRepository.findByEmail(email);
  if (existing) {
    log.info('Bootstrap superadmin: ya existe, no se crea de nuevo', { email });
    return;
  }

  await usuarioRepository.create({
    usuario: email,
    nombre: 'Superadmin',
    email,
    contacto: '',
    rol: ROLES.ADMIN,
    hash_password: null,
    proveedor_auth: PROVEEDORES_AUTH.OFFICE365,
    activo: true,
    numero_documento: '',
  });
  log.info('Bootstrap superadmin: usuario creado', { email });
}

async function bootstrap() {
  validateEnv();

  // 1. Conectar PostgreSQL (MongoDB fue retirado por completo en S7 — el
  //    cutover final de la migración Mongo → Postgres).
  await pgClient.connect();
  await bootstrapSuperadmin();
  await ubicacionService.asegurarIniciales();
  await elementoAfectadoService.asegurarIniciales();

  // 2. Crear servidor HTTP. El gateway NFC serie/Socket.IO (lector USB
  //    compartido detrás del servidor) fue retirado: los lectores RFID USB
  //    ahora son teclado-emulado y cada usuario los lee localmente en su
  //    propio navegador, sin servidor de por medio.
  const httpServer = http.createServer(app);

  // 3. Iniciar scheduler de notificaciones automáticas
  notificacionScheduler.iniciar();

  // 4. Escuchar
  httpServer.listen(PORT, () => {
    log.info(`Servidor corriendo en http://localhost:${PORT}`);
    log.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });

  // 5. Manejo de errores no capturados
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', reason);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  log.error('Error iniciando servidor', err);
  process.exit(1);
});
