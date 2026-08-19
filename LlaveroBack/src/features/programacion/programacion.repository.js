'use strict';
const pgClient = require('../../shared/db/pg.client');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { normalizeLookupKey } = require('../../shared/utils/normalize.helper');

/**
 * Repositorio de programación (tabla base `programaciones` + subtipos
 * `programaciones_regulares`/`programaciones_semestrales`/`programaciones_fantasma`,
 * table-per-type per Decision 8 del diseño). Reemplaza el modelo Mongoose
 * `Programacion` (discriminador `tipo`) que existía en `programacion.schema.js`
 * (eliminado en S7 — sin más requirers desde que S6 migró `reservas`).
 *
 * `dia` es ahora una columna CHECK-constrained ('lunes'..'domingo'); las
 * comparaciones insensibles a tildes/mayúsculas que antes se hacían con
 * regex en cada query se resuelven una sola vez al normalizar el valor de
 * entrada con `normalizeLookupKey` (mismo criterio de canonicalización que
 * usa el resto del código para claves de comparación).
 */

const BASE_COLUMNS = [
  'tipo', 'semestre_id', 'docente_id', 'docente_nombre', 'dia', 'horario',
  'hora_inicio', 'hora_fin', 'salon_id', 'aula', 'facultad', 'materia',
  'codigo_materia', 'grupo', 'nivel_grupo', 'estudiantes_prematriculados',
  'estudiantes_matriculados', 'total_estudiantes', 'observaciones',
];

/** Normaliza un nombre de día (con/sin tildes, cualquier capitalización) al valor canónico del CHECK de `dia`. */
function normalizarDia(dia) {
  if (!dia) return null;
  return normalizeLookupKey(dia);
}

class ProgramacionRepository {
  /** @returns {import('knex').Knex} */
  get db() {
    return pgClient.getKnex();
  }

  /** Filtra y normaliza un payload arbitrario a las columnas válidas de `programaciones`. */
  _pickBase(data) {
    const out = {};
    for (const col of BASE_COLUMNS) {
      if (data[col] !== undefined) out[col] = data[col];
    }
    if (out.dia !== undefined) out.dia = normalizarDia(out.dia);
    return out;
  }

  /**
   * Query base para lecturas: v_programaciones LEFT JOIN programacion_semestres
   * + comunidad (por docente_id), exponiendo `semestre` (código) y
   * `numero_documento` que antes vivían directo en el documento Mongo, para
   * no romper a los consumidores cross-feature que aún comparan por esos
   * campos (`llave.context.js`, S4 — todavía no migrado). Ninguno de los
   * dos es columna real en `programaciones`: `semestre` viene de la FK
   * `semestre_id` y `numero_documento` de la FK `docente_id`.
   */
  _readQuery() {
    return this.db(TABLES.V_PROGRAMACIONES)
      .leftJoin(TABLES.PROGRAMACION_SEMESTRES, `${TABLES.PROGRAMACION_SEMESTRES}.id`, `${TABLES.V_PROGRAMACIONES}.semestre_id`)
      .leftJoin(`${TABLES.COMUNIDAD} as c_docente`, 'c_docente.id', `${TABLES.V_PROGRAMACIONES}.docente_id`)
      .whereNull(`${TABLES.V_PROGRAMACIONES}.deleted_at`)
      .select(
        `${TABLES.V_PROGRAMACIONES}.*`,
        `${TABLES.PROGRAMACION_SEMESTRES}.codigo as semestre`,
        'c_docente.numero_documento as numero_documento',
        `${TABLES.V_PROGRAMACIONES}.docente_nombre as docente`
      );
  }

  /** @returns {Promise<object[]>} */
  async findAll() {
    return this._readQuery();
  }

