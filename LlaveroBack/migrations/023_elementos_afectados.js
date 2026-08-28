'use strict';

/**
 * Catálogo de elementos afectados por una novedad.
 *
 * Hasta ahora el QUÉ se dañó vivía únicamente en `novedades.descripcion`, un
 * varchar(500) libre: "silla rota", "silla dañada" y "se partió una silla" son
 * tres valores distintos para la base. Eso alcanza para dejar constancia del
 * incidente, pero no para explotarlo — `/novedades/estadisticas` solo puede
 * agrupar por estado y categoría, y no hay forma de contar cuántas ventanas
 * rotas hay en un bloque ni de priorizar mantenimiento por tipo de elemento.
 *
 * Se modela como catálogo administrable (mismo patrón que
 * `ubicaciones_operativas`/`tipos_silleteria`: clave estable + nombre
 * editable + `activo`) en vez de un CHECK con enum fijo, para que agregar un
 * elemento nuevo no exija migración y deploy. Los valores iniciales los
 * siembra `elementoAfectado.service.js` en el arranque, igual que
 * `ubicacionService.asegurarIniciales()`.
 *
 * `novedades.elemento_afectado_id` queda NULL-able a propósito: las novedades
 * ya registradas no tienen elemento y varias categorías (`demora_entrega`,
 * `perdida`) no lo necesitan.
 */

const UNIVERSAL_COLUMNS_SQL = `
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
`;

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE elementos_afectados (
      ${UNIVERSAL_COLUMNS_SQL},
      clave text NOT NULL,
      nombre text NOT NULL,
      descripcion text DEFAULT '',
      activo bool NOT NULL DEFAULT true,
      orden int NOT NULL DEFAULT 0,
      CONSTRAINT chk_elementos_afectados_clave_lower CHECK (clave = lower(clave))
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ux_elementos_afectados_clave
      ON elementos_afectados (clave) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_elementos_afectados_activo ON elementos_afectados (activo)');
  await knex.raw(`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON elementos_afectados
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // --- novedades: qué elemento y cuántos --------------------------------
  await knex.raw(`
    ALTER TABLE novedades
      ADD COLUMN elemento_afectado_id uuid NULL
        REFERENCES elementos_afectados(id) ON DELETE RESTRICT,
      ADD COLUMN cantidad_afectada int NOT NULL DEFAULT 1,
      ADD CONSTRAINT ck_novedades_cantidad_afectada CHECK (cantidad_afectada > 0)
  `);
  await knex.raw('CREATE INDEX idx_novedades_elemento_afectado_id ON novedades (elemento_afectado_id)');

  // elementos_afectados gana su primer hijo (novedades.elemento_afectado_id):
  // borrar en blando un elemento todavía referenciado dejaría novedades
  // apuntando a un catálogo invisible.
  await knex.raw(`
    CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON elementos_afectados
      FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      EXECUTE FUNCTION block_soft_delete_with_active_children('novedades', 'elemento_afectado_id')
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_block_soft_delete ON elementos_afectados');
  await knex.raw('DROP INDEX IF EXISTS idx_novedades_elemento_afectado_id');
  await knex.raw(`
    ALTER TABLE novedades
      DROP CONSTRAINT IF EXISTS ck_novedades_cantidad_afectada,
      DROP COLUMN IF EXISTS cantidad_afectada,
      DROP COLUMN IF EXISTS elemento_afectado_id
  `);
  await knex.raw('DROP TABLE IF EXISTS elementos_afectados');
};
