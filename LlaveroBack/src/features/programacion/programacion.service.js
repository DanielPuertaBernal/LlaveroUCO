'use strict';
const programacionRepository = require('./programacion.repository');
const semestreRepository = require('./programacion.semestre.repository');
const reservasSemestralesService = require('../reservas_semestrales/reservas_semestrales.service');
const llaveRepository = require('../llaves/llave.repository');
const comunidadRepository = require('../comunidad/comunidad.repository');
const salonRepository = require('../salones/salon.repository');
const ApiError = require('../../shared/errors/api.error');
const { parseExcel, cleanText, cleanDocumento, generateExcel, generateExcelMultiSheet } = require('../../shared/utils/excel.parser');
const { getDiaActual, horaAMinutos } = require('../../shared/utils/date.helper');
const { normalizeDocumento, normalizeString, normalizeUpperString } = require('../../shared/utils/normalize.helper');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('Programacion');

/**
 * Convierte el código raw de semestre del Excel al código normalizado.
 * Formato esperado: PAAAA  donde P=periodo (1 o 2) y AAAA=año (ej: 12026 → 2026-1)
 * @param {string|number} raw
 * @returns {{ codigo: string, anio: number, periodo: number, codigo_raw: string }}
 */
function normalizarCodigoSemestre(raw) {
  const str = String(raw).trim().replace(/\.0$/, '');
  if (!/^\d{5}$/.test(str)) {
    throw ApiError.badRequest(`Código de semestre inválido en el Excel: "${raw}". Se esperaba formato PAAAA (ej: 12026).`);
  }
  const periodo = parseInt(str[0], 10);
  const anio = parseInt(str.slice(1), 10);
  if (periodo < 1 || periodo > 2) {
    throw ApiError.badRequest(`Período de semestre inválido: ${periodo}. Solo se admiten 1 o 2.`);
  }
  return { codigo: `${anio}-${periodo}`, anio, periodo, codigo_raw: str };
}

/**
 * Parsea una fecha del Excel con formato "D/MM/YYYY HH:MM:SS" o "DD/MM/YYYY HH:MM:SS".
 * @param {string|null} str
 * @returns {Date|null}
 */
function parseFechaExcel(str) {
  if (!str) return null;
  // Si XLSX entregó un Date object directamente
  if (str instanceof Date) return Number.isNaN(str.getTime()) ? null : str;
  const datepart = String(str).trim().split(' ')[0]; // descarta parte de hora
  const parts = datepart.split('/');
  if (parts.length !== 3) return null;
  let a = parseInt(parts[0], 10);
  let b = parseInt(parts[1], 10);
  let c = parseInt(parts[2], 10);
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) return null;
  // XLSX con raw:false devuelve años de 2 dígitos (ej: 26 → 2026)
  if (c < 100) c += 2000;
  // Detectar orden día/mes:
  //   a > 12 → a es día, b es mes  (DD/MM/YYYY o D/M/YY)
  //   b > 12 → b es día, a es mes  (MM/DD/YYYY o M/D/YY  ← formato XLSX)
  //   ambos ≤ 12 → ambiguo, usar convención DD/MM local
  let day, month;
  if (a > 12)      { day = a; month = b; }
  else if (b > 12) { day = b; month = a; }
  else             { day = a; month = b; }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(c, month - 1, day));
}

class ProgramacionService {
  async listar(semestre = null) {
    if (semestre) return programacionRepository.findBySemestre(semestre);
    return programacionRepository.findAll();
  }

  async listarSemestres() {
    return semestreRepository.findAll();
  }

  async listarSemestreVigente() {
    return semestreRepository.findVigente();
  }

  async eliminarSemestre(codigo) {
    const existe = await semestreRepository.findByCodigo(codigo);
    if (!existe) throw ApiError.notFound(`No existe el semestre "${codigo}"`);
    await programacionRepository.deleteBySemestre(codigo);
    await reservasSemestralesService.eliminarPorSemestre(codigo);
    await semestreRepository.deleteByCodigo(codigo);
    logger.info('Semestre eliminado', { codigo });
    return { eliminado: true, codigo };
  }