  /**
   * @param {string} dia - Nombre del día (cualquier capitalización/tildes)
   * @param {string|null} semestre - Código normalizado del semestre
   * @param {{excluirId?: string|null}} [opts]
   * @returns {Promise<object[]>}
   */
  async findByDia(dia, semestre = null, { excluirId = null } = {}) {
    const q = this._readQuery().where({ [`${TABLES.V_PROGRAMACIONES}.tipo`]: 'regular', [`${TABLES.V_PROGRAMACIONES}.dia`]: normalizarDia(dia) });
    if (semestre) {
      q.andWhere(`${TABLES.PROGRAMACION_SEMESTRES}.codigo`, semestre);
    }
    if (excluirId) {
      q.andWhereNot(`${TABLES.V_PROGRAMACIONES}.id`, excluirId);
    }
    return q;
  }

  /** @param {string} documento @returns {Promise<object[]>} */
  async findByDocumento(documento) {
    return this._readQuery()
      .whereNull('c_docente.deleted_at')
      .where('c_docente.numero_documento', String(documento));
  }

  /**
   * Filas que ocupan un aula físicamente para el cálculo de ocupación:
   * clases regulares ('regular') + reservas semestrales activas
   * ('semestral', excluye `cancelada=true`). Excluye 'fantasma' (grupos
   * virtuales sin salón propio, no ocupan nada). Hace join hasta `bloques`
   * vía `salon_id` para obtener el bloque real del catálogo en vez de
   * derivarlo por heurística del nombre del aula. `salon_id` puede ser NULL
   * (aula del Excel sin match en el catálogo `salones`), en cuyo caso
   * `bloque` viene NULL — se conserva la fila igual, el consumidor decide
   * cómo agruparla.
   * @param {string|null} semestreCodigo - Si es null, incluye todos los semestres cargados
   * @returns {Promise<object[]>}
   */
  async findParaOcupacion(semestreCodigo = null) {
    const q = this.db(`${TABLES.PROGRAMACIONES} as p`)
      .leftJoin(`${TABLES.PROGRAMACIONES_SEMESTRALES} as ps`, 'ps.programacion_id', 'p.id')
      .leftJoin(`${TABLES.SALONES} as s`, 's.id', 'p.salon_id')
      .leftJoin(`${TABLES.BLOQUES} as b`, 'b.id', 's.bloque_id')
      .leftJoin(`${TABLES.PROGRAMACION_SEMESTRES} as sem`, 'sem.id', 'p.semestre_id')
      .whereIn('p.tipo', ['regular', 'semestral'])
      .whereNull('p.deleted_at')
      .whereNotNull('p.aula')
      .whereNot('p.aula', '')
      // Placeholders del Excel de programación, no salones físicos reales —
      // no deben aparecer como "aula" en el informe de ocupación.
      .whereNotIn('p.aula', ['NO REQUIERE AULA', 'PENDIENTE'])
      .andWhere((qb) => qb.whereNull('ps.cancelada').orWhere('ps.cancelada', false))
      .select(
        'p.aula', 'p.dia', 'p.hora_inicio', 'p.hora_fin', 'p.facultad', 'p.total_estudiantes', 'p.tipo',
        'b.nombre_bloque as bloque', 'p.docente_nombre as docente', 'p.materia', 'p.codigo_materia', 'p.grupo'
      );
    if (semestreCodigo) q.andWhere('sem.codigo', semestreCodigo);
    return q;
  }

  /**
   * Vincula `salon_id` en las filas de `programaciones` cuyo texto de `aula`
   * coincide con un salón recién creado/renombrado — para que el catálogo de
   * salones y la programación ya cargada queden sincronizados sin depender
   * de un backfill manual cada vez que se registra un salón nuevo.
   * @param {string} nombreSalon @param {string} salonId
   * @returns {Promise<number>} filas actualizadas
   */
  async vincularSalonPorNombre(nombreSalon, salonId) {
    return this.db(TABLES.PROGRAMACIONES)
      .where({ aula: nombreSalon })
      .whereNull('salon_id')
      .whereNull('deleted_at')
      .update({ salon_id: salonId });
  }

