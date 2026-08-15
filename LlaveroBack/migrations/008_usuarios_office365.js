'use strict';

/**
 * Login por Office 365 (Azure AD, authorization-code flow) junto al login
 * local existente (migrations/003_usuarios.js). Ambos coexisten: el nuevo
 * flujo NO reemplaza el login local.
 *
 * Cambios sobre `usuarios`:
 *  - `proveedor_auth text NOT NULL DEFAULT 'local' CHECK (... IN ('local',
 *    'office365'))`: distingue usuarios autenticados con password local de
 *    los autenticados vía Azure AD.
 *  - `hash_password` pasa a NULLABLE: los usuarios Office365 no tienen
 *    password local (nunca hacen login por `/api/auth/login`).
 *  - El CHECK de `rol` se amplía para incluir `'superadmin'` (mantiene
 *    `admin_programacion` y `auxiliar_programacion`). El superadmin se
 *    bootstrapea al boot de la app desde `SUPERADMIN_EMAIL`
 *    (ver `src/server.js`), no por esta migración.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE usuarios
      ADD COLUMN proveedor_auth text NOT NULL DEFAULT 'local'
        CHECK (proveedor_auth IN ('local', 'office365'))
  `);

  await knex.raw('ALTER TABLE usuarios ALTER COLUMN hash_password DROP NOT NULL');

  await knex.raw('ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check');
  await knex.raw(`
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rol_check
        CHECK (rol IN ('admin_programacion', 'auxiliar_programacion', 'superadmin'))
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check');
  await knex.raw(`
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rol_check
        CHECK (rol IN ('admin_programacion', 'auxiliar_programacion'))
  `);

  // Antes de forzar NOT NULL, cualquier fila office365 sin password
  // quedaría inválida; esta migración es de la fase de introducción de la
  // feature, no se espera down() en producción con filas office365 reales.
  await knex.raw("UPDATE usuarios SET hash_password = '' WHERE hash_password IS NULL");
  await knex.raw('ALTER TABLE usuarios ALTER COLUMN hash_password SET NOT NULL');

  await knex.raw('ALTER TABLE usuarios DROP COLUMN proveedor_auth');
};
