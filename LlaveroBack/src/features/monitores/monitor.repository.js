'use strict';
const BaseRepository = require('../../shared/db/base.repository');
const { TABLES } = require('../../shared/db/tables');
const { newId } = require('../../shared/db/id');
const { normalizeLookupKey } = require('../../shared/utils/normalize.helper');

/**
 * Repositorio de `monitores` (Fase S4 de la migración Mongo → Postgres).
 *
 * Reemplaza el modelo Mongoose `Monitor` (monitor.schema.js). El cambio
 * central: la asignación de un monitor ya no guarda materia/aula/horario/dia
 * como texto libre — `monitores.programacion_id` es un FK real a una fila
 * concreta de `programaciones`. Todas las lecturas hacen JOIN con
 * `programaciones` (para exponer materia/aula/horario/dia de la clase
 * vinculada) y con `comunidad` dos veces (docente titular y monitor), para
 * que `llave.context.js` pueda resolver el rol de un monitor con un único
 * query en vez de cruzar colecciones en memoria.
 */
class MonitorRepository extends BaseRepository {
  constructor() { super(TABLES.MONITORES); }

  _baseQuery() {
    return this.db(TABLES.MONITORES)
      .leftJoin(`${TABLES.COMUNIDAD} as c_docente`, 'c_docente.id', `${TABLES.MONITORES}.docente_comunidad_id`)
      .leftJoin(`${TABLES.COMUNIDAD} as c_monitor`, 'c_monitor.id', `${TABLES.MONITORES}.monitor_comunidad_id`)
      .leftJoin(TABLES.PROGRAMACIONES, `${TABLES.PROGRAMACIONES}.id`, `${TABLES.MONITORES}.programacion_id`)
      .whereNull(`${TABLES.MONITORES}.deleted_at`)
      .select(
        `${TABLES.MONITORES}.*`,
        'c_docente.numero_documento as numero_documento_docente',
        'c_docente.nombre as nombre_docente',
        'c_monitor.numero_documento as numero_documento_monitor',
        `${TABLES.PROGRAMACIONES}.materia as materia`,
        `${TABLES.PROGRAMACIONES}.aula as aula`,
        `${TABLES.PROGRAMACIONES}.horario as horario`,
        `${TABLES.PROGRAMACIONES}.dia as dia`
      );
  }

  /** @returns {Promise<object[]>} Monitores activos */
  async findAll() {
    return this._baseQuery().where({ [`${TABLES.MONITORES}.activo`]: true });
  }

  /** @param {string} documentoDocente @returns {Promise<object[]>} */
  async findByDocente(documentoDocente) {
    return this._baseQuery()
      .where({ [`${TABLES.MONITORES}.activo`]: true })
      .andWhere('c_docente.numero_documento', String(documentoDocente));
  }

  /** @param {string} idCarnet @returns {Promise<object[]>} Monitores activos con ese carnet */
  async findByCarnetMonitor(idCarnet) {
    return this._baseQuery()
      .where({ [`${TABLES.MONITORES}.activo`]: true, [`${TABLES.MONITORES}.monitor_id_carnet`]: idCarnet });
  }

  /** @param {string} documentoMonitor @returns {Promise<object[]>} */
  async findByDocumentoMonitor(documentoMonitor) {
    return this._baseQuery()
      .where({ [`${TABLES.MONITORES}.activo`]: true })
      .andWhere('c_monitor.numero_documento', String(documentoMonitor));
  }

  /**
   * Asignaciones activas de un monitor cuya `programacion_id` vinculada cae
   * en `dia` — reemplaza el antiguo cruce en memoria (`matchMonitorClase`
   * en llave.domain.js) por un JOIN real
   * `monitores.programacion_id -> programaciones`. Es la consulta que usa
   * `llave.context.js` para resolver el rol/clases disponibles de un
   * monitor en una lectura NFC.
   * @param {string} documentoMonitor @param {string} dia - Nombre del día (cualquier capitalización/tildes)
   * @returns {Promise<object[]>}
   */
  async findByDocumentoMonitorYDia(documentoMonitor, dia) {
    return this._baseQuery()
      .where({ [`${TABLES.MONITORES}.activo`]: true })
      .andWhere('c_monitor.numero_documento', String(documentoMonitor))
      .andWhere(`${TABLES.PROGRAMACIONES}.dia`, normalizeLookupKey(dia))
      .whereNull(`${TABLES.PROGRAMACIONES}.deleted_at`);
  }

  /** @param {object} data @returns {Promise<object>} */
  async create(data) {
    const payload = { id: data.id || newId(), ...data };
    const [row] = await this.table.insert(payload).returning('*');
    return this._baseQuery().where(`${TABLES.MONITORES}.id`, row.id).first();
  }

  /**
   * Soft-disable: preserva el comportamiento original (activo=false, NO
   * marca `deleted_at`) — `activo` es un flag de negocio independiente del
   * soft-delete universal, per spec ("activo/activa flags keep their
   * independent enable/disable meaning").
   * @param {string} id @returns {Promise<object|null>}
   */
  async deleteById(id) {
    const [row] = await this.table
      .where({ id })
      .whereNull('deleted_at')
      .update({ activo: false })
      .returning('*');
    return row || null;
  }
}

module.exports = new MonitorRepository();