  /**
   * Clases reales (regulares + reservas semestrales activas) que ocupan un
   * aula en un día concreto — para el drill-down "qué clase está aquí" al
   * hacer click en una celda de la matriz de ocupación.
   * @param {string} aula @param {string} dia - Nombre en minúsculas sin tilde (ej: "lunes")
   * @param {string|null} semestreCodigo
   * @returns {Promise<object[]>}
   */
  async findDetalleAulaDia(aula, dia, semestreCodigo = null) {
    const q = this.db(`${TABLES.PROGRAMACIONES} as p`)
      .leftJoin(`${TABLES.PROGRAMACIONES_SEMESTRALES} as ps`, 'ps.programacion_id', 'p.id')
      .leftJoin(`${TABLES.PROGRAMACION_SEMESTRES} as sem`, 'sem.id', 'p.semestre_id')
      .whereIn('p.tipo', ['regular', 'semestral'])
      .whereNull('p.deleted_at')
      .where('p.aula', aula)
      .where('p.dia', dia)
      .andWhere((qb) => qb.whereNull('ps.cancelada').orWhere('ps.cancelada', false))
      .select(
        'p.materia', 'p.docente_nombre as docente', 'p.hora_inicio', 'p.hora_fin',
        'p.horario', 'p.tipo', 'p.facultad', 'p.grupo'
      )
      .orderBy('p.hora_inicio');
    if (semestreCodigo) q.andWhere('sem.codigo', semestreCodigo);
    return q;
  }

  /** @returns {Promise<string[]>} */
  async distinctAulas() {
    const rows = await this.db(TABLES.PROGRAMACIONES)
      .distinct('aula')
      .whereNull('deleted_at')
      .whereNotNull('aula')
      .whereNot('aula', '');
    return rows.map((r) => r.aula);
  }

  /** @param {string} semestre - Código normalizado (ej: "2026-1") @returns {Promise<object[]>} */
  async findBySemestre(semestre) {
    return this._readQuery()
      .where(`${TABLES.PROGRAMACION_SEMESTRES}.codigo`, semestre)
      .whereIn(`${TABLES.V_PROGRAMACIONES}.tipo`, ['regular', 'fantasma']);
  }

  /**
   * Soft-elimina (nunca hard-delete) los registros de programación y
   * fantasmas de un semestre (no toca semestrales). Borra primero la fila
   * de subtipo y luego la base, en la misma transacción, respetando el
   * orden que exige el trigger block_soft_delete de programacion_semestres.
   * @param {string} semestre
   */
  async deleteBySemestre(semestre) {
    return this.db.transaction(async (trx) => {
      const semestreRow = await trx(TABLES.PROGRAMACION_SEMESTRES).where({ codigo: semestre }).first();
      if (!semestreRow) return { eliminados: 0 };

      const baseIds = await trx(TABLES.PROGRAMACIONES)
        .where({ semestre_id: semestreRow.id })
        .whereIn('tipo', ['regular', 'fantasma'])
        .whereNull('deleted_at')
        .pluck('id');
      if (!baseIds.length) return { eliminados: 0 };

      const now = trx.fn.now();
      await trx(TABLES.PROGRAMACIONES_REGULARES).whereIn('programacion_id', baseIds).whereNull('deleted_at').update({ deleted_at: now });
      await trx(TABLES.PROGRAMACIONES_FANTASMA).whereIn('programacion_id', baseIds).whereNull('deleted_at').update({ deleted_at: now });
      const eliminados = await trx(TABLES.PROGRAMACIONES).whereIn('id', baseIds).update({ deleted_at: now });
      return { eliminados };
    });
  }

  /**
   * Deviation from design: `fecha_inicio_semestre`/`fecha_fin_semestre` ya
   * no existen como columnas por-fila en `programaciones` (viven una sola
   * vez en `programacion_semestres`, y las lecturas hacen join). Por lo
   * tanto ya no hay nada que propagar aquí: el servicio actualiza
   * directamente `programacion_semestres` vía `semestreRepository.updateFechas`.
   * Se conserva el método (arity y forma de retorno) para no romper al
   * único caller (`programacion.service.js`).
   */
  async updateFechasPorSemestre() {
    return { modifiedCount: 0 };
  }

