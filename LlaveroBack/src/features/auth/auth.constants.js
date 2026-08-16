'use strict';
/**
 * Auth constants/validation.
 *
 * Antes vivían en `auth.schema.js`, que definía el modelo Mongoose `Usuario`
 * (colección `usuarios`) y el subdocumento embebido `sesiones[]`. Ambos
 * fueron reemplazados en S2 por las tablas `usuarios` / `usuario_sesiones`
 * (migrations/003_usuarios.js) y los repositorios Knex
 * `usuario.repository.js` / `auth.repository.js`. Renombrado a
 * `auth.constants.js` en S7 (cutover final): no queda nada Mongoose en este
 * módulo, solo las constantes/validaciones puras que otros módulos siguen
 * importando.
 */
const { z } = require('zod');

const ROLES = {
  ADMIN: 'admin_programacion',
  AUX: 'auxiliar_programacion',
  PORTERIA: 'porteria',
};

const PROVEEDORES_AUTH = {
  LOCAL: 'local',
  OFFICE365: 'office365',
};

/**
 * Dominios de correo autorizados para login (local u Office365).
 * Único punto de verdad: todo chequeo de dominio debe reutilizar
 * `isDominioAutorizado`, nunca reimplementar la lista en otro módulo.
 */
const DOMINIOS_AUTORIZADOS = ['uco.edu.co', 'uco.net.co'];

/**
 * @param {string} email
 * @returns {boolean} `true` si el dominio del email (case-insensitive) está autorizado.
 */
function isDominioAutorizado(email) {
  const normalizado = String(email || '').trim().toLowerCase();
  const [usuario, dominio] = normalizado.split('@');
  if (!usuario || !dominio) return false;
  return DOMINIOS_AUTORIZADOS.includes(dominio);
}

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede exceder 72 caracteres')
  .regex(/[A-Z]/, 'Debe contener al menos una letra mayúscula')
  .regex(/[a-z]/, 'Debe contener al menos una letra minúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número')
  .regex(/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\/~`]/, 'Debe contener al menos un carácter especial');

module.exports = { ROLES, passwordSchema, PROVEEDORES_AUTH, DOMINIOS_AUTORIZADOS, isDominioAutorizado };
