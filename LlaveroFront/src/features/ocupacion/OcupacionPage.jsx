import { useMemo, useState, useCallback } from 'react';
import { Activity, Building2, FileSpreadsheet, Filter, Info, Moon, Percent, Search, Sun, Users } from 'lucide-react';
import { useOcupacion, useDetalleAulaDia } from './ocupacionApi';
import { useSemestres } from '@/features/programacion/programacionApi';
import Button from '@/shared/components/ui/Button';
import { FormField, Select } from '@/shared/components/ui/FormField';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/shared/components/ui/Sheet';
import { cn } from '@/shared/lib/utils';
import { showError } from '@/shared/utils/alert';

// Regla de negocio institucional (misma que aplica el backend en
// programacion.service.js:obtenerOcupacion): diurna 7:00-18:00 y nocturna
// 18:00-22:00 de lunes a viernes; sábado solo diurna; domingo sin servicio.
const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const DIAS_LABEL = { LUNES: 'Lun', MARTES: 'Mar', MIERCOLES: 'Mié', JUEVES: 'Jue', VIERNES: 'Vie', SABADO: 'Sáb' };
const HOURS_DIURNA_MF = 11;
const HOURS_NOCTURNA_MF = 4;
const HOURS_DIURNA_SAT = 11;
const WEEKLY_DIURNA = HOURS_DIURNA_MF * 5 + HOURS_DIURNA_SAT; // 66
const WEEKLY_NOCTURNA = HOURS_NOCTURNA_MF * 5; // 20
const TOTAL_WEEKLY_HOURS = WEEKLY_DIURNA + WEEKLY_NOCTURNA; // 86

// Opacidad más alta en claro (fondo blanco lava los tonos pastel) y más baja
// en oscuro (donde ya resaltan de sobra) — mismos 3 umbrales de la leyenda.
function heatmapClass(pct) {
  if (pct <= 40) return 'bg-emerald-500/25 dark:bg-emerald-500/15 border-emerald-600/50 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400';
  if (pct <= 75) return 'bg-amber-500/25 dark:bg-amber-500/15 border-amber-600/50 dark:border-amber-500/40 text-amber-700 dark:text-amber-400';
  return 'bg-red-500/25 dark:bg-red-500/15 border-red-600/50 dark:border-red-500/40 text-red-700 dark:text-red-400';
}

