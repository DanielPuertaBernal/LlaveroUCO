'use strict';

/**
 * Rol "portería" con permisos por bloque, y trazabilidad de quién gestionó
 * cada operación de llaves/equipos.
 *
 * Contexto: los lectores NFC dejan de ser un dispositivo serie compartido
 * detrás de un gateway Socket.IO (`src/shared/websocket/nfc.gateway.js`,
 * retirado en esta misma fase) y pasan a ser lectores RFID USB tipo teclado
 * emulado conectados directo al navegador de cada usuario portero — cada
 * quien lee su propia tarjeta localmente. Portería necesita entonces un
 * usuario logueado propio (Office365, igual que admin/aux) con permisos
 * acotados por bloque, en vez de depender de la `ubicaciones_operativas`
 * elegida libremente en el payload del request.
 *
 * Cambios:
 *  - `usuarios.rol` CHECK se amplía para incluir 'porteria'.
 *  - Nueva tabla `portero_bloques`: qué operaciones (identificación,
 *    préstamo/devolución de llaves, préstamo de equipos) puede realizar un
 *    usuario portero en un bloque concreto.
 *  - `gestionado_por_usuario_id` en `registros_llaves`/`prestamos`/
 *    `devoluciones`: antes solo se guardaba la `ubicacion_id` (snapshot de
 *    catálogo, sin FK a quién procesó la operación); ahora también se
 *    registra el usuario logueado (admin/aux/portero) que gestionó cada
 *    entrega/devolución, para trazabilidad e historial por usuario.
 *  - `ubicaciones_operativas` NO se toca: queda como histórico, ya no se usa
 *    para autorizar nuevas operaciones (el gate pasa a ser
 *    rol+bloque_id vía `portero_bloques`, resuelto en `porteros.service.js`).
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- usuarios.rol: agregar 'porteria' -------------------------------------
  await knex.raw('ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check');
  await knex.raw(`
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rol_check
        CHECK (rol IN ('admin_programacion', 'auxiliar_programacion', 'superadmin', 'porteria'))
  `);

  // --- portero_bloques -------------------------------------------------------
  await knex.raw(`
    CREATE TABLE portero_bloques (
      ${UNIVERSAL_COLUMNS_SQL},
      usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      bloque_id uuid NOT NULL REFERENCES bloques(id) ON DELETE RESTRICT,
      permite_identificacion bool NOT NULL DEFAULT false,
      permite_prestamo_llaves bool NOT NULL DEFAULT false,
      permite_devolucion_llaves bool NOT NULL DEFAULT false,
      permite_prestamo_equipos bool NOT NULL DEFAULT false
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_portero_bloques_usuario_bloque
      ON portero_bloques (usuario_id, bloque_id) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_portero_bloques_usuario_id ON portero_bloques (usuario_id)');
  await knex.raw('CREATE INDEX idx_portero_bloques_bloque_id ON portero_bloques (bloque_id)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON portero_bloques
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- gestionado_por_usuario_id ---------------------------------------------
  await knex.raw(`
    ALTER TABLE registros_llaves
      ADD COLUMN gestionado_por_usuario_id uuid NULL REFERENCES usuarios(id) ON DELETE RESTRICT
  `);
  await knex.raw(`
    ALTER TABLE prestamos
      ADD COLUMN gestionado_por_usuario_id uuid NULL REFERENCES usuarios(id) ON DELETE RESTRICT
  `);
  await knex.raw(`
    ALTER TABLE devoluciones
      ADD COLUMN gestionado_por_usuario_id uuid NULL REFERENCES usuarios(id) ON DELETE RESTRICT
  `);
  await knex.raw('CREATE INDEX idx_registros_llaves_gestionado_por ON registros_llaves (gestionado_por_usuario_id)');
  await knex.raw('CREATE INDEX idx_prestamos_gestionado_por ON prestamos (gestionado_por_usuario_id)');
  await knex.raw('CREATE INDEX idx_devoluciones_gestionado_por ON devoluciones (gestionado_por_usuario_id)');

  // --- extender guardas de soft-delete ---------------------------------------

  // usuarios: ya vigilaba reservas.aprobado_por_usuario_id (007); gana 4
  // hijos nuevos (portero_bloques, registros_llaves, prestamos, devoluciones).
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON usuarios');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON usuarios
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'reservas', 'aprobado_por_usuario_id',
        'portero_bloques', 'usuario_id',
        'registros_llaves', 'gestionado_por_usuario_id',
        'prestamos', 'gestionado_por_usuario_id',
        'devoluciones', 'gestionado_por_usuario_id')
  `);

  // bloques: ya vigilaba salones.bloque_id (002); gana portero_bloques.bloque_id.
  await knex.raw('DROP TRIGGER trg_block_soft_delete ON bloques');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON bloques
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children(
        'salones', 'bloque_id',
        'portero_bloques', 'bloque_id')
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON bloques');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON bloques
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('salones', 'bloque_id')
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON usuarios');
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON usuarios
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('reservas', 'aprobado_por_usuario_id')
  `);

  await knex.raw('DROP INDEX IF EXISTS idx_devoluciones_gestionado_por');
  await knex.raw('DROP INDEX IF EXISTS idx_prestamos_gestionado_por');
  await knex.raw('DROP INDEX IF EXISTS idx_registros_llaves_gestionado_por');
  await knex.raw('ALTER TABLE devoluciones DROP COLUMN IF EXISTS gestionado_por_usuario_id');
  await knex.raw('ALTER TABLE prestamos DROP COLUMN IF EXISTS gestionado_por_usuario_id');
  await knex.raw('ALTER TABLE registros_llaves DROP COLUMN IF EXISTS gestionado_por_usuario_id');

  await knex.raw('DROP TABLE IF EXISTS portero_bloques');

  await knex.raw('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check');
  await knex.raw(`
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rol_check
        CHECK (rol IN ('admin_programacion', 'auxiliar_programacion', 'superadmin'))
  `);
};