  /** @param {string} id @param {object} update @returns {Promise<object|null>} */
  async updateById(id, update) {
    const payload = this._pickBase(update);
    if (Object.keys(payload).length) {
      const [row] = await this.db(TABLES.PROGRAMACIONES)
        .where({ id })
        .whereNull('deleted_at')
        .update(payload)
        .returning('*');
      if (!row) return null;
    }
    return this.findById(id);
  }

  /** @param {string} semestre @param {string} codigo_materia @returns {Promise<object[]>} */
  async findByCodigoMateriaYSemestre(semestre, codigo_materia) {
    return this._readQuery()
      .where(`${TABLES.PROGRAMACION_SEMESTRES}.codigo`, semestre)
      .where(`${TABLES.V_PROGRAMACIONES}.codigo_materia`, codigo_materia);
  }

  /**
   * Cambia el tipo ('regular' <-> 'fantasma') de todos los registros de un
   * (semestre, codigo_materia, grupo), creando/soft-eliminando las filas de
   * subtipo correspondientes en la misma transacción (vincular/desvincular
   * fantasma spans base + 2 subtipo tables).
   * @param {string} semestre @param {string} codigo_materia @param {string|number} grupo
   * @param {{tipo: 'regular'|'fantasma', fantasma_de?: string}} update
   */
  async updateManyByCodigoMateriaYGrupo(semestre, codigo_materia, grupo, update) {
    return this.db.transaction(async (trx) => {
      const semestreRow = await trx(TABLES.PROGRAMACION_SEMESTRES).where({ codigo: semestre }).first();
      if (!semestreRow) return { modifiedCount: 0 };

      const baseIds = await trx(TABLES.PROGRAMACIONES)
        .where({ semestre_id: semestreRow.id, codigo_materia, grupo: String(grupo) })
        .whereNull('deleted_at')
        .pluck('id');
      if (!baseIds.length) return { modifiedCount: 0 };

      const now = trx.fn.now();

      if (update.tipo === 'fantasma') {
        await trx(TABLES.PROGRAMACIONES_REGULARES).whereIn('programacion_id', baseIds).whereNull('deleted_at').update({ deleted_at: now });
        for (const id of baseIds) {
          const existing = await trx(TABLES.PROGRAMACIONES_FANTASMA).where({ programacion_id: id }).first();
          if (existing) {
            await trx(TABLES.PROGRAMACIONES_FANTASMA).where({ programacion_id: id })
              .update({ deleted_at: null, fantasma_de_codigo_materia: update.fantasma_de || '' });
          } else {
            await trx(TABLES.PROGRAMACIONES_FANTASMA).insert({
              programacion_id: id,
              fantasma_de_codigo_materia: update.fantasma_de || '',
            });
          }
        }
        await trx(TABLES.PROGRAMACIONES).whereIn('id', baseIds).update({ tipo: 'fantasma' });
      } else {
        await trx(TABLES.PROGRAMACIONES_FANTASMA).whereIn('programacion_id', baseIds).whereNull('deleted_at').update({ deleted_at: now });
        for (const id of baseIds) {
          const existing = await trx(TABLES.PROGRAMACIONES_REGULARES).where({ programacion_id: id }).first();
          if (existing) {
            await trx(TABLES.PROGRAMACIONES_REGULARES).where({ programacion_id: id }).update({ deleted_at: null });
          } else {
            await trx(TABLES.PROGRAMACIONES_REGULARES).insert({ programacion_id: id });
          }
        }
        await trx(TABLES.PROGRAMACIONES).whereIn('id', baseIds).update({ tipo: 'regular' });
      }

      return { modifiedCount: baseIds.length };
    });
  }

  /** @param {string} semestre @param {string} codigo_materia @param {string|number} grupo @returns {Promise<object[]>} */
  async findByCodigoMateriaGrupoYSemestre(semestre, codigo_materia, grupo) {
    return this._readQuery()
      .where(`${TABLES.PROGRAMACION_SEMESTRES}.codigo`, semestre)
      .where(`${TABLES.V_PROGRAMACIONES}.codigo_materia`, codigo_materia)
      .where(`${TABLES.V_PROGRAMACIONES}.grupo`, String(grupo));
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) {
    const row = await this._readQuery().where(`${TABLES.V_PROGRAMACIONES}.id`, id).first();
    return row || null;
  }

