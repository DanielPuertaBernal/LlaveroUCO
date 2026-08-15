'use strict';

/**
 * Fase S2 de la migración Mongo → Postgres: auth / usuarios.
 *
 * Reemplaza la colección Mongoose `usuarios` (definida en
 * src/features/auth/auth.schema.js, re-exportada por
 * src/features/usuarios/usuario.schema.js) y su subdocumento embebido
 * `usuarios.sesiones[]` (refresh tokens JWT) por dos tablas relacionales:
 *   - usuarios: la fila del usuario/autenticación local.
 *   - usuario_sesiones: una fila por sesión de refresh token, FK a usuarios.
 *
 * Ambas incluyen las columnas universales (id uuid v7 generado por la app,
 * created_at/updated_at/deleted_at) y el trigger set_updated_at creado en
 * 001_extensions_and_functions.js.
 *
 * FK policy: usuario_sesiones.usuario_id usa ON DELETE RESTRICT, siguiendo la
 * regla universal del diseño ("every FK is ON DELETE RESTRICT"); no hay
 * excepción documentada para esta tabla. El borrado de un usuario con
 * sesiones activas queda bloqueado a nivel de aplicación (revocar/():
 * limpiar sesiones antes de desactivar), no vía cascada silenciosa.
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- usuarios --------------------------------------------------------
  await knex.raw(`
    CREATE TABLE usuarios (
      ${UNIVERSAL_COLUMNS_SQL},
      usuario text NOT NULL,
      nombre text NOT NULL,
      email text NOT NULL,
      contacto text DEFAULT '',
      rol text NOT NULL CHECK (rol IN ('admin_programacion', 'auxiliar_programacion')),
      hash_password text NOT NULL,
      activo bool NOT NULL DEFAULT true,
      numero_documento text DEFAULT ''
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_usuarios_usuario
      ON usuarios (usuario) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_usuarios_email
      ON usuarios (email) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON usuarios
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- usuario_sesiones (era usuarios.sesiones[] embebido) --------------
  await knex.raw(`
    CREATE TABLE usuario_sesiones (
      ${UNIVERSAL_COLUMNS_SQL},
      usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      token_hash text NOT NULL,
      user_agent text DEFAULT '',
      ip inet NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz NULL
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_usuario_sesiones_token_hash
      ON usuario_sesiones (token_hash) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_usuario_sesiones_usuario_id ON usuario_sesiones (usuario_id)');
  await knex.raw('CREATE INDEX idx_usuario_sesiones_expires_at ON usuario_sesiones (expires_at)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON usuario_sesiones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS usuario_sesiones');
  await knex.raw('DROP TABLE IF EXISTS usuarios');
};
