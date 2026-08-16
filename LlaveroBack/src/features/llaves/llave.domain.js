'use strict';

const {
  horaAMinutos,
  getDiaActual,
  getFechaHoy,
  formatMinutos,
  calcularRetrasoDevolucionMinutos,
  calcularDuracionMinutos,
  calcularTiempoRetrasoMinutos,
} = require('../../shared/utils/date.helper');
const {
  normalizeString,
  normalizeDocumento,
  normalizeHorario,
  normalizeAula,
} = require('../../shared/utils/normalize.helper');

const normalizarDocumento = normalizeDocumento;

// NOTA S4: `matchMonitorClase` (comparación en memoria de materia/dia/horario
// entre una asignación de monitor y una clase de programación) se elimina —
// `monitores.programacion_id` es ahora un FK real a una fila concreta de
// `programaciones`, así que `llave.context.js` resuelve la clase de un
// monitor con un JOIN SQL en vez de este matching por string.

/** Determina si un horario de clase ya fue cubierto por algún préstamo registrado hoy. */
function horarioCubiertoPorPrestamo(horarioClase, horariosProcesados) {
  const partes = normalizeHorario(horarioClase).split(' A ');
  const claseInicio = horaAMinutos(partes[0]?.trim());
  const claseFin = horaAMinutos(partes[1]?.trim());
  if (claseInicio === null || claseFin === null) return false;

  return (horariosProcesados || []).some((horarioProcesado) => {
    const procesado = normalizeHorario(horarioProcesado).split(' A ');
    const inicioProcesado = horaAMinutos(procesado[0]?.trim());
    const finProcesado = horaAMinutos(procesado[1]?.trim());
    if (inicioProcesado === null || finProcesado === null) return false;
    return claseInicio >= inicioProcesado && claseFin <= finProcesado;
  });
}

/**
 * Agrupa clases consecutivas del mismo docente/aula en un solo bloque horario.
 * Ejemplo: 7:00-8:00 + 8:00-9:00 → 7:00-9:00
 * @param {Array} clases - Clases del día a agrupar
 * @returns {Array} Clases con horarios consolidados
 */