  /**
   * Reemplaza (soft-delete + insert transaccional) los registros tipo
   * 'regular' de un semestre. No reinserta (codigo_materia, grupo) ya
   * vinculados como fantasma. Cada registro insertado escribe una fila en
   * `programaciones` (base) y una en `programaciones_regulares` (subtipo),
   * dentro de la misma transacción — primer write multi-tabla de la
   * migración para este feature.
   * @param {object[]} registros - Ya deben traer `docente_id` resuelto (o null) desde el servicio
   * @param {string} semestre - Código normalizado del semestre a reemplazar
   * @param {string|null} semestreId - id de `programacion_semestres` (ya debe existir; el servicio hace upsert de metadatos ANTES de llamar aquí)
   * @returns {Promise<{insertados: number}>}
   */
  async bulkInsert(registros, semestre, semestreId = null) {
    return this.db.transaction(async (trx) => {
      const semestreRow = semestreId
        ? { id: semestreId }
        : await trx(TABLES.PROGRAMACION_SEMESTRES).where({ codigo: semestre }).first();

      if (semestreRow) {
        const idsExistentes = await trx(TABLES.PROGRAMACIONES)
          .where({ semestre_id: semestreRow.id, tipo: 'regular' })
          .whereNull('deleted_at')
          .pluck('id');
        if (idsExistentes.length) {
          const now = trx.fn.now();
          await trx(TABLES.PROGRAMACIONES_REGULARES).whereIn('programacion_id', idsExistentes).update({ deleted_at: now });
          await trx(TABLES.PROGRAMACIONES).whereIn('id', idsExistentes).update({ deleted_at: now });
        }
      }

      let clavesFantasma = new Set();
      if (semestreRow) {
        const fantasmasExistentes = await trx(TABLES.PROGRAMACIONES)
          .where({ semestre_id: semestreRow.id, tipo: 'fantasma' })
          .whereNull('deleted_at')
          .select('codigo_materia', 'grupo');
        clavesFantasma = new Set(fantasmasExistentes.map((f) => `${f.codigo_materia}|${f.grupo}`));
      }

      const registrosFiltrados = registros.filter(
        (r) => !clavesFantasma.has(`${r.codigo_materia}|${r.grupo}`)
      );

      // `r.tipo` puede venir como 'fantasma' (detección automática desde
      // OBSERVACIONES del Excel, ver `_detectarFantasmas` en el servicio) —
      // por defecto sigue siendo 'regular' como antes.
      const basePayloads = registrosFiltrados.map((r) => ({
        id: newId(),
        ...this._pickBase({ ...r, tipo: r.tipo === 'fantasma' ? 'fantasma' : 'regular', semestre_id: semestreRow ? semestreRow.id : null }),
      }));

      if (basePayloads.length) {
        await trx(TABLES.PROGRAMACIONES).insert(basePayloads);

        const regulares = basePayloads.filter((b) => b.tipo === 'regular').map((b) => ({ programacion_id: b.id }));
        if (regulares.length) await trx(TABLES.PROGRAMACIONES_REGULARES).insert(regulares);

        const fantasmas = registrosFiltrados
          .map((r, i) => ({ codigo_materia_origen: r.fantasma_de_codigo_materia, base: basePayloads[i] }))
          .filter(({ base }) => base.tipo === 'fantasma')
          .map(({ codigo_materia_origen, base }) => ({
            programacion_id: base.id,
            fantasma_de_codigo_materia: codigo_materia_origen || '',
          }));
        if (fantasmas.length) await trx(TABLES.PROGRAMACIONES_FANTASMA).insert(fantasmas);
      }

      return { insertados: basePayloads.length };
    });
  }
}

module.exports = new ProgramacionRepository();