  async actualizarFechasSemestre(codigo, fecha_inicio_str, fecha_fin_str) {
    const existe = await semestreRepository.findByCodigo(codigo);
    if (!existe) throw ApiError.notFound(`No existe el semestre "${codigo}"`);
    const inicio = new Date(fecha_inicio_str);
    const fin = new Date(fecha_fin_str);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw ApiError.badRequest('Fechas inválidas');
    }
    if (inicio >= fin) {
      throw ApiError.badRequest('La fecha de inicio debe ser anterior a la fecha de fin');
    }
    const actualizado = await semestreRepository.updateFechas(codigo, inicio, fin);
    const { modifiedCount } = await programacionRepository.updateFechasPorSemestre(codigo, inicio, fin);
    logger.info('Fechas de semestre actualizadas', { codigo, inicio, fin, programacionActualizada: modifiedCount });
    return actualizado;
  }

  async listarPorDia(dia, clasesConLlave = [], semestre = null) {
    const diaFiltro = dia || getDiaActual();
    let semestreFiltro = semestre;
    if (!semestreFiltro) {
      const vigente = await semestreRepository.findVigente();
      semestreFiltro = vigente?.codigo || null;
    }

    const hoy = new Date().toISOString().split('T')[0];
    const [todasClases, reservasSemestrales, llavesHoy] = await Promise.all([
      programacionRepository.findByDia(diaFiltro, semestreFiltro),
      reservasSemestralesService.listarPorDia(diaFiltro, new Date()),
      llaveRepository.findByFecha(hoy),
    ]);

    // Set de docente+aula con llave entregada hoy
    const entregadasHoy = new Set(
      llavesHoy.map((l) => `${normalizeDocumento(l.numero_documento)}__${String(l.aula).toUpperCase()}`)
    );

    const clases = todasClases.filter((clase) => {
      const doc = normalizeDocumento(clase.numero_documento);
      const horario = normalizeString(clase.horario);

      // Filtro heredado (clasesConLlave del frontend, por compatibilidad)
      if (clasesConLlave.some((c) => normalizeDocumento(c.documento) === doc && normalizeString(c.horario) === horario)) {
        return false;
      }

      // Filtro principal: llave ya entregada hoy para este docente+aula
      return !entregadasHoy.has(`${doc}__${String(clase.aula).toUpperCase()}`);
    });

    // Ocultar reservas semestrales cuya llave ya fue entregada
    const reservasFiltradas = reservasSemestrales.filter((r) => !r.llave_entregada);

    return { clases, reservasSemestrales: reservasFiltradas };
  }

  async exportar(semestre = null) {
    // Postgres: ya no hay _id/__v ni columnas exclusivas de otro subtipo
    // colgando del documento (table-per-type separa eso en su propia tabla);
    // solo se excluyen columnas de conveniencia de la vista.
    const CAMPOS_EXCLUIDOS_PROG = ['es_regular', 'consecutivo', 'cancelada', 'fecha_cancelacion', 'motivo_cancelacion', 'grupo_id', 'creado_manualmente', 'tipo_solicitante', 'responsable_id', 'responsable_nombre', 'bloque_id'];
    const CAMPOS_EXCLUIDOS_SEM = ['es_regular', 'tipo', 'fantasma_de_programacion_id', 'fantasma_de_codigo_materia'];

    const [registrosProg, registrosSem] = await Promise.all([
      semestre ? programacionRepository.findBySemestre(semestre) : programacionRepository.findAll(),
      reservasSemestralesService.listarTodas(semestre),
    ]);

    // Mapa inverso: codigo_materia_principal → Set de codigo_materia_fantasma
    const mapaFantasmas = {};
    registrosProg.forEach((r) => {
      if (r.fantasma_de_codigo_materia) {
        if (!mapaFantasmas[r.fantasma_de_codigo_materia]) mapaFantasmas[r.fantasma_de_codigo_materia] = new Set();
        mapaFantasmas[r.fantasma_de_codigo_materia].add(r.codigo_materia);
      }
    });

    const datosProg = registrosProg.map((r) => {
      const obj = { ...r };
      CAMPOS_EXCLUIDOS_PROG.forEach((c) => delete obj[c]);
      // Asegurar orden: observaciones → fantasma_de → fantasmas_asociados al final
      const { observaciones, fantasma_de_programacion_id, fantasma_de_codigo_materia, ...resto } = obj;
      return {
        ...resto,
        observaciones: observaciones || '',
        fantasma_de: fantasma_de_codigo_materia || '',
        fantasmas_asociados: mapaFantasmas[r.codigo_materia]
          ? [...mapaFantasmas[r.codigo_materia]].join(', ')
          : '',
      };
    });

    const datosSem = registrosSem.map((r) => {
      const obj = { ...r };
      CAMPOS_EXCLUIDOS_SEM.forEach((c) => delete obj[c]);
      return obj;
    });

    return generateExcelMultiSheet([
      { name: 'Programacion', data: datosProg },
      { name: 'Semestrales', data: datosSem },
    ]);
  }

  async importarDesdeExcel(buffer, cargadoPor = '') {
    const rows = parseExcel(buffer);
    if (!rows.length) throw ApiError.badRequest('El archivo Excel está vacío');

    const { validos: limpios, rechazados } = this._limpiarProgramacion(rows);
    if (!limpios.length) {
      const porMotivo = {};
      for (const r of rechazados) porMotivo[r.motivo] = (porMotivo[r.motivo] || 0) + 1;
      const detalles = Object.entries(porMotivo)
        .map(([motivo, n]) => `${n} fila(s) ${motivo}`)
        .join('; ');
      const colsDetectadas = rows.length
        ? Object.keys(rows[0]).slice(0, 10).join(', ')
        : 'ninguna';
      throw ApiError.badRequest(
        `No se encontraron registros válidos en el archivo (${rows.length} filas revisadas). ` +
        `${detalles || 'No se reconocieron las columnas'}. ` +
        `Columnas detectadas: [${colsDetectadas}].`
      );
    }

    // Extraer y validar semestre único del archivo
    const semestresDetectados = [...new Set(limpios.map((r) => r.semestre).filter(Boolean))];
    if (semestresDetectados.length === 0) {
      throw ApiError.badRequest('No se detectó código de semestre en el Excel. Verifique la columna "semestre".');
    }
    if (semestresDetectados.length > 1) {
      throw ApiError.badRequest(
        `El archivo contiene múltiples semestres: ${semestresDetectados.join(', ')}. Importe un semestre a la vez.`
      );
    }

    const semestreCodigo = semestresDetectados[0];

    // Extraer fechas de inicio/fin del semestre (consistentes en todo el archivo)
    const fechasInicio = [...new Set(limpios.map((r) => r._fecha_inicio_raw).filter(Boolean))];
    const fechasFin = [...new Set(limpios.map((r) => r._fecha_fin_raw).filter(Boolean))];

    const fechaInicio = parseFechaExcel(fechasInicio[0] || null);
    const fechaFin = parseFechaExcel(fechasFin[0] || null);

    if (!fechaInicio || !fechaFin) {
      throw ApiError.badRequest('No se encontraron fechas de inicio o fin del semestre en el Excel. Verifique las columnas "fecha_inicio" y "fecha_fin".');
    }
    if (fechaInicio >= fechaFin) {
      throw ApiError.badRequest('La fecha de inicio del semestre debe ser anterior a la fecha de fin.');
    }

    // Postgres: fecha_inicio_semestre/fecha_fin_semestre ya no son columnas
    // por-fila de `programaciones` (viven una sola vez en
    // `programacion_semestres`); no hace falta llevarlas en cada registro.
    const registrosLimpios = limpios.map(({ _fecha_inicio_raw, _fecha_fin_raw, ...rest }) => rest);

    const consolidados = this._unificarHorarios(registrosLimpios);
    logger.info('Importación de programación', {
      filas: rows.length,
      validos: limpios.length,
      consolidados: consolidados.length,
      semestre: semestreCodigo,
    });

    // Upsert metadatos del semestre ANTES del bulkInsert: `programaciones.semestre_id`
    // es una FK NOT-NULL-worthy hacia `programacion_semestres`, así que la fila
    // de semestre debe existir primero (si no, el bulkInsert insertaría con
    // semestre_id NULL y las lecturas por semestre dejarían de encontrarlas).
    let codigoRaw = semestreCodigo;
    let anio = 0;
    let periodo = '0';

    const rawCode = limpios.find((r) => r._semestre_raw)?._semestre_raw;
    if (rawCode) {
      try {
        const meta = normalizarCodigoSemestre(rawCode);
        codigoRaw = meta.codigo_raw;
        anio = meta.anio;
        periodo = String(meta.periodo);
      } catch { /* mantener defaults */ }
    } else {
      // Código ya normalizado: "YYYY-P" (ej: "2026-2")
      const parts = semestreCodigo.split('-');
      if (parts.length === 2) {
        anio = parseInt(parts[0], 10) || 0;
        periodo = parts[1] === '2' ? '2' : '1';
      }
    }

    const semestreRow = await semestreRepository.upsert({
      codigo_raw: codigoRaw,
      codigo: semestreCodigo,
      anio,
      periodo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      fecha_carga: new Date(),
      cargado_por: cargadoPor,
      total_registros: consolidados.length,
    });

    // Resolución de FKs nullable (docente_id, salon_id) — tolerante: el
    // importador de Excel puede referenciar personas/salones ausentes de
    // los catálogos; se deja el FK en NULL y se conserva el texto libre
    // (docente_nombre/aula) en vez de fallar la ingesta (Decision 8 del diseño).
    const documentosUnicos = [...new Set(consolidados.map((r) => r.numero_documento).filter((d) => d && d !== 'N/A'))];
    let personas = await comunidadRepository.findManyByDocumentos(documentosUnicos);
    const documentosExistentes = new Set(personas.map((p) => String(p.numero_documento).trim()));

    // Autocompletar `comunidad` con los docentes que trae el Excel (columna
    // `nroidenti`) pero que todavía no existen en el catálogo — el propio
    // archivo de programación ya es la fuente de verdad del documento, no
    // hace falta una sincronización manual aparte para vincular docente_id.
    const nombreDocumentoNuevo = new Map();
    for (const r of consolidados) {
      if (r.numero_documento && r.numero_documento !== 'N/A' && !documentosExistentes.has(r.numero_documento) && r.docente && r.docente !== 'No asignado') {
        if (!nombreDocumentoNuevo.has(r.numero_documento)) nombreDocumentoNuevo.set(r.numero_documento, r.docente);
      }
    }
    if (nombreDocumentoNuevo.size) {
      const nuevos = [...nombreDocumentoNuevo.entries()].map(([numero_documento, nombre]) => ({
        numero_documento,
        nombre,
        tipo: 'docente',
      }));
      await comunidadRepository.upsertMany(nuevos);
      logger.info('Docentes autocompletados en comunidad desde importación', { cantidad: nuevos.length });
      personas = await comunidadRepository.findManyByDocumentos(documentosUnicos);
    }

    const mapaDocenteId = Object.fromEntries(personas.map((p) => [String(p.numero_documento).trim(), p.id]));

    const aulasUnicas = [...new Set(consolidados.map((r) => r.aula).filter(Boolean))];
    const mapaSalonId = {};
    for (const aula of aulasUnicas) {
      const salon = await salonRepository.findByNombre(aula);
      if (salon) mapaSalonId[aula] = salon.id;
    }

    const registrosResueltos = consolidados.map(({ numero_documento, docente, ...rest }) => ({
      ...rest,
      docente_id: mapaDocenteId[numero_documento] || null,
      docente_nombre: docente,
      salon_id: rest.aula ? (mapaSalonId[rest.aula] || null) : null,
    }));

    const result = await programacionRepository.bulkInsert(registrosResueltos, semestreCodigo, semestreRow.id);

    return {
      insertados: result.insertados,
      semestre: semestreCodigo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
    };
  }

  /**
   * Limpia y normaliza filas del Excel mapeando columnas al schema interno.
   * @param {Array<Object>} rows - Filas crudas del Excel
   * @returns {Array<Object>} Registros válidos normalizados
   */
  _limpiarProgramacion(rows) {
    const MAPEO = {
      'nroidenti': 'numero_documento',
      'numero_documento': 'numero_documento',
      'Número de Documento': 'numero_documento',
      'profesor': 'docente',
      'docente': 'docente',
      'Docente': 'docente',
      'dia': 'dia',
      'Día': 'dia',
      'horario': 'horario',
      'Horario': 'horario',
      'hora_ini': 'hora_inicio',
      'hora_inicio': 'hora_inicio',
      'Hora Inicio': 'hora_inicio',
      'hora_fin': 'hora_fin',
      'Hora Fin': 'hora_fin',
      'aula': 'aula',
      'Aula': 'aula',
      'descripcion': 'facultad',
      'facultad': 'facultad',
      'Facultad': 'facultad',
      'FACULTAD': 'facultad',
      'descripcion_1': 'materia',
      'descripcion2': 'materia',
      'materia': 'codigo_materia',
      'Materia de la Clase': 'materia',
      'MATERIA': 'materia',
      'codigo_materia': 'codigo_materia',
      'Código de la Materia': 'codigo_materia',
      'grupo': 'grupo',
      'Grupo': 'grupo',
      'nivel_grupo': 'nivel_grupo',
      'Nivel del Grupo': 'nivel_grupo',
      'nro_estudiantes_premat': 'estudiantes_prematriculados',
      'estudiantes_prematriculados': 'estudiantes_prematriculados',
      'nro_estudiantes': 'estudiantes_matriculados',
      'estudiantes_matriculados': 'estudiantes_matriculados',
      'total_estudiantes': 'total_estudiantes',
      'semestre': 'semestre',
      'Semestre': 'semestre',
    };

    const validos = [];
    const rechazados = [];

    for (const row of rows) {
      const mapped = {};
      for (const [src, dest] of Object.entries(MAPEO)) {
        if (row[src] !== undefined && row[src] !== null) {
          mapped[dest] = row[src];
        }
      }

      const documento = cleanDocumento(mapped.numero_documento || '');
      if (!documento) {
        // Sin documento se acepta con valor por defecto, independientemente del aula
        mapped.numero_documento = 'N/A';
      } else {
        mapped.numero_documento = documento;
      }

      ['docente', 'dia', 'aula', 'facultad', 'materia', 'horario'].forEach((k) => {
        if (mapped[k]) mapped[k] = cleanText(mapped[k]);
      });

      // Normalizar nombre de aula: quitar guiones (ej: "M-303" → "M303", "CO-303" → "CO303")
      if (mapped.aula) mapped.aula = mapped.aula.replace(/-/g, '');

      if (!mapped.horario && mapped.hora_inicio && mapped.hora_fin) {
        mapped.horario = `${mapped.hora_inicio} A ${mapped.hora_fin}`;
      }

      if (mapped.horario && (!mapped.hora_inicio || !mapped.hora_fin)) {
        const [ini, fin] = String(mapped.horario).toUpperCase().split(' A ');
        if (ini) mapped.hora_inicio = ini.trim();
        if (fin) mapped.hora_fin = fin.trim();
      }

      mapped.hora_inicio = this._normalizarMinutos(mapped.hora_inicio);
      mapped.hora_fin = this._normalizarMinutos(mapped.hora_fin);

      mapped.estudiantes_prematriculados = parseInt(mapped.estudiantes_prematriculados, 10) || 0;
      mapped.estudiantes_matriculados = parseInt(mapped.estudiantes_matriculados, 10) || 0;
      mapped.total_estudiantes =
        (mapped.estudiantes_prematriculados + mapped.estudiantes_matriculados) || 0;

      // Normalizar el código de semestre y guardar raw para upsert de metadatos
      if (mapped.semestre) {
        try {
          const meta = normalizarCodigoSemestre(mapped.semestre);
          mapped._semestre_raw = meta.codigo_raw;
          mapped.semestre = meta.codigo;
        } catch {
          // si no normaliza, mantener valor original
        }
      }

      // Guardar fechas raw para extraerlas una sola vez en importar
      mapped._fecha_inicio_raw = row['fecha_inicio'] || row['Fecha Inicio'] || row['fecha_inicio_semestre'] || null;
      mapped._fecha_fin_raw = row['fecha_fin'] || row['Fecha Fin'] || row['fecha_fin_semestre'] || null;
      mapped.tipo = 'programacion';

      // Si tiene salón pero sin docente asignado, se incluye con valor por defecto
      if (!mapped.docente) mapped.docente = 'No asignado';

      // Solo se rechaza si no tiene día — aula es opcional (grupos fantasma no tienen salón)
      if (!mapped.dia) {
        rechazados.push({ motivo: 'sin día asignado' });
      } else {
        validos.push(mapped);
      }
    }

    return { validos, rechazados };
  }

  /** Redondea minutos 1-9 a :00 (ej: 7:05 → 7:00). */
  _normalizarMinutos(hora) {
    if (!hora) return hora;
    const parts = String(hora).split(':');
    if (parts.length < 2) return hora;
    const min = parseInt(parts[1], 10);
    if (min >= 1 && min <= 9) {
      return `${parts[0].padStart(2, '0')}:00`;
    }
    return hora;
  }

  async actualizarClase(id, data) {
    // 'docente' llega del cliente como nombre en texto libre → columna
    // docente_nombre. 'numero_documento' ya no es columna propia (se
    // resuelve a docente_id vía comunidad, tolerante si no hay match).
    const CAMPOS = ['docente', 'materia', 'facultad', 'dia', 'hora_inicio', 'hora_fin', 'aula', 'observaciones'];
    const update = {};
    for (const campo of CAMPOS) {
      if (data[campo] !== undefined) update[campo] = String(data[campo]).trim();
    }
    if (update.docente !== undefined) {
      update.docente_nombre = update.docente;
      delete update.docente;
    }
    if (update.hora_inicio && update.hora_fin) {
      update.horario = `${update.hora_inicio} A ${update.hora_fin}`;
    }
    if (update.aula) update.aula = update.aula.replace(/-/g, '');
    if (data.numero_documento !== undefined) {
      const persona = await comunidadRepository.findByDocumento(String(data.numero_documento).trim());
      update.docente_id = persona ? persona.id : null;
    }
    const clase = await programacionRepository.updateById(id, update);
    if (!clase) throw ApiError.notFound('Clase no encontrada');
    return clase;
  }

  /** Valida que un registro tenga los campos mínimos requeridos. */
  _esRegistroValido(r) {
    return !!(r.numero_documento && r.docente && r.dia && r.aula);
  }

  /**
   * Consolida bloques horarios consecutivos del mismo docente/aula/materia en un solo registro.
   * @param {Array<Object>} registros - Registros limpios
   * @returns {Array<Object>} Registros con horarios unificados
   */
  _unificarHorarios(registros) {
    const CAMPOS_AGRUPACION = [
      'semestre', 'codigo_materia', 'grupo', 'nivel_grupo',
      'numero_documento', 'dia', 'aula', 'facultad',
    ];

    const grupos = new Map();
    for (const reg of registros) {
      const clave = CAMPOS_AGRUPACION.map((c) => normalizeUpperString(reg[c])).join('|');
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(reg);
    }

    const resultado = [];

    for (const bloques of grupos.values()) {
      bloques.sort((a, b) => {
        const minA = horaAMinutos(a.hora_inicio || '00:00') ?? 0;
        const minB = horaAMinutos(b.hora_inicio || '00:00') ?? 0;
        return minA - minB;
      });

      let actual = { ...bloques[0] };

      for (let i = 1; i < bloques.length; i++) {
        const siguiente = bloques[i];
        const finActual = horaAMinutos(actual.hora_fin || '00:00');
        const inicioSiguiente = horaAMinutos(siguiente.hora_inicio || '00:00');

        if (finActual !== null && inicioSiguiente !== null && finActual === inicioSiguiente) {
          actual.hora_fin = siguiente.hora_fin;
          actual.horario = `${actual.hora_inicio} A ${actual.hora_fin}`;
          actual.estudiantes_prematriculados = Math.max(
            actual.estudiantes_prematriculados || 0,
            siguiente.estudiantes_prematriculados || 0,
          );
          actual.estudiantes_matriculados = Math.max(
            actual.estudiantes_matriculados || 0,
            siguiente.estudiantes_matriculados || 0,
          );
          actual.total_estudiantes = Math.max(
            actual.total_estudiantes || 0,
            siguiente.total_estudiantes || 0,
          );
        } else {
          resultado.push(actual);
          actual = { ...siguiente };
        }
      }

      resultado.push(actual);
    }

    return resultado;
  }

  /**
   * Valida si un codigo_materia puede ser vinculado como fantasma dentro de un semestre.
   * Condición 1: ningún registro de esa materia debe tener aula asignada.
   * Condición 2: ningún registro debe ser ya fantasma de otro grupo.
   */
  async validarFantasma(semestre, codigo_materia) {
    const todosRegistros = await programacionRepository.findByCodigoMateriaYSemestre(semestre, codigo_materia);
    if (!todosRegistros.length) return { grupos: [] };

    const gruposMap = {};
    for (const r of todosRegistros) {
      const key = r.grupo != null ? String(r.grupo) : '';
      if (!gruposMap[key]) gruposMap[key] = [];
      gruposMap[key].push(r);
    }

    const grupos = Object.entries(gruposMap).map(([grupo, registros]) => {
      const conAula = registros.find((r) => r.aula && r.aula.trim() !== '');
      if (conAula) return { grupo, puede: false, razon: 'Tiene salón asignado' };
      const yaFantasma = registros.find((r) => r.tipo === 'fantasma' && r.fantasma_de_codigo_materia);
      if (yaFantasma) return { grupo, puede: false, razon: `Ya es fantasma de "${yaFantasma.fantasma_de_codigo_materia}"` };
      return { grupo, puede: true, razon: null };
    });

    return { grupos };
  }

  /**
   * Vincula todos los registros de codigo_materia_fantasma como fantasma del registro principal (idPrincipal).
   * Suma los estudiantes del fantasma al registro principal.
   */
  async vincularFantasma(idPrincipal, codigo_materia_fantasma, grupo_fantasma) {
    const principal = await programacionRepository.findById(idPrincipal);
    if (!principal) throw ApiError.notFound('Registro principal no encontrado');
    if (principal.tipo !== 'regular') {
      throw ApiError.badRequest('Solo registros de tipo programación pueden tener fantasmas');
    }

    const { grupos } = await this.validarFantasma(principal.semestre, codigo_materia_fantasma);
    const grupoInfo = grupos.find((g) => String(g.grupo) === String(grupo_fantasma));
    if (!grupoInfo) {
      throw ApiError.badRequest(`No se encontró el grupo "${grupo_fantasma}" de la materia "${codigo_materia_fantasma}" en el semestre ${principal.semestre}.`);
    }
    if (!grupoInfo.puede) throw ApiError.badRequest(grupoInfo.razon);

    const registrosFantasma = await programacionRepository.findByCodigoMateriaGrupoYSemestre(
      principal.semestre, codigo_materia_fantasma, grupo_fantasma
    );

    await programacionRepository.updateManyByCodigoMateriaYGrupo(
      principal.semestre, codigo_materia_fantasma, grupo_fantasma,
      { tipo: 'fantasma', fantasma_de: principal.codigo_materia }
    );

    const totalFantasma = registrosFantasma.reduce((max, r) => Math.max(max, r.total_estudiantes || 0), 0);
    const nuevoTotal = (principal.total_estudiantes || 0) + totalFantasma;
    const actualizado = await programacionRepository.updateById(idPrincipal, { total_estudiantes: nuevoTotal });

    logger.info('Fantasma vinculado', {
      principal: principal.codigo_materia,
      fantasma: codigo_materia_fantasma,
      grupo: grupo_fantasma,
      semestre: principal.semestre,
    });
    return actualizado;
  }

  /**
   * Desvincula un fantasma del registro principal, restaurando su tipo a 'programacion'.
   * Resta los estudiantes del fantasma al registro principal.
   */
  async desvincularFantasma(idPrincipal, codigo_materia_fantasma, grupo_fantasma) {
    const principal = await programacionRepository.findById(idPrincipal);
    if (!principal) throw ApiError.notFound('Registro principal no encontrado');

    const registrosFantasma = await programacionRepository.findByCodigoMateriaGrupoYSemestre(
      principal.semestre, codigo_materia_fantasma, grupo_fantasma
    );

    const sonDeEste = registrosFantasma.filter(
      (r) => r.tipo === 'fantasma' && r.fantasma_de_codigo_materia === principal.codigo_materia
    );
    if (!sonDeEste.length) {
      throw ApiError.badRequest(`El grupo "${grupo_fantasma}" de "${codigo_materia_fantasma}" no es fantasma de "${principal.codigo_materia}"`);
    }

    await programacionRepository.updateManyByCodigoMateriaYGrupo(
      principal.semestre, codigo_materia_fantasma, grupo_fantasma,
      { tipo: 'regular', fantasma_de: '' }
    );

    const totalFantasma = registrosFantasma.reduce((max, r) => Math.max(max, r.total_estudiantes || 0), 0);
    const nuevoTotal = Math.max(0, (principal.total_estudiantes || 0) - totalFantasma);
    const actualizado = await programacionRepository.updateById(idPrincipal, { total_estudiantes: nuevoTotal });

    logger.info('Fantasma desvinculado', {
      principal: principal.codigo_materia,
      fantasma: codigo_materia_fantasma,
      grupo: grupo_fantasma,
      semestre: principal.semestre,
    });
    return actualizado;
  }
}

module.exports = new ProgramacionService();