function fmtH(h) {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function fmtPct(pct) {
  return `${pct.toFixed(2)}%`;
}

function JornadaBadge({ diurna }) {
  const Icon = diurna ? Sun : Moon;
  const rango = diurna ? '7:00-18:00' : '18:00-22:00';
  return (
    <span
      className={cn(
        'inline-flex flex-col items-start gap-0.5 rounded-lg px-2 py-1',
        diurna
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
          : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-xs">
        <Icon className="h-3.5 w-3.5" /> {diurna ? 'Diurna' : 'Nocturna'}
      </span>
      <span className="text-[10px] opacity-75">{rango}</span>
    </span>
  );
}

function BarraRanking({ label, sub, pct, valor }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className="text-foreground font-medium truncate">{label}</span>
        <span className="text-muted-foreground shrink-0">{valor}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', heatmapClass(pct).split(' ')[0].replace('/25', '').replace('/15', ''))} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Nombres de facultad pueden ser muy largos ("LICENCIATURA EN LENGUAS
// EXTRANJERAS CON ENFASIS EN INGLES") — una barra de progreso no deja
// espacio legible. Lista numerada, el nombre se envuelve en vez de truncar.
function ListaRanking({ items, valorDe }) {
  return (
    <ol className="space-y-2.5">
      {items.map((r, i) => (
        <li key={r.nombre} className="flex items-start gap-2.5">
          <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
            {i + 1}
          </span>
          <span className="flex-1 text-xs text-foreground leading-snug">{r.nombre}</span>
          <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">{valorDe(r)}</span>
        </li>
      ))}
    </ol>
  );
}

const COLORES_TORTA = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#64748b'];

// Torta en SVG puro (sin librería) — cada slice es un arco de círculo vía
// stroke-dasharray sobre un <circle>, más liviano que traer una lib de
// charts solo para esto.
const DONUT_LEYENDA_VISIBLE = 8;

function DonutChart({ datos }) {
  const [expandido, setExpandido] = useState(null);
  const [verTodaLeyenda, setVerTodaLeyenda] = useState(false);
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) return <p className="text-sm text-muted-foreground text-center py-6">Sin datos</p>;
  const R = 40;
  const C = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <svg viewBox="0 0 100 100" className="w-32 h-32 shrink-0">
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
          {datos.map((d, i) => {
            const frac = d.valor / total;
            const dash = frac * C;
            const el = (
              <circle
                key={d.nombre}
                cx="50" cy="50" r={R} fill="none"
                stroke={COLORES_TORTA[i % COLORES_TORTA.length]}
                strokeWidth="16"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-acumulado}
              />
            );
            acumulado += dash;
            return el;
          })}
        </g>
      </svg>
      <div className="flex-1 min-w-[140px] space-y-1.5">
        {(verTodaLeyenda ? datos : datos.slice(0, DONUT_LEYENDA_VISIBLE)).map((d) => {
          const i = datos.indexOf(d);
          const abierto = expandido === d.nombre;
          return (
            <div key={d.nombre}>
              <button
                type="button"
                onClick={() => setExpandido(abierto ? null : d.nombre)}
                className="flex items-center justify-between gap-2 text-xs w-full text-left hover:opacity-80 transition-opacity"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORES_TORTA[i % COLORES_TORTA.length] }} />
                  <span className="text-foreground truncate">{d.nombre}</span>
                </span>
                <span className="text-muted-foreground shrink-0">{d.sub}</span>
              </button>
              {abierto && (
                <div className="flex flex-wrap gap-1 mt-1.5 ml-4">
                  {(d.aulas || []).map((a) => (
                    <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{a}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {datos.length > DONUT_LEYENDA_VISIBLE && (
          <button
            type="button"
            onClick={() => setVerTodaLeyenda((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {verTodaLeyenda ? 'Ver menos' : `Ver más (${datos.length - DONUT_LEYENDA_VISIBLE})`}
          </button>
        )}
      </div>
    </div>
  );
}

function Celda({ horas, pct, fuerte }) {
  if (!horas) return <span className="text-muted-foreground">-</span>;
  return (
    <span
      className={cn(
        'inline-flex flex-col items-center rounded-lg border px-2 py-1 leading-tight',
        fuerte ? 'text-xs font-semibold' : 'text-[11px]',
        heatmapClass(pct)
      )}
    >
      <span>{fmtH(horas)}h</span>
      <span className="opacity-80">{fmtPct(pct)}</span>
    </span>
  );
}

export default function OcupacionPage() {
  const [semestre, setSemestre] = useState('');
  const { data: semestres = [] } = useSemestres();
  const { data, isLoading, isError } = useOcupacion(semestre || undefined);

  const [facultad, setFacultad] = useState('ALL');
  const [bloque, setBloque] = useState('ALL');
  const [aulasSeleccionadas, setAulasSeleccionadas] = useState([]);
  const [detalleAula, setDetalleAula] = useState(null);
  const [detalleTab, setDetalleTab] = useState('estudiantes');
  const [pagina, setPagina] = useState(1);
  const AULAS_POR_PAGINA = 10;
  const [verTodasAulasChip, setVerTodasAulasChip] = useState(false);
  const [verTodasFacultadesChip, setVerTodasFacultadesChip] = useState(false);
  const [buscarAula, setBuscarAula] = useState('');
  const CHIPS_VISIBLES = 12;
  const [vista, setVista] = useState('matriz');
  const [buscarDocente, setBuscarDocente] = useState('');
  const [paginaDocentes, setPaginaDocentes] = useState(1);
  const DOCENTES_POR_PAGINA = 15;
  const [detalleDocente, setDetalleDocente] = useState(null);
  const [detalleDocenteTab, setDetalleDocenteTab] = useState('materias');
  const [franjaDetalle, setFranjaDetalle] = useState(null); // { aula, dia }
  // Qué KPI se abrió en el modal de desglose: 'global' | 'diurna' | 'nocturna'.
  const [kpiDetalle, setKpiDetalle] = useState(null);
  const [mostrarExplicacion86h, setMostrarExplicacion86h] = useState(false);
  const { data: clasesFranja = [], isLoading: cargandoFranja } = useDetalleAulaDia(
    franjaDetalle?.aula, franjaDetalle?.dia, semestre || undefined
  );

  const aulas = data?.aulas || {};
  const docentes = data?.docentes || [];

  const { facultades, bloques } = useMemo(() => {
    const fs = new Set();
    const bs = new Set();
    Object.values(aulas).forEach((a) => {
      (a.facultades || []).forEach((f) => fs.add(f));
      bs.add(a.bloque || 'SIN BLOQUE');
    });
    return { facultades: [...fs].sort(), bloques: [...bs].sort() };
  }, [aulas]);

  // Cascada: las opciones de aula dependen del bloque elegido — si cambia
  // el bloque, las aulas seleccionadas de otro bloque dejan de tener sentido.
  const aulasDelBloque = useMemo(() => {
    return Object.entries(aulas)
      .filter(([, a]) => bloque === 'ALL' || (a.bloque || 'SIN BLOQUE') === bloque)
      .map(([nombre]) => nombre)
      .sort();
  }, [aulas, bloque]);

  const aulasDelBloqueBuscadas = useMemo(() => {
    const q = buscarAula.trim().toUpperCase();
    if (!q) return aulasDelBloque;
    return aulasDelBloque.filter((n) => n.toUpperCase().includes(q));
  }, [aulasDelBloque, buscarAula]);

  // Facultad y Bloque son filtros globales (afectan Matriz, Análisis, Carga
  // Docente y el KPI de encabezado). El multi-select de Aula, en cambio, es
  // un drill-down exclusivo del tab "Matriz de Ocupación" (solo se puede
  // editar ahí, ver más abajo) — no debe alterar el KPI global ni las
  // agregaciones del tab Análisis, o de lo contrario quedan mostrando datos
  // parciales de una selección hecha en otro tab sin ningún indicio visual.
  const aulasFiltradas = useMemo(() => {
    return Object.entries(aulas)
      .filter(([, a]) => facultad === 'ALL' || (a.facultades || []).includes(facultad))
      .filter(([, a]) => bloque === 'ALL' || (a.bloque || 'SIN BLOQUE') === bloque)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [aulas, facultad, bloque]);

  // Igual que aulasFiltradas, pero además acotado por el multi-select de
  // Aula — usado solo por la tabla del tab Matriz y su export.
  const aulasMatriz = useMemo(() => {
    return aulasFiltradas.filter(([nombre]) => aulasSeleccionadas.length === 0 || aulasSeleccionadas.includes(nombre));
  }, [aulasFiltradas, aulasSeleccionadas]);

  // Reinicia a la página 1 cuando cambia el filtro — evita quedar en una
  // página vacía si el filtro anterior tenía más resultados que el nuevo.
  const totalPaginas = Math.max(1, Math.ceil(aulasMatriz.length / AULAS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const aulasPagina = useMemo(
    () => aulasMatriz.slice((paginaSegura - 1) * AULAS_POR_PAGINA, paginaSegura * AULAS_POR_PAGINA),
    [aulasMatriz, paginaSegura]
  );

  // Con una facultad filtrada, la tabla debe mostrar solo las horas que ESA
  // facultad ocupa en el aula, no el total del aula (todas las facultades).
  // `useCallback` para que los useMemo de abajo puedan declararlas como
  // dependencia en vez de capturarlas en silencio: sin identidad estable,
  // listarlas obligaría a recalcular todo en cada render.
  const horasDiurna = useCallback(
    (a, d) => (facultad !== 'ALL' && a.porFacultad?.[facultad] ? a.porFacultad[facultad].diurna[d] : a.diurna[d]) || 0,
    [facultad]
  );
  const horasNocturna = useCallback(
    (a, d) => (facultad !== 'ALL' && a.porFacultad?.[facultad] ? a.porFacultad[facultad].nocturna[d] : a.nocturna[d]) || 0,
    [facultad]
  );

  // Docentes con carga en al menos un aula del bloque filtrado (si hay uno) y
  // que dictan en la facultad filtrada (si hay una) — mismo criterio de
  // filtrado que aulasFiltradas, aplicado sobre el listado de docentes.
  const docentesFiltrados = useMemo(() => {
    const aulasDelBloqueSet = bloque === 'ALL' ? null : new Set(aulasDelBloque);
    const q = buscarDocente.trim().toUpperCase();
    return docentes
      .filter((d) => facultad === 'ALL' || d.facultades.includes(facultad))
      .filter((d) => !aulasDelBloqueSet || d.aulas.some((a) => aulasDelBloqueSet.has(a)))
      .filter((d) => !q || d.docente.toUpperCase().includes(q));
  }, [docentes, facultad, bloque, aulasDelBloque, buscarDocente]);

  const totalPaginasDocentes = Math.max(1, Math.ceil(docentesFiltrados.length / DOCENTES_POR_PAGINA));
  const paginaDocentesSegura = Math.min(paginaDocentes, totalPaginasDocentes);
  const docentesPagina = useMemo(
    () => docentesFiltrados.slice((paginaDocentesSegura - 1) * DOCENTES_POR_PAGINA, paginaDocentesSegura * DOCENTES_POR_PAGINA),
    [docentesFiltrados, paginaDocentesSegura]
  );

  /**
   * Two different questions, and mixing them up is the easy mistake here.
   *
   * `tasa` is how full each shift is against ITS OWN capacity — 66h/week for
   * diurna, 20h for nocturna. These are the real utilization rates and they do
   * NOT add up to the global figure.
   *
   * `aporte` is how many points of the global percentage each shift accounts
   * for, both measured against the same 86h denominator. These DO add up to
   * the global. A shift can be nearly full and still contribute few points,
   * simply because it spans fewer hours.
   */
  const kpiGlobal = useMemo(() => {
    const vacio = { global: 0, tasaDiurna: 0, tasaNocturna: 0, aporteDiurna: 0, aporteNocturna: 0, horasDiurna: 0, horasNocturna: 0 };
    if (!aulasFiltradas.length) return vacio;

    let sumDiurna = 0;
    let sumNocturna = 0;
    aulasFiltradas.forEach(([, a]) => {
      DIAS.forEach((d) => {
        sumDiurna += horasDiurna(a, d);
        sumNocturna += horasNocturna(a, d);
      });
    });

    const nAulas = aulasFiltradas.length;
    const maxTotal = nAulas * TOTAL_WEEKLY_HOURS;
    const maxDiurna = nAulas * WEEKLY_DIURNA;
    const maxNocturna = nAulas * WEEKLY_NOCTURNA;
    if (maxTotal <= 0) return vacio;

    return {
      global: ((sumDiurna + sumNocturna) / maxTotal) * 100,
      tasaDiurna: maxDiurna > 0 ? (sumDiurna / maxDiurna) * 100 : 0,
      tasaNocturna: maxNocturna > 0 ? (sumNocturna / maxNocturna) * 100 : 0,
      aporteDiurna: (sumDiurna / maxTotal) * 100,
      aporteNocturna: (sumNocturna / maxTotal) * 100,
      horasDiurna: sumDiurna,
      horasNocturna: sumNocturna,
    };
  }, [aulasFiltradas, horasDiurna, horasNocturna]);

  /**
   * Desglose del KPI abierto. Un porcentaje global esconde exactamente lo que
   * hace falta para decidir: un 2,50% nocturno no dice qué aulas están vacías
   * ni qué noches. Se calcula sobre `aulasFiltradas`, el mismo conjunto que
   * alimenta los KPIs, así que el total de acá siempre cuadra con la tarjeta.
   */
  const desgloseKpi = useMemo(() => {
    if (!kpiDetalle || !aulasFiltradas.length) return null;

    const horasDe = (a, d) => {
      if (kpiDetalle === 'diurna') return horasDiurna(a, d);
      if (kpiDetalle === 'nocturna') return horasNocturna(a, d);
      return horasDiurna(a, d) + horasNocturna(a, d);
    };
    // El sábado no tiene jornada nocturna; la diurna sí cubre los seis días.
    const capacidadDia = (d) => {
      const diurna = HOURS_DIURNA_MF;
      const nocturna = d === 'SABADO' ? 0 : HOURS_NOCTURNA_MF;
      if (kpiDetalle === 'diurna') return diurna;
      if (kpiDetalle === 'nocturna') return nocturna;
      return diurna + nocturna;
    };

    const capPorAula = DIAS.reduce((acc, d) => acc + capacidadDia(d), 0);
    const nAulas = aulasFiltradas.length;

    const porAula = aulasFiltradas
      .map(([nombre, a]) => {
        const ocupadas = DIAS.reduce((acc, d) => acc + horasDe(a, d), 0);
        return {
          nombre,
          bloque: a.bloque || '',
          ocupadas,
          libres: capPorAula - ocupadas,
          pct: capPorAula > 0 ? (ocupadas / capPorAula) * 100 : 0,
        };
      })
      // Las más vacías primero: son las que se pueden asignar.
      .sort((x, y) => y.libres - x.libres || x.nombre.localeCompare(y.nombre));

    const porDia = DIAS.map((d) => {
      const cap = capacidadDia(d) * nAulas;
      const ocupadas = aulasFiltradas.reduce((acc, [, a]) => acc + horasDe(a, d), 0);
      return {
        dia: d,
        label: DIAS_LABEL[d],
        ocupadas,
        libres: cap - ocupadas,
        cap,
        pct: cap > 0 ? (ocupadas / cap) * 100 : 0,
      };
    });

    const capTotal = capPorAula * nAulas;
    const ocupadasTotal = porAula.reduce((acc, r) => acc + r.ocupadas, 0);

    return {
      capPorAula,
      capTotal,
      ocupadasTotal,
      libresTotal: capTotal - ocupadasTotal,
      pct: capTotal > 0 ? (ocupadasTotal / capTotal) * 100 : 0,
      nAulas,
      aulasVacias: porAula.filter((r) => r.ocupadas === 0).length,
      porAula,
      porDia,
    };
  }, [kpiDetalle, aulasFiltradas, horasDiurna, horasNocturna]);

  // Rankings para el panel de gráficos: top aulas más ocupadas, ocupación
  // promedio por bloque, y horas totales por facultad — todo sobre el mismo
  // conjunto ya filtrado (aulasFiltradas), para que los gráficos reflejen
  // exactamente lo que se está viendo en la tabla.
  const resumen = useMemo(() => {
    const horasAula = ([, a]) => {
      let h = 0;
      DIAS.forEach((d) => { h += horasDiurna(a, d) + horasNocturna(a, d); });
      return h;
    };

    // Listas completas (sin recortar) — el panel de gráficos solo muestra
    // el top 8 de cada una, pero el export a Excel usa la lista entera.
    const topAulas = aulasFiltradas
      .map(([aula, a]) => {
        const h = horasAula([aula, a]);
        return { nombre: aula, horas: h, pct: (h / TOTAL_WEEKLY_HOURS) * 100 };
      })
      .sort((a, b) => b.horas - a.horas);

    const bloqueMap = new Map();
    aulasFiltradas.forEach(([nombreAula, a]) => {
      const nombre = a.bloque || 'Sin bloque';
      const actual = bloqueMap.get(nombre) || { horas: 0, nombresAulas: [] };
      actual.horas += horasAula([nombreAula, a]);
      actual.nombresAulas.push(nombreAula);
      bloqueMap.set(nombre, actual);
    });
    const porBloque = [...bloqueMap.entries()]
      .map(([nombre, v]) => ({
        nombre,
        horas: v.horas,
        pct: (v.horas / (v.nombresAulas.length * TOTAL_WEEKLY_HOURS)) * 100,
        aulas: v.nombresAulas.length,
        nombresAulas: v.nombresAulas.sort(),
      }))
      .sort((a, b) => b.pct - a.pct);

    const facultadMap = new Map();
    aulasFiltradas.forEach(([, a]) => {
      Object.entries(a.horasPorFacultad || {}).forEach(([f, h]) => {
        facultadMap.set(f, (facultadMap.get(f) || 0) + h);
      });
    });
    const totalFacultadHoras = [...facultadMap.values()].reduce((s, h) => s + h, 0);
    const porFacultad = [...facultadMap.entries()]
      .map(([nombre, horas]) => ({ nombre, horas, pct: totalFacultadHoras > 0 ? (horas / totalFacultadHoras) * 100 : 0 }))
      .sort((a, b) => b.horas - a.horas);

    // Si el filtro dejó un solo bloque a la vista, la torta "por bloque" no
    // dice nada (un solo color, 100%) — se desglosa por aula de ese bloque
    // en su lugar, así se ve qué salón pesa más dentro de ese bloque.
    const porAulaDelBloque = porBloque.length === 1
      ? aulasFiltradas
          .map(([nombreAula, a]) => {
            const h = horasAula([nombreAula, a]);
            return { nombre: nombreAula, horas: h, pct: (h / TOTAL_WEEKLY_HOURS) * 100 };
          })
          .sort((a, b) => b.horas - a.horas)
      : [];

    return { topAulas, porBloque, porFacultad, porAulaDelBloque };
  }, [aulasFiltradas, horasDiurna, horasNocturna]);

  async function handleExport() {
    try {
      const XLSX = await import('xlsx');
      const rows = [['AULA', 'BLOQUE', 'FACULTAD', 'JORNADA', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'SEMANAL']];
      aulasMatriz.forEach(([aula, a]) => {
        let sumD = 0, sumN = 0;
        const facultadesTexto = (a.facultades || []).join(' / ');
        const rowD = [aula, a.bloque || '', facultadesTexto, 'DIURNA (h)'];
        const rowN = [aula, a.bloque || '', facultadesTexto, 'NOCTURNA (h)'];
        DIAS.forEach((d) => {
          const hD = horasDiurna(a, d);
          const hN = horasNocturna(a, d);
          sumD += hD;
          sumN += hN;
          rowD.push(hD);
          rowN.push(d === 'SABADO' ? 0 : hN);
        });
        rowD.push(sumD);
        rowN.push(sumN);
        rows.push(rowD, rowN);
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Ocupacion');

      // Hoja "Por Jornada": el mismo desglose de los KPI. "% ocupación" mide
      // cada jornada contra su propia capacidad; "% del global" reparte los
      // puntos del total y por eso sí suma la ocupación global.
      const filasJornada = [
        ['JORNADA', 'HORAS OCUPADAS', 'HORAS POSIBLES', '% OCUPACIÓN', '% DEL GLOBAL'],
        ['Diurna 7:00-18:00', kpiGlobal.horasDiurna, aulasFiltradas.length * WEEKLY_DIURNA,
          Number(kpiGlobal.tasaDiurna.toFixed(2)), Number(kpiGlobal.aporteDiurna.toFixed(2))],
        ['Nocturna 18:00-22:00', kpiGlobal.horasNocturna, aulasFiltradas.length * WEEKLY_NOCTURNA,
          Number(kpiGlobal.tasaNocturna.toFixed(2)), Number(kpiGlobal.aporteNocturna.toFixed(2))],
        ['Global', kpiGlobal.horasDiurna + kpiGlobal.horasNocturna,
          aulasFiltradas.length * TOTAL_WEEKLY_HOURS,
          Number(kpiGlobal.global.toFixed(2)), Number(kpiGlobal.global.toFixed(2))],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasJornada), 'Por Jornada');

      // Hoja "Por Facultad": lista completa (no solo el top 8 del panel).
      const filasFacultad = [['FACULTAD', 'HORAS', '% DEL TOTAL FILTRADO']];
      resumen.porFacultad.forEach((r) => filasFacultad.push([r.nombre, r.horas, Number(r.pct.toFixed(2))]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasFacultad), 'Por Facultad');

      // Hoja "Por Bloque": ocupación promedio y cantidad de aulas por bloque.
      const filasBloque = [['BLOQUE', '% OCUPACIÓN PROMEDIO', 'AULAS']];
      resumen.porBloque.forEach((r) => filasBloque.push([r.nombre, Number(r.pct.toFixed(2)), r.aulas]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasBloque), 'Por Bloque');

      // Hoja "Docencia": carga de cada docente, sobre el mismo filtro activo.
      const filasDocencia = [['DOCENTE', 'HORAS/SEMANA', 'MATERIAS', 'AULAS', 'FACULTADES']];
      docentesFiltrados.forEach((d) => filasDocencia.push([
        d.docente, d.horasSemanales, d.materias.length, d.aulas.length, d.facultades.join(' / '),
      ]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasDocencia), 'Docencia');

      const nombreSemestre = (data?.semestre || 'actual').replace(/[^a-zA-Z0-9-]/g, '_');
      XLSX.writeFile(wb, `ocupacion_${nombreSemestre}.xlsx`);
    } catch (e) {
      console.error(e);
      showError('No se pudo exportar la ocupación a Excel');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Indicadores
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Diurna 7:00-18:00 y Nocturna 18:00-22:00 (Lun-Vie) · Sábados solo diurna · Domingos sin servicio.
            Incluye clases regulares y reservas semestrales activas.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={semestre} onChange={(e) => setSemestre(e.target.value)} className="w-40">
            <option value="">Semestre vigente</option>
            {semestres.map((s) => (
              <option key={s.codigo} value={s.codigo}>{s.codigo}</option>
            ))}
          </Select>
          <Button variant="success" onClick={handleExport} disabled={!aulasFiltradas.length}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm">
          No se pudo cargar la ocupación. Intenta de nuevo.
        </div>
      )}

      {/* KPIs + Filtros unificados en un solo panel */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap gap-6">
          <button type="button" onClick={() => setKpiDetalle('global')} className="flex items-center gap-3 text-left rounded-lg -m-1 p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Ver desglose por aula y por día">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Percent className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide">Ocupación Global</h3>
              <p className="text-2xl font-bold text-foreground">{fmtPct(kpiGlobal.global)}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtPct(kpiGlobal.aporteDiurna)} diurna + {fmtPct(kpiGlobal.aporteNocturna)} nocturna
              </p>
            </div>
          </button>
          <button type="button" onClick={() => setKpiDetalle('diurna')} className="flex items-center gap-3 text-left rounded-lg -m-1 p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Ver desglose por aula y por día">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Sun className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide">Diurna 7:00-18:00</h3>
              <p className="text-2xl font-bold text-foreground">{fmtPct(kpiGlobal.tasaDiurna)}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtH(kpiGlobal.horasDiurna)}h sobre {WEEKLY_DIURNA}h/aula
              </p>
            </div>
          </button>
          <button type="button" onClick={() => setKpiDetalle('nocturna')} className="flex items-center gap-3 text-left rounded-lg -m-1 p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Ver desglose por aula y por día">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
              <Moon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide">Nocturna 18:00-22:00</h3>
              <p className="text-2xl font-bold text-foreground">{fmtPct(kpiGlobal.tasaNocturna)}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtH(kpiGlobal.horasNocturna)}h sobre {WEEKLY_NOCTURNA}h/aula
              </p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide">Aulas Analizadas</h3>
              <p className="text-2xl font-bold text-foreground">{aulasFiltradas.length}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FormField label="Facultad" className="space-y-1">
              <Select value={facultad} onChange={(e) => { setFacultad(e.target.value); setPagina(1); }}>
                <option value="ALL">Todas</option>
                {facultades.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
              {facultad !== 'ALL' && (
                <p className="text-[11px] text-muted-foreground">
                  La tabla muestra solo las horas que esta facultad ocupa en cada aula (no el total del salón). Abre el detalle de un aula → &quot;Por Facultad&quot; para comparar contra las demás.
                </p>
              )}
            </FormField>
            <FormField label="Bloque" className="space-y-1">
              <Select
                value={bloque}
                onChange={(e) => { setBloque(e.target.value); setAulasSeleccionadas([]); setPagina(1); setVerTodasAulasChip(false); setBuscarAula(''); }}
              >
                <option value="ALL">Todos</option>
                {bloques.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </FormField>
          </div>

          {vista === 'matriz' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Aula {aulasSeleccionadas.length > 0 && `(${aulasSeleccionadas.length} elegidas)`}
              </span>
              {aulasSeleccionadas.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setAulasSeleccionadas([]); setPagina(1); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar aula..."
                value={buscarAula}
                onChange={(e) => setBuscarAula(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 p-0.5">
              {(buscarAula.trim() || verTodasAulasChip ? aulasDelBloqueBuscadas : aulasDelBloqueBuscadas.slice(0, CHIPS_VISIBLES)).map((nombre) => {
                const activo = aulasSeleccionadas.includes(nombre);
                return (
                  <button
                    key={nombre}
                    type="button"
                    onClick={() => {
                      setAulasSeleccionadas((prev) =>
                        activo ? prev.filter((n) => n !== nombre) : [...prev, nombre]
                      );
                      setPagina(1);
                    }}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                      activo
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {nombre}
                  </button>
                );
              })}
              {!buscarAula.trim() && aulasDelBloqueBuscadas.length > CHIPS_VISIBLES && (
                <button
                  type="button"
                  onClick={() => setVerTodasAulasChip((v) => !v)}
                  className="rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:underline"
                >
                  {verTodasAulasChip ? 'Ver menos' : `Ver más (${aulasDelBloqueBuscadas.length - CHIPS_VISIBLES})`}
                </button>
              )}
              {buscarAula.trim() && aulasDelBloqueBuscadas.length === 0 && (
                <p className="text-xs text-muted-foreground py-1">Sin coincidencias</p>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Tabs: Matriz vs Resumen gráfico */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'matriz', label: 'Matriz de Ocupación' },
          { key: 'resumen', label: 'Análisis' },
          { key: 'docencia', label: 'Carga Docente' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setVista(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              vista === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Resumen gráfico — top aulas, por bloque, por facultad, sobre el filtro activo */}
      {vista === 'resumen' && !isLoading && aulasFiltradas.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Top aulas más ocupadas
                <button
                  type="button"
                  onClick={() => setMostrarExplicacion86h(true)}
                  title="¿De dónde sale el 86h?"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </h3>
              <p className="text-[11px] text-muted-foreground">% sobre las {TOTAL_WEEKLY_HOURS}h posibles en la semana</p>
            </div>
            <div className="space-y-2.5">
              {resumen.topAulas.slice(0, 8).map((r) => (
                <BarraRanking key={r.nombre} label={r.nombre} pct={r.pct} valor={`${fmtH(r.horas)}h · ${fmtPct(r.pct)}`} />
              ))}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {resumen.porBloque.length === 1 ? (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Ocupación por aula — {resumen.porBloque[0].nombre}</h3>
                  <p className="text-[11px] text-muted-foreground">Reparto de horas ocupadas entre las aulas de este bloque</p>
                </div>
                <DonutChart
                  datos={resumen.porAulaDelBloque.map((r) => ({
                    nombre: r.nombre,
                    valor: r.horas,
                    sub: `${fmtH(r.horas)}h · ${fmtPct(r.pct)}`,
                  }))}
                />
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Ocupación por bloque</h3>
                  <p className="text-[11px] text-muted-foreground">Reparto de horas ocupadas entre bloques</p>
                </div>
                <DonutChart
                  datos={resumen.porBloque.map((r) => ({
                    nombre: r.nombre,
                    valor: r.horas,
                    sub: `${fmtPct(r.pct)} · ${r.aulas} ${r.aulas === 1 ? 'aula' : 'aulas'}`,
                    aulas: r.nombresAulas,
                  }))}
                />
              </>
            )}
          </div>
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Top facultades por horas</h3>
              <p className="text-[11px] text-muted-foreground">Suma de horas semanales en todas las aulas mostradas (no es una sola aula)</p>
            </div>
            {resumen.porFacultad.length ? (
              <ListaRanking
                items={resumen.porFacultad.slice(0, 8)}
                valorDe={(r) => `${fmtH(r.horas)}h · ${fmtPct(r.pct)}`}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin datos de facultad para el filtro actual</p>
            )}
          </div>
        </div>
      )}
      {vista === 'resumen' && !isLoading && aulasFiltradas.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">Sin datos para el filtro actual</p>
      )}

      {/* Matriz de ocupación */}
      {vista === 'matriz' && (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-4 pb-3">
          <h2 className="font-semibold text-foreground">Matriz de Ocupación por Salón</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> ≤ 40%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> 40-75%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> {'> 75%'}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="sticky left-0 bg-card px-3 py-2 z-10">Aula</th>
                <th className="px-3 py-2">Jornada</th>
                {DIAS.map((d) => <th key={d} className="px-3 py-2 text-center">{DIAS_LABEL[d]}</th>)}
                <th className="px-3 py-2 text-center">Semanal</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Cargando...</td></tr>
              )}
              {!isLoading && aulasMatriz.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Sin datos para el filtro actual</td></tr>
              )}
              {aulasPagina.map(([aula, a], idx) => {
                let sumD = 0, sumN = 0;
                const pctSemanalDiurna = () => (WEEKLY_DIURNA > 0 ? (sumD / WEEKLY_DIURNA) * 100 : 0);
                const pctSemanalNocturna = () => (WEEKLY_NOCTURNA > 0 ? (sumN / WEEKLY_NOCTURNA) * 100 : 0);
                const zebra = idx % 2 === 1 ? 'bg-muted/40' : 'bg-card';
                const abrirDetalle = () => {
                  setDetalleAula(aula);
                  // Si hay una facultad filtrada, lo relevante es ver su
                  // reparto en esta aula, no el conteo de estudiantes.
                  setDetalleTab(facultad !== 'ALL' ? 'facultades' : 'estudiantes');
                  setVerTodasFacultadesChip(false);
                };
                const abrirFranja = (dia) => (e) => {
                  e.stopPropagation();
                  setFranjaDetalle({ aula, dia });
                };
                return (
                  <>
                    <tr
                      key={`${aula}-d`}
                      className={cn('border-b border-border/60 hover:bg-muted/60 transition-colors', zebra)}
                    >
                      <td
                        rowSpan={2}
                        onClick={abrirDetalle}
                        title="Ver detalle del aula"
                        className={cn('sticky left-0 px-3 py-2 align-middle font-semibold text-foreground border-r border-border cursor-pointer', zebra)}
                      >
                        {aula}
                        <div className="text-xs font-normal text-muted-foreground">{a.bloque || 'Sin bloque'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <JornadaBadge diurna />
                      </td>
                      {DIAS.map((d) => {
                        const h = horasDiurna(a, d);
                        sumD += h;
                        const maxH = d === 'SABADO' ? HOURS_DIURNA_SAT : HOURS_DIURNA_MF;
                        const pct = maxH > 0 ? (h / maxH) * 100 : 0;
                        return (
                          <td
                            key={d}
                            onClick={h > 0 ? abrirFranja(d) : undefined}
                            title={h > 0 ? 'Ver qué clases ocupan esta franja' : undefined}
                            className={cn('px-2 py-1.5 text-center', h > 0 && 'cursor-pointer')}
                          >
                            <Celda horas={h} pct={pct} />
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center border-l border-border">
                        <Celda horas={sumD} pct={pctSemanalDiurna()} fuerte />
                      </td>
                    </tr>
                    <tr
                      key={`${aula}-n`}
                      className={cn('border-b border-border hover:bg-muted/60 transition-colors', zebra)}
                    >
                      <td className="px-3 py-2">
                        <JornadaBadge diurna={false} />
                      </td>
                      {DIAS.map((d) => {
                        if (d === 'SABADO') {
                          return <td key={d} className="px-2 py-1.5 text-center text-xs text-muted-foreground">N/A</td>;
                        }
                        const h = horasNocturna(a, d);
                        sumN += h;
                        const pct = HOURS_NOCTURNA_MF > 0 ? (h / HOURS_NOCTURNA_MF) * 100 : 0;
                        return (
                          <td
                            key={d}
                            onClick={h > 0 ? abrirFranja(d) : undefined}
                            title={h > 0 ? 'Ver qué clases ocupan esta franja' : undefined}
                            className={cn('px-2 py-1.5 text-center', h > 0 && 'cursor-pointer')}
                          >
                            <Celda horas={h} pct={pct} />
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center border-l border-border">
                        <Celda horas={sumN} pct={pctSemanalNocturna()} fuerte />
                      </td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <span className="text-muted-foreground">
              Mostrando {(paginaSegura - 1) * AULAS_POR_PAGINA + 1}-{Math.min(paginaSegura * AULAS_POR_PAGINA, aulasMatriz.length)} de {aulasMatriz.length} aulas
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaSegura <= 1}>
                Anterior
              </Button>
              <span className="text-muted-foreground px-1">{paginaSegura} / {totalPaginas}</span>
              <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura >= totalPaginas}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Carga docente — horas semanales, materias y aulas por docente, sobre los mismos filtros de facultad/bloque */}
      {vista === 'docencia' && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Carga docente</h3>
              <p className="text-[11px] text-muted-foreground">
                Horas semanales dictadas, materias/grupos distintos y aulas usadas por cada docente, según los filtros activos.
              </p>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar docente..."
                value={buscarDocente}
                onChange={(e) => { setBuscarDocente(e.target.value); setPaginaDocentes(1); }}
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          {isLoading && <p className="text-sm text-muted-foreground text-center py-10">Cargando...</p>}
          {!isLoading && docentesFiltrados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">Sin datos para el filtro actual</p>
          )}
          {!isLoading && docentesFiltrados.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-3 py-2">Docente</th>
                      <th className="px-3 py-2 text-center">Horas/semana</th>
                      <th className="px-3 py-2 text-center">Materias</th>
                      <th className="px-3 py-2 text-center">Aulas</th>
                      <th className="px-3 py-2">Facultades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docentesPagina.map((d, idx) => (
                      <tr
                        key={d.docente}
                        onDoubleClick={() => { setDetalleDocente(d); setDetalleDocenteTab('materias'); }}
                        title="Doble click para ver el detalle"
                        className={cn('border-b border-border/60 cursor-pointer hover:bg-muted/60 transition-colors', idx % 2 === 1 ? 'bg-muted/40' : 'bg-card')}
                      >
                        <td className="px-3 py-2 font-medium text-foreground">{d.docente}</td>
                        <td className="px-3 py-2 text-center">{fmtH(d.horasSemanales)}h</td>
                        <td className="px-3 py-2 text-center">{d.materias.length}</td>
                        <td className="px-3 py-2 text-center">{d.aulas.length}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs max-w-[220px] truncate">{d.facultades.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPaginasDocentes > 1 && (
                <div className="flex items-center justify-between px-1 py-1 border-t border-border text-sm pt-3">
                  <span className="text-muted-foreground">
                    Mostrando {(paginaDocentesSegura - 1) * DOCENTES_POR_PAGINA + 1}-{Math.min(paginaDocentesSegura * DOCENTES_POR_PAGINA, docentesFiltrados.length)} de {docentesFiltrados.length} docentes
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPaginaDocentes((p) => Math.max(1, p - 1))} disabled={paginaDocentesSegura <= 1}>
                      Anterior
                    </Button>
                    <span className="text-muted-foreground px-1">{paginaDocentesSegura} / {totalPaginasDocentes}</span>
                    <Button variant="outline" size="sm" onClick={() => setPaginaDocentes((p) => Math.min(totalPaginasDocentes, p + 1))} disabled={paginaDocentesSegura >= totalPaginasDocentes}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Detalle de estudiantes por aula (doble click en una fila) */}
      {/* Desglose del KPI: qué hay detrás del porcentaje de la tarjeta. */}
      <Sheet open={!!kpiDetalle} onOpenChange={(v) => !v && setKpiDetalle(null)}>
        <SheetContent className="max-w-3xl">
          {desgloseKpi && (() => {
            const TITULOS = {
              global: 'Ocupación global',
              diurna: 'Jornada diurna 7:00-18:00',
              nocturna: 'Jornada nocturna 18:00-22:00',
            };
            const pctLibre = 100 - desgloseKpi.pct;
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{TITULOS[kpiDetalle]}</SheetTitle>
                  <SheetDescription>
                    {desgloseKpi.nAulas} aula{desgloseKpi.nAulas === 1 ? '' : 's'} ·{' '}
                    {fmtH(desgloseKpi.capPorAula)}h disponibles por aula a la semana
                    {facultad !== 'ALL' && <> · facultad <strong>{facultad}</strong></>}
                  </SheetDescription>
                </SheetHeader>

                <div className="grid grid-cols-3 gap-3 my-4">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Ocupado</p>
                    <p className="text-xl font-bold">{fmtPct(desgloseKpi.pct)}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtH(desgloseKpi.ocupadasTotal)}h</p>
                  </div>
                  <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Libre</p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{fmtPct(pctLibre)}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtH(desgloseKpi.libresTotal)}h de {fmtH(desgloseKpi.capTotal)}h</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Aulas sin uso</p>
                    <p className="text-xl font-bold">{desgloseKpi.aulasVacias}</p>
                    <p className="text-[11px] text-muted-foreground">de {desgloseKpi.nAulas} en esta jornada</p>
                  </div>
                </div>

                <h4 className="text-sm font-semibold mb-2">Por día</h4>
                <div className="flex gap-2 mb-5 flex-wrap">
                  {desgloseKpi.porDia.map((d) => (
                    <div
                      key={d.dia}
                      className={`flex-1 min-w-[72px] rounded-lg border p-2 text-center ${d.cap === 0 ? 'border-border opacity-50' : heatmapClass(d.pct)}`}
                      title={d.cap === 0 ? 'Sin jornada este día' : `${fmtH(d.libres)}h libres de ${fmtH(d.cap)}h`}
                    >
                      <p className="text-[11px] font-medium">{d.label}</p>
                      <p className="text-sm font-bold">{d.cap === 0 ? '—' : fmtPct(d.pct)}</p>
                      <p className="text-[10px]">{d.cap === 0 ? 'sin jornada' : `${fmtH(d.libres)}h libres`}</p>
                    </div>
                  ))}
                </div>

                <h4 className="text-sm font-semibold mb-2">Por aula</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Ordenadas por horas libres: las de arriba son las que quedan disponibles para asignar.
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Aula</th>
                        <th className="text-left p-2 font-medium">Bloque</th>
                        <th className="text-right p-2 font-medium">Ocupadas</th>
                        <th className="text-right p-2 font-medium">Libres</th>
                        <th className="text-right p-2 font-medium">Ocupación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desgloseKpi.porAula.map((r) => (
                        <tr key={r.nombre} className="border-t border-border">
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => { setKpiDetalle(null); setDetalleAula(r.nombre); }}
                            >
                              {r.nombre}
                            </button>
                          </td>
                          <td className="p-2 text-muted-foreground">{r.bloque || '—'}</td>
                          <td className="p-2 text-right">{fmtH(r.ocupadas)}h</td>
                          <td className="p-2 text-right font-medium text-emerald-700 dark:text-emerald-400">{fmtH(r.libres)}h</td>
                          <td className="p-2 text-right">{fmtPct(r.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <Sheet open={!!detalleAula} onOpenChange={(v) => !v && setDetalleAula(null)}>
        <SheetContent className="max-w-2xl">
          {detalleAula && aulas[detalleAula] && (() => {
            const a = aulas[detalleAula];
            let totalSemDiurna = 0, totalSemNocturna = 0;
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    {detalleAula}
                    <span className="text-sm font-normal text-muted-foreground">{a.bloque || 'Sin bloque'}</span>
                  </SheetTitle>
                  <SheetDescription asChild>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(a.facultades || []).length ? (
                        <>
                          {(verTodasFacultadesChip ? a.facultades : a.facultades.slice(0, CHIPS_VISIBLES)).map((f) => (
                            <span key={f} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                              {f}
                            </span>
                          ))}
                          {a.facultades.length > CHIPS_VISIBLES && (
                            <button
                              type="button"
                              onClick={() => setVerTodasFacultadesChip((v) => !v)}
                              className="text-[11px] font-medium text-primary hover:underline px-1"
                            >
                              {verTodasFacultadesChip ? 'Ver menos' : `Ver todas (${a.facultades.length})`}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sin facultad registrada</span>
                      )}
                    </div>
                  </SheetDescription>
                </SheetHeader>

                <div className="flex gap-1 border-b border-border -mt-2 mb-1">
                  {[
                    { key: 'estudiantes', label: 'Estudiantes' },
                    { key: 'facultades', label: 'Por Facultad' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setDetalleTab(t.key)}
                      className={cn(
                        'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                        detalleTab === t.key
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {detalleTab === 'estudiantes' && (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="px-2 py-2">Estudiantes</th>
                          {DIAS.map((d) => <th key={d} className="px-2 py-2 text-center">{DIAS_LABEL[d]}</th>)}
                          <th className="px-2 py-2 text-center">Semanal</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border/60">
                          <td className="px-2 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                              <Users className="h-3.5 w-3.5" /> Est. Diurna
                            </span>
                          </td>
                          {DIAS.map((d) => {
                            const v = a.est_diurna[d] || 0;
                            totalSemDiurna += v;
                            return <td key={d} className="px-2 py-2.5 text-center">{v || '-'}</td>;
                          })}
                          <td className="px-2 py-2.5 text-center font-semibold border-l border-border">{totalSemDiurna}</td>
                        </tr>
                        <tr className="border-b border-border/60">
                          <td className="px-2 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 font-medium">
                              <Users className="h-3.5 w-3.5" /> Est. Nocturna
                            </span>
                          </td>
                          {DIAS.map((d) => {
                            const v = d === 'SABADO' ? 0 : (a.est_nocturna[d] || 0);
                            totalSemNocturna += v;
                            return <td key={d} className="px-2 py-2.5 text-center">{d === 'SABADO' ? 'N/A' : (v || '-')}</td>;
                          })}
                          <td className="px-2 py-2.5 text-center font-semibold border-l border-border">{totalSemNocturna}</td>
                        </tr>
                        <tr className="bg-muted/40">
                          <td className="px-2 py-2.5 font-semibold text-foreground">Total Est.</td>
                          {DIAS.map((d) => {
                            const total = (a.est_diurna[d] || 0) + (d === 'SABADO' ? 0 : (a.est_nocturna[d] || 0));
                            return <td key={d} className="px-2 py-2.5 text-center font-semibold">{total || '-'}</td>;
                          })}
                          <td className="px-2 py-2.5 text-center font-bold border-l border-border">{totalSemDiurna + totalSemNocturna}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {detalleTab === 'facultades' && (() => {
                  const horasPorFacultad = a.horasPorFacultad || {};
                  const totalHoras = Object.values(horasPorFacultad).reduce((s, h) => s + h, 0);
                  const filas = Object.entries(horasPorFacultad).sort(([, h1], [, h2]) => h2 - h1);
                  if (!filas.length) {
                    return <p className="text-sm text-muted-foreground py-6 text-center">Sin horas registradas para esta aula</p>;
                  }
                  return (
                    <div className="space-y-2.5">
                      {facultad !== 'ALL' && (
                        <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                          Filtrando por <span className="font-medium text-foreground">{facultad}</span> — resaltada abajo.
                        </p>
                      )}
                      {filas.map(([f, horas]) => {
                        const pct = totalHoras > 0 ? (horas / totalHoras) * 100 : 0;
                        const esFiltrada = f === facultad;
                        return (
                          <div key={f}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className={cn('text-foreground', esFiltrada && 'font-semibold text-primary')}>{f}</span>
                              <span className="text-muted-foreground shrink-0 ml-2">{fmtH(horas)}h · {fmtPct(pct)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', esFiltrada ? 'bg-primary' : 'bg-primary/40')}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <SheetFooter>
                  <Button variant="outline" onClick={() => setDetalleAula(null)}>Cerrar</Button>
                </SheetFooter>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Detalle de un docente (doble click en una fila de Carga Docente) */}
      <Sheet open={!!detalleDocente} onOpenChange={(v) => !v && setDetalleDocente(null)}>
        <SheetContent className="max-w-2xl">
          {detalleDocente && (
            <>
              <SheetHeader>
                <SheetTitle>{detalleDocente.docente}</SheetTitle>
                <SheetDescription>{fmtH(detalleDocente.horasSemanales)}h semanales · {detalleDocente.materias.length} materia(s) · {detalleDocente.aulas.length} aula(s)</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Facultades</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {detalleDocente.facultades.map((f) => (
                      <span key={f} className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">{f}</span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-1 border-b border-border">
                  {[
                    { key: 'materias', label: `Materias (${detalleDocente.materias.length})` },
                    { key: 'aulas', label: `Aulas y Horarios (${detalleDocente.franjas.length})` },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setDetalleDocenteTab(t.key)}
                      className={cn(
                        'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                        detalleDocenteTab === t.key
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {detalleDocenteTab === 'materias' && (
                  <ul className="space-y-1">
                    {detalleDocente.materias.map((m, i) => (
                      <li key={i} className="rounded-lg border border-border px-3 py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-foreground">{m.materia || 'Sin nombre'}</span>
                          <span className="text-muted-foreground text-xs shrink-0 ml-2">
                            {m.codigo_materia}{m.grupo ? ` · G${m.grupo}` : ''}
                          </span>
                        </div>
                        {m.aulas?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.aulas.map((a) => (
                              <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{a}</span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {detalleDocenteTab === 'aulas' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="px-2 py-1.5">Aula</th>
                          <th className="px-2 py-1.5">Día</th>
                          <th className="px-2 py-1.5">Horario</th>
                          <th className="px-2 py-1.5 text-center">Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleDocente.franjas.map((f, i) => (
                          <tr key={i} className={cn('border-b border-border/60', i % 2 === 1 ? 'bg-muted/40' : 'bg-card')}>
                            <td className="px-2 py-1.5 font-medium text-foreground">{f.aula}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{DIAS_LABEL[f.dia] || f.dia}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{f.horaInicio} - {f.horaFin}</td>
                            <td className="px-2 py-1.5 text-center text-muted-foreground">{fmtH(f.horas)}h</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border font-semibold text-foreground">
                          <td className="px-2 py-1.5" colSpan={3}>Total</td>
                          <td className="px-2 py-1.5 text-center">{fmtH(detalleDocente.horasSemanales)}h</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setDetalleDocente(null)}>Cerrar</Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Explicación del tope de 86h semanales */}
      <Sheet open={mostrarExplicacion86h} onOpenChange={setMostrarExplicacion86h}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>¿De dónde salen las {TOTAL_WEEKLY_HOURS}h?</SheetTitle>
            <SheetDescription>Es el máximo teórico que una aula puede ocupar en una semana, según el horario institucional.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-medium text-foreground">Diurna</p>
                  <p className="text-xs text-muted-foreground">7:00 a 18:00 · 11h/día × 6 días (lun-sáb)</p>
                </div>
              </div>
              <span className="font-semibold text-foreground">{WEEKLY_DIURNA}h</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <p className="font-medium text-foreground">Nocturna</p>
                  <p className="text-xs text-muted-foreground">18:00 a 22:00 · 4h/día × 5 días (lun-vie, sábado no tiene)</p>
                </div>
              </div>
              <span className="font-semibold text-foreground">{WEEKLY_NOCTURNA}h</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
              <p className="font-semibold text-foreground">Total semanal</p>
              <span className="font-bold text-primary text-base">{TOTAL_WEEKLY_HOURS}h</span>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setMostrarExplicacion86h(false)}>Cerrar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Drill-down de una franja: qué clases ocupan esa aula ese día */}
      <Sheet open={!!franjaDetalle} onOpenChange={(v) => !v && setFranjaDetalle(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{franjaDetalle?.aula}</SheetTitle>
            <SheetDescription>{franjaDetalle?.dia}</SheetDescription>
          </SheetHeader>
          {cargandoFranja ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Cargando...</p>
          ) : clasesFranja.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No hay clases registradas en esta franja</p>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
              {clasesFranja.map((c, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground text-sm">{c.materia || 'Sin materia'}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                        c.tipo === 'semestral'
                          ? 'bg-purple-500/15 text-purple-700 dark:text-purple-400'
                          : 'bg-primary/15 text-primary'
                      )}
                    >
                      {c.tipo === 'semestral' ? 'Reserva semestral' : 'Clase regular'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.hora_inicio}–{c.hora_fin} · {c.docente || 'Sin docente/responsable'}
                  </p>
                  {(c.facultad || c.grupo) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.facultad}{c.facultad && c.grupo ? ' · ' : ''}{c.grupo ? `Grupo ${c.grupo}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <SheetFooter>
            <Button variant="outline" onClick={() => setFranjaDetalle(null)}>Cerrar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