function agruparClasesConsecutivas(clases = []) {
  const grupos = new Map();

  for (const clase of clases) {
    const documento = normalizarDocumento(clase?.numero_documento);
    const aula = normalizeAula(clase?.aula);
    const key = `${documento}||${aula}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(clase);
  }

  const resultado = [];

  for (const bloques of grupos.values()) {
    if (bloques.length === 1) {
      resultado.push({ ...bloques[0], _clasesOriginales: [bloques[0]] });
      continue;
    }

    bloques.sort((a, b) => {
      const inicioA = normalizeHorario(a?.horario).split(' A ')[0]?.trim();
      const inicioB = normalizeHorario(b?.horario).split(' A ')[0]?.trim();
      return (horaAMinutos(inicioA) ?? 0) - (horaAMinutos(inicioB) ?? 0);
    });

    let actual = { ...bloques[0] };
    let materias = [actual.materia || ''];
    let originales = [bloques[0]];

    for (let i = 1; i < bloques.length; i += 1) {
      const siguiente = bloques[i];
      const finActualStr = normalizeHorario(actual?.horario).split(' A ')[1]?.trim();
      const inicioSiguienteStr = normalizeHorario(siguiente?.horario).split(' A ')[0]?.trim();
      const finActual = horaAMinutos(finActualStr);
      const inicioSiguiente = horaAMinutos(inicioSiguienteStr);

      if (finActual !== null && inicioSiguiente !== null && finActual === inicioSiguiente) {
        const horaInicio = normalizeHorario(actual?.horario).split(' A ')[0]?.trim();
        const horaFin = normalizeHorario(siguiente?.horario).split(' A ')[1]?.trim();
        actual.horario = `${horaInicio} A ${horaFin}`;
        actual.hora_fin = horaFin;
        materias.push(siguiente.materia || '');
        originales.push(siguiente);
      } else {
        actual.materia = [...new Set(materias.filter(Boolean))].join(', ');
        actual._clasesOriginales = originales;
        resultado.push(actual);
        actual = { ...siguiente };
        materias = [siguiente.materia || ''];
        originales = [siguiente];
      }
    }

    actual.materia = [...new Set(materias.filter(Boolean))].join(', ');
    actual._clasesOriginales = originales;
    resultado.push(actual);
  }

  return resultado;
}

/**
 * Igual que `construirRegistroPrestamo`, pero cuando la clase viene de un
 * grupo de clases consecutivas fusionadas (`clase._clasesOriginales` con más
 * de un elemento — ver `agruparClasesConsecutivas`), genera UN registro por
 * clase original en vez de uno solo con horario combinado, para que el
 * historial refleje cada materia por separado aunque el docente solo haya
 * escaneado el carnet una vez. Los registros se encadenan automáticamente:
 * cada uno salvo el último se cierra (`fecha_hora_devolucion`) en el límite
 * de su propia clase, y el siguiente se abre en ese mismo instante — solo el
 * último queda `en_prestamo` de verdad, a la espera de la devolución física.
 * @param {object} params - mismos params que `construirRegistroPrestamo`
 * @returns {object[]} uno o más registros a persistir, en orden cronológico
 */
function construirRegistrosPrestamo(params) {
  const { clase, ahora = new Date() } = params;
  const todas = clase?._clasesOriginales?.length ? clase._clasesOriginales : [clase];

  if (todas.length === 1) {
    const registro = construirRegistroPrestamo(params);
    registro._origenClase = todas[0];
    return [registro];
  }

  const fechaBase = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

  function limiteDeClase(claseOriginal) {
    const horaFin = normalizeHorario(claseOriginal?.horario).split(' A ')[1]?.trim() || claseOriginal?.hora_fin;
    if (!horaFin) return null;
    const [h, m] = String(horaFin).split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return new Date(`${fechaBase}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`);
  }

  // Si la entrega (física o manual) ocurre tarde — durante una clase
  // posterior del mismo bloque — no se fabrican registros retroactivos para
  // las clases que ya terminaron sin que el docente reclamara la llave;
  // la cadena arranca en la primera clase que aún no ha terminado.
  const originales = todas.filter((c) => {
    const limite = limiteDeClase(c);
    return !limite || limite > ahora;
  });
  if (!originales.length) originales.push(todas[todas.length - 1]);

  if (originales.length === 1) {
    const registro = construirRegistroPrestamo({ ...params, clase: originales[0] });
    registro._origenClase = originales[0];
    return [registro];
  }

  let entregaActual = ahora;

  return originales.map((claseOriginal, i) => {
    const esUltima = i === originales.length - 1;
    const registro = construirRegistroPrestamo({ ...params, clase: claseOriginal });
    registro._origenClase = claseOriginal;
    registro.fecha_hora_entrega = entregaActual;

    if (!esUltima) {
      const limite = limiteDeClase(claseOriginal);
      registro.fecha_hora_devolucion = limite;
      registro.duracion_minutos = limite ? calcularDuracionMinutos(entregaActual, limite) : null;
      registro.estado = 'entregado';
      registro.tipo_devolucion = 'automatica';
      entregaActual = limite || entregaActual;
    }

    if (i > 0) {
      // Solo la primera clase refleja el retraso/anticipación real del
      // reclamo del docente; las siguientes son continuaciones automáticas
      // del mismo préstamo físico, no un nuevo reclamo.
      registro.se_reclamo_a_tiempo = true;
      registro.tiempo_retraso_minutos = null;
      registro.retraso_entrega = false;
    }

    return registro;
  });
}

/** Encuentra la clase más cercana al horario actual que aún no ha terminado. */
function encontrarClaseActual(clases = [], minutosAhora) {
  let mejorClase = null;
  let menorDiff = Number.POSITIVE_INFINITY;

  for (const clase of clases) {
    const horario = normalizeHorario(clase?.horario);
    const partes = horario.split(' A ');
    if (partes.length < 2) continue;

    const inicio = horaAMinutos(partes[0]?.trim());
    const fin = horaAMinutos(partes[1]?.trim());
    if (inicio === null || fin === null) continue;

    if (minutosAhora <= fin) {
      const diff = Math.abs(minutosAhora - inicio);
      if (diff < menorDiff) {
        menorDiff = diff;
        mejorClase = clase;
      }
    }
  }

  return mejorClase;
}

function construirClasesProcesadas(registros = []) {
  return registros.map((registro) => ({
    documento: normalizarDocumento(registro?.numero_documento),
    horario: normalizeString(registro?.horario),
    aula: normalizeAula(registro?.aula),
  }));
}

function construirResultadoError({ contexto = {}, persona = null, mensaje = '' }) {
  return {
    tipo: 'error',
    mensaje,
    docente: contexto.docente,
    persona,
    rol: contexto.rol,
  };
}

function construirResultadoSinClase({ contexto = {}, persona = null, mensaje = 'No hay clases disponibles' }) {
  return {
    tipo: 'sin_clase',
    mensaje,
    docente: contexto.docente,
    persona,
    rol: contexto.rol,
  };
}

function construirResultadoAnticipado({ contexto = {}, persona = null, clase = null }) {
  return {
    tipo: 'anticipado',
    docente: contexto.docente,
    persona,
    rol: contexto.rol,
    clase,
    se_reclamo_a_tiempo: true,
    mensaje: `${contexto.rol === 'monitor' ? 'El monitor' : 'El docente'} está reclamando la llave con anticipación`,
  };
}

function construirResultadoPrestamo({
  contexto = {},
  persona = null,
  clase = null,
  registro = null,
  ubicacion = '',
  seReclamoATiempo = true,
  tiempoRetraso = '',
}) {
  return {
    tipo: 'prestamo',
    docente: contexto.docente,
    persona,
    rol: contexto.rol,
    clase,
    registro,
    ubicacion,
    se_reclamo_a_tiempo: seReclamoATiempo,
    tiempo_retraso: tiempoRetraso,
  };
}

function construirResultadoDevolucion({
  contexto = {},
  persona = null,
  result = {},
  ubicacion = '',
}) {
  return {
    tipo: 'devolucion',
    ...result,
    docente: contexto.docente,
    persona,
    rol: contexto.rol,
    ubicacion,
  };
}

/**
 * Construye el objeto de registro de préstamo con todos los campos que
 * `llave.repository.js` necesita para resolver los FKs reales
 * (comunidad_id/programacion_id/salon_id/ubicacion_*_id) — sigue siendo una
 * función pura (sin acceso a BD): entrega los mismos campos "de negocio"
 * (numero_documento, aula, ubicacion como clave string, etc.) que antes, el
 * repositorio es quien traduce a columnas/FK. `tiempo_retraso` pasa de
 * string formateado a minutos enteros (`tiempo_retraso_minutos`) para
 * calzar con la columna Postgres; `duracion_minutos`/
 * `tiempo_retraso_devolucion_minutos` se calculan igual en la devolución.
 * @param {string|null} [programacionId] - id de `programaciones` si la clase proviene de programación/reserva semestral (null para individual)
 */
function construirRegistroPrestamo({
  docente,
  clase,
  seReclamoATiempo,
  tiempoRetraso,
  reclamaInfo = {},
  tipoEntrega = 'carnet',
  ubicacionPrestamo,
  origenRegistro = 'programacion',
  programacionId = null,
  gestionadoPorUsuarioId = null,
}) {
  return {
    numero_documento: normalizarDocumento(docente?.numero_documento),
    docente: docente?.nombre || '',
    dia: clase?.dia || getDiaActual(),
    horario: clase?.horario || '',
    aula: clase?.aula || '',
    facultad: clase?.facultad || 'No especificada',
    materia: clase?.materia || '',
    // `clase?.id` solo es un id real de `programaciones` cuando la clase
    // viene de programación/reserva semestral — una reserva individual usa
    // el id de su propia tabla (`reservas`), que rompería el FK si se
    // guardara acá.
    programacion_id: programacionId ?? (clase?._origen === 'individual' ? null : clase?.id ?? null),
    // Necesario para que la guarda de duplicados (dedupe por
    // comunidad_id+salon_id+dia_entrega+horario) aplique también al flujo
    // NFC/carnet — antes solo se fijaba en la entrega manual, así que dos
    // lecturas NFC duplicadas para la misma franja nunca chocaban (NULL no
    // es igual a NULL en un índice único de Postgres).
    dia_entrega: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
    fecha_hora_entrega: new Date(),
    fecha_hora_devolucion: null,
    duracion_minutos: null,
    se_reclamo_a_tiempo: seReclamoATiempo,
    tiempo_retraso_minutos: typeof tiempoRetraso === 'number' ? tiempoRetraso : null,
    retraso_entrega: false,
    tiempo_retraso_devolucion_minutos: null,
    tipo_entrega: tipoEntrega,
    tipo_devolucion: '',
    origen_registro: origenRegistro,
    ubicacion_prestamo: ubicacionPrestamo,
    ubicacion_devolucion: '',
    quien_reclama: reclamaInfo.quien || 'docente',
    numero_documento_reclama: reclamaInfo.documento || normalizarDocumento(docente?.numero_documento),
    nombre_reclama: reclamaInfo.nombre || docente?.nombre || '',
    quien_entrega: '',
    numero_documento_entrega: '',
    nombre_entrega: '',
    estado: 'en_prestamo',
    gestionado_por_usuario_id: gestionadoPorUsuarioId,
  };
}

/**
 * Adaptador de entrega manual: recalcula horario/retraso desde `infoClase`
 * (igual que la versión anterior de un solo registro), pero delega el
 * armado de la(s) fila(s) a `construirRegistrosPrestamo` — así, si la clase
 * en la que se hizo clic forma parte de un bloque de clases consecutivas del
 * mismo docente+aula (`grupoClase._clasesOriginales`, resuelto por
 * `buscarClaseParaConfirmacion` antes de llamar acá), la entrega manual
 * encadena automáticamente el resto de la sesión igual que el flujo NFC, sin
 * que el auxiliar tenga que repetir "Entregar" por cada clase.
 * @param {object} params
 * @param {object|null} [params.grupoClase] - clase agrupada (con `_clasesOriginales`) si `infoClase` es parte de un bloque consecutivo
 */
function construirRegistrosEntregaManual({
  infoClase,
  documento,
  ubicacionPrestamo,
  origenRegistro,
  gestionadoPorUsuarioId = null,
  grupoClase = null,
}) {
  const ahora = new Date();
  const horario = (infoClase?.hora_inicio && infoClase?.hora_fin)
    ? `${infoClase.hora_inicio} A ${infoClase.hora_fin}`
    : '';
  const tiempoRetrasoMinutos = horario ? calcularTiempoRetrasoMinutos(horario, ahora) : null;
  const seReclamoATiempo = horario ? !tiempoRetrasoMinutos : true;
  const diaRegistro = infoClase?.dia
    || ahora.toLocaleDateString('es-CO', { weekday: 'long' }).replace(/^./, (char) => char.toUpperCase());

  const clase = {
    id: infoClase?.programacion_id || null,
    dia: diaRegistro || getDiaActual(),
    horario,
    aula: infoClase?.aula || '',
    facultad: infoClase?.facultad || 'No especificada',
    materia: infoClase?.motivo || '',
    _clasesOriginales: grupoClase?._clasesOriginales,
  };
  const docente = { numero_documento: documento, nombre: infoClase?.profesor || '' };
  const reclamaInfo = {
    quien: infoClase?.quien_reclama || 'docente',
    documento: infoClase?.numero_documento_reclama || documento,
    nombre: infoClase?.nombre_reclama || infoClase?.profesor || '',
  };

  const registros = construirRegistrosPrestamo({
    docente,
    clase,
    seReclamoATiempo,
    tiempoRetraso: tiempoRetrasoMinutos,
    reclamaInfo,
    tipoEntrega: 'manual',
    ubicacionPrestamo,
    origenRegistro,
    gestionadoPorUsuarioId,
    ahora,
  });

  // `construirRegistroPrestamo` no marca `retraso_entrega` (ese cálculo vive
  // fuera, en el flujo NFC) — la entrega manual sí lo calculaba ella misma;
  // se preserva ese comportamiento en el primer registro de la cadena.
  registros[0].retraso_entrega = !seReclamoATiempo;

  return registros;
}

/** Construye los datos de actualización para una devolución (duración, retraso, estado). */
function construirDatosDevolucion({
  registro,
  entregaInfo = {},
  ubicacionPorDefecto = '',
  gestionadoPorUsuarioId = null,
}) {
  const ahora = new Date();
  const fechaEntrega = registro?.fecha_hora_entrega instanceof Date
    ? registro.fecha_hora_entrega
    : (registro?.fecha_hora_entrega ? new Date(registro.fecha_hora_entrega) : null);
  const fechaStr = fechaEntrega && !Number.isNaN(fechaEntrega.getTime())
    ? fechaEntrega.toISOString().split('T')[0]
    : getFechaHoy();
  const retrasoDevolucionMinutos = calcularRetrasoDevolucionMinutos(registro?.horario, fechaStr, ahora);

  return {
    mensaje: `Llave devuelta por ${entregaInfo.nombre || registro?.docente}`,
    updates: {
      fecha_hora_devolucion: ahora,
      duracion_minutos: calcularDuracionMinutos(fechaEntrega, ahora),
      tiempo_retraso_devolucion_minutos: retrasoDevolucionMinutos,
      retraso_entrega: !!retrasoDevolucionMinutos,
      estado: 'entregado',
      tipo_devolucion: entregaInfo.canal === 'carnet' ? 'carnet' : 'manual',
      ubicacion_devolucion: entregaInfo.ubicacion || ubicacionPorDefecto,
      quien_entrega: entregaInfo.quien || 'docente',
      numero_documento_entrega: entregaInfo.documento || registro?.numero_documento,
      nombre_entrega: entregaInfo.nombre || registro?.docente,
      gestionado_por_usuario_id: gestionadoPorUsuarioId,
    },
  };
}

/**
 * Devuelve el estado real del registro.
 * Los estados (en_mora, demora_entrega) son escritos por el scheduler según
 * la configuración del admin; ya no se calculan con un hardcode visual.
 * @param {Object} registro
 * @param {number} _limiteHorasDemora - obsoleto, mantenido por compatibilidad
 * @returns {'entregado'|'en_prestamo'|'en_mora'|'demora_entrega'}
 */
function calcularEstadoVisual(registro, _limiteHorasDemora) {
  if (registro?.fecha_hora_devolucion) return 'entregado';
  return registro?.estado || 'en_prestamo';
}

/** Transforma un registro de BD al formato esperado por el frontend. */
function toClientFormat(registro, limiteHorasDemora = 4) {
  // Usar timezone Bogotá (UTC-5, sin DST) para que la fecha sea correcta aunque el servidor corra en UTC
  const formatDate = (value) =>
    value instanceof Date
      ? value.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      : '';
  const formatTime = (value) =>
    value instanceof Date
      ? value.toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false })
      : '';

  // duracion_minutos/tiempo_retraso_minutos/tiempo_retraso_devolucion_minutos
  // se almacenan como enteros (S4, Postgres); se reformatean aquí al texto
  // que ya consume el frontend ("2h 15min"), sin cambiar el contrato HTTP.
  const formatMin = (value) => (value === null || value === undefined ? '' : formatMinutos(value));

  return {
    id: registro?.id,
    documento: normalizarDocumento(registro?.numero_documento),
    docente: registro?.docente_nombre ?? registro?.docente,
    dia: registro?.dia,
    horario: registro?.horario,
    aula: registro?.aula,
    facultad: registro?.facultad,
    materia: registro?.materia,
    fechaEntrega: formatDate(registro?.fecha_hora_entrega),
    horaEntrega: formatTime(registro?.fecha_hora_entrega),
    fechaDevolucion: formatDate(registro?.fecha_hora_devolucion),
    horaDevolucion: formatTime(registro?.fecha_hora_devolucion),
    duracion: formatMin(registro?.duracion_minutos),
    seReclamoATiempo: registro?.se_reclamo_a_tiempo,
    tiempoRetraso: formatMin(registro?.tiempo_retraso_minutos),
    retrasoEntrega: registro?.retraso_entrega,
    tiempoRetrasoDevolucion: formatMin(registro?.tiempo_retraso_devolucion_minutos),
    ubicacionPrestamo: registro?.ubicacion_prestamo || '',
    ubicacionDevolucion: registro?.ubicacion_devolucion || '',
    quienReclama: registro?.quien_reclama || '',
    documentoReclama: registro?.numero_documento_reclama || '',
    nombreReclama: registro?.nombre_reclama || '',
    quienEntrega: registro?.quien_entrega || '',
    documentoEntrega: registro?.numero_documento_entrega || '',
    nombreEntrega: registro?.nombre_entrega || '',
    tipoEntrega: registro?.tipo_entrega || '',
    tipoDevolucion: registro?.tipo_devolucion || '',
    origenRegistro: registro?.origen_registro || '',
    estado: calcularEstadoVisual(registro, limiteHorasDemora),
  };
}

module.exports = {
  normalizarDocumento,
  horarioCubiertoPorPrestamo,
  agruparClasesConsecutivas,
  encontrarClaseActual,
  construirClasesProcesadas,
  construirResultadoError,
  construirResultadoSinClase,
  construirResultadoAnticipado,
  construirResultadoPrestamo,
  construirResultadoDevolucion,
  construirRegistroPrestamo,
  construirRegistrosPrestamo,
  construirRegistrosEntregaManual,
  construirDatosDevolucion,
  calcularEstadoVisual,
  toClientFormat,
};
