import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as RadixTabs from '@radix-ui/react-tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/shared/components/ui/Dialog';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import Button from '@/shared/components/ui/Button';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import dayjs from 'dayjs';
import { abrirBuscadorPersonaPorNombre } from '@/shared/utils/personaSearchHotkey';
import { reservasSemestralesApi, useValidarConflictosSemestral } from '@/features/reservas_semestrales/reservasSemestralesApi';
import { useSalones } from '@/features/salones/salonesApi';
import {
  useActualizarClase,
  useVincularFantasma,
  useDesvincularFantasma,
  programacionApi,
} from './programacionApi';
import { showSuccess, showError } from '@/shared/utils/alert';
import { Search, CheckCircle, XCircle, Loader2, Ghost, X, Plus } from 'lucide-react';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function EditarClaseDialog({ open, onOpenChange, clase, semestre, facultades = [], todosRegistros = [] }) {
  const actualizarClase = useActualizarClase();
  const vincularFantasma = useVincularFantasma();
  const desvincularFantasma = useDesvincularFantasma();
  const validarConflictos = useValidarConflictosSemestral();

  const [activeTab, setActiveTab] = useState('info');
  // claseData es una copia estable de la prop clase; se guarda al abrir el diálogo
  // para que el componente no dependa del prop después de que el detailRow pueda limpiarse.
  const [claseData, setClaseData] = useState(null);
  const [formInfo, setFormInfo] = useState({});
  const [formHorario, setFormHorario] = useState({});
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState('');
  const [conflictos, setConflictos] = useState(null);

  // Estado para gestión de fantasmas
  const [busquedaFantasma, setBusquedaFantasma] = useState('');
  const [gruposDisponibles, setGruposDisponibles] = useState([]);
  const [grupoFantasmaSeleccionado, setGrupoFantasmaSeleccionado] = useState('');
  const [loadingValidacion, setLoadingValidacion] = useState(false);

  const bloqueIniciado = useRef(false);
  const originalSalonRef = useRef(null);
  const claseIdRef = useRef(null);

  useEffect(() => {
    if (clase && open) {
      setClaseData(clase);
      claseIdRef.current = clase._id;
      const diaMatchado = DIAS.find(
        (d) => d.toLowerCase() === (clase.dia || '').toLowerCase()
      ) || clase.dia || '';
      setFormInfo({
        numero_documento: clase.numero_documento || '',
        docente: clase.docente || '',
        observaciones: clase.observaciones || '',
      });
      setFormHorario({
        dia: diaMatchado,
        hora_inicio: clase.hora_inicio || '',
        hora_fin: clase.hora_fin || '',
        aula: clase.aula || '',
      });
      setBloqueSeleccionado('');
      bloqueIniciado.current = false;
      originalSalonRef.current = null;
      setConflictos(null);
      setBusquedaFantasma('');
      setGruposDisponibles([]);
      setGrupoFantasmaSeleccionado('');
      setActiveTab('info');
    }
  }, [clase, open]);

  const { data: todosSalones = [] } = useSalones({ enabled: !!(clase && open) });

  const { data: salonesDisponibles = [], isFetching: loadingSalones } = useQuery({
    queryKey: ['edit-clase-salones', formHorario.dia, formHorario.hora_inicio, formHorario.hora_fin, semestre, claseIdRef.current],
    queryFn: () =>
      reservasSemestralesApi
        .salonesDisponibles(formHorario.dia, formHorario.hora_inicio, formHorario.hora_fin, semestre, undefined, undefined, undefined, claseIdRef.current)
        .then((r) => r.data.data.salones || []),
    enabled: !!(formHorario.dia && formHorario.hora_inicio && formHorario.hora_fin),
    staleTime: 30000,
  });

  const normSalon = (a) => String(a || '').replace(/-/g, '').toUpperCase().trim();

  useEffect(() => {
    if (bloqueIniciado.current || !open || !claseData?.aula) return;
    const salon =
      salonesDisponibles.find((s) => normSalon(s.nombre_salon) === normSalon(claseData.aula)) ||
      todosSalones.find((s) => normSalon(s.nombre_salon) === normSalon(claseData.aula));
    if (!salon) return;
    bloqueIniciado.current = true;
    originalSalonRef.current = salon;
    if (salon.nombre_bloque) setBloqueSeleccionado(salon.nombre_bloque);
    setFormHorario((f) => ({ ...f, aula: salon.nombre_salon }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonesDisponibles, todosSalones, open]);

  const bloques = (() => {
    const set = new Set(salonesDisponibles.map((s) => s.nombre_bloque).filter(Boolean));
    const originalBloque = originalSalonRef.current?.nombre_bloque;
    if (originalBloque) set.add(originalBloque);
    return [...set].sort();
  })();
  const salonesPerBloque = Object.fromEntries(
    bloques.map((b) => [b, salonesDisponibles.filter((s) => s.nombre_bloque === b).length])
  );
  const salonesFiltrados = salonesDisponibles.filter(
    (s) => !bloqueSeleccionado || s.nombre_bloque === bloqueSeleccionado
  );
  const opcionesSalon = (() => {
    const opts = [...salonesFiltrados];
    const addSalon = (aula, hint) => {
      if (!aula) return;
      if (opts.some((s) => normSalon(s.nombre_salon) === normSalon(aula))) return;
      const salonObj = salonesDisponibles.find((s) => normSalon(s.nombre_salon) === normSalon(aula)) || hint;
      if (salonObj && bloqueSeleccionado && salonObj.nombre_bloque !== bloqueSeleccionado) return;
      opts.unshift(salonObj || { nombre_salon: aula, nombre_bloque: '' });
    };
    addSalon(formHorario.aula);
    addSalon(claseData?.aula, originalSalonRef.current);
    return opts;
  })();

  useEffect(() => {
    if (!formHorario.aula || !formHorario.dia || !formHorario.hora_inicio || !formHorario.hora_fin) {
      setConflictos(null);
      return;
    }
    setConflictos(null);
    validarConflictos.mutate(
      { nombre_salon: formHorario.aula, dia: formHorario.dia, hora_inicio: formHorario.hora_inicio, hora_fin: formHorario.hora_fin, semestre, excluir_id: claseIdRef.current },
      {
        onSuccess: (res) => setConflictos(res.data.data.conflictos || []),
        onError: () => setConflictos(null),
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formHorario.aula, formHorario.dia, formHorario.hora_inicio, formHorario.hora_fin]);

  async function handleBuscarDocente() {
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: 'Seleccionar docente responsable',
      tipo: 'docente',
      placeholder: 'Escribe nombre del docente',
    });
    if (persona) {
      setFormInfo((f) => ({
        ...f,
        numero_documento: persona.numero_documento || '',
        docente: persona.nombre || '',
      }));
    }
  }

  function resetFranja(nivel) {
    if (nivel === 'dia') setFormHorario((f) => ({ ...f, hora_inicio: '', hora_fin: '', aula: '' }));
    if (nivel === 'hora_inicio') setFormHorario((f) => ({ ...f, hora_fin: '', aula: '' }));
    if (nivel === 'hora_fin') setFormHorario((f) => ({ ...f, aula: '' }));
    setBloqueSeleccionado('');
    setConflictos(null);
  }

  const horaInvalida = !!(formHorario.hora_inicio && formHorario.hora_fin && formHorario.hora_fin <= formHorario.hora_inicio);
  const franjaCompleta = !!(formHorario.dia && formHorario.hora_inicio && formHorario.hora_fin && !horaInvalida);

  async function handleGuardarInfo() {
    try {
      await actualizarClase.mutateAsync({
        id: claseIdRef.current,
        numero_documento: formInfo.numero_documento,
        docente: formInfo.docente,
        observaciones: formInfo.observaciones,
      });
      showSuccess('Información actualizada correctamente');
    } catch (e) {
      showError(e.response?.data?.message || e.message || 'Error al actualizar');
    }
  }

  async function handleGuardarHorario() {
    if (horaInvalida) { showError('La hora de fin debe ser mayor que la hora de inicio'); return; }
    if (!formHorario.aula) { showError('Selecciona un salón'); return; }
    try {
      const diaNorm = String(formHorario.dia || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
      await actualizarClase.mutateAsync({
        id: claseIdRef.current,
        dia: diaNorm,
        hora_inicio: formHorario.hora_inicio,
        hora_fin: formHorario.hora_fin,
        aula: formHorario.aula,
      });
      showSuccess('Horario actualizado correctamente');
      onOpenChange(false);
    } catch (e) {
      showError(e.response?.data?.message || e.message || 'Error al actualizar el horario');
    }
  }

  // --- Lógica de fantasmas ---

  // Fantasmas que este registro contiene (registros cuyo fantasma_de === codigo_materia de este)
  // Un grupo puede tener varios registros (uno por día), se agregan todos los días y horarios
  const fantasmasDeEste = todosRegistros
    .filter((r) => r.fantasma_de === claseData?.codigo_materia && r.tipo === 'fantasma' && r.semestre === claseData?.semestre)
    .reduce((acc, r) => {
      const key = `${r.codigo_materia}|${r.grupo}`;
      const horarioEntry = r.horario || (r.hora_inicio && r.hora_fin ? `${r.hora_inicio} - ${r.hora_fin}` : null);
      const existing = acc.find((x) => `${x.codigo_materia}|${x.grupo}` === key);
      if (!existing) {
        acc.push({
          codigo_materia: r.codigo_materia,
          grupo: r.grupo,
          materia: r.materia,
          total_estudiantes: r.total_estudiantes,
          facultad: r.facultad,
          dias: r.dia ? [r.dia] : [],
          horarios: horarioEntry ? [horarioEntry] : [],
        });
      } else {
        if (r.dia && !existing.dias.includes(r.dia)) existing.dias.push(r.dia);
        if (horarioEntry && !existing.horarios.includes(horarioEntry)) existing.horarios.push(horarioEntry);
      }
      return acc;
    }, []);

  // Validación instantánea al escribir el código de materia (debounce 400ms)
  useEffect(() => {
    if (!busquedaFantasma.trim()) {
      setGruposDisponibles([]);
      setGrupoFantasmaSeleccionado('');
      return;
    }
    setLoadingValidacion(true);
    const timer = setTimeout(async () => {
      try {
        const res = await programacionApi.validarFantasma(semestre, busquedaFantasma.trim());
        setGruposDisponibles(res.data.data.grupos || []);
        setGrupoFantasmaSeleccionado('');
      } catch {
        setGruposDisponibles([]);
        setGrupoFantasmaSeleccionado('');
      } finally {
        setLoadingValidacion(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaFantasma, semestre]);

  async function handleVincular() {
    if (!grupoFantasmaSeleccionado) return;
    try {
      await vincularFantasma.mutateAsync({ id: claseIdRef.current, codigo_materia_fantasma: busquedaFantasma.trim(), grupo_fantasma: grupoFantasmaSeleccionado });
      showSuccess(`Grupo ${grupoFantasmaSeleccionado} de "${busquedaFantasma.trim()}" vinculado`);
      setBusquedaFantasma('');
      setGruposDisponibles([]);
      setGrupoFantasmaSeleccionado('');
    } catch (e) {
      showError(e.response?.data?.message || e.message || 'Error al vincular');
    }
  }

  async function handleDesvincular(codigoMateria, grupo) {
    try {
      await desvincularFantasma.mutateAsync({ id: claseIdRef.current, codigo_materia_fantasma: codigoMateria, grupo_fantasma: grupo });
      showSuccess(`Fantasma "${codigoMateria}" Grupo ${grupo} desvinculado`);
    } catch (e) {
      showError(e.response?.data?.message || e.message || 'Error al desvincular');
    }
  }

  const esPrincipal = claseData?.tipo === 'programacion';
  const esFantasma = claseData?.tipo === 'fantasma';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Editar clase</DialogTitle>
          </DialogHeader>

          <RadixTabs.Root value={activeTab} onValueChange={setActiveTab}>
            <RadixTabs.List className="flex border-b border-border mb-4">
              <RadixTabs.Trigger
                value="info"
                className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px"
              >
                Información
              </RadixTabs.Trigger>
              <RadixTabs.Trigger
                value="fantasmas"
                className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px flex items-center gap-1.5"
              >
                <Ghost className="h-3.5 w-3.5" />
                Fantasmas
                {esPrincipal && fantasmasDeEste.length > 0 && (
                  <span className="ml-0.5 text-[10px] font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                    {fantasmasDeEste.length}
                  </span>
                )}
              </RadixTabs.Trigger>
              <RadixTabs.Trigger
                value="horario"
                className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px"
              >
                Horario y Salón
              </RadixTabs.Trigger>
            </RadixTabs.List>

            {/* ── TAB 1: Información ── */}
            <RadixTabs.Content value="info" className="space-y-4">

              {/* Docente */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Número de documento">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Cédula o código"
                      value={formInfo.numero_documento || ''}
                      onChange={(e) => setFormInfo((f) => ({ ...f, numero_documento: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'F1') { e.preventDefault(); handleBuscarDocente(); } }}
                      className="flex-1"
                    />
                    <Button variant="outline" size="sm" onClick={handleBuscarDocente} title="Buscar docente" className="shrink-0">
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </FormField>

                <FormField label="Docente">
                  <Input
                    value={formInfo.docente || ''}
                    readOnly
                    tabIndex={-1}
                    placeholder="Sin asignar"
                    className="bg-muted/50 cursor-default font-medium"
                  />
                </FormField>
              </div>

              {/* Info de la clase (read-only) */}
              {(() => {
                const duracionHoras = (() => {
                  const ini = claseData?.hora_inicio;
                  const fin = claseData?.hora_fin;
                  if (!ini || !fin) return null;
                  const [h1, m1] = ini.split(':').map(Number);
                  const [h2, m2] = fin.split(':').map(Number);
                  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
                  if (mins <= 0) return null;
                  const h = Math.floor(mins / 60);
                  const m = mins % 60;
                  return m === 0 ? `${h}h` : `${h}h ${m}min`;
                })();
                return (
                  <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 grid grid-cols-3 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Código materia</p>
                      <p className="text-sm font-mono font-semibold text-foreground">{claseData?.codigo_materia || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Total estudiantes</p>
                      <p className="text-sm font-semibold text-foreground">{claseData?.total_estudiantes ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Número de horas</p>
                      <p className="text-sm font-semibold text-foreground">{duracionHoras || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Asignatura</p>
                      <p className="text-sm font-semibold text-foreground">{claseData?.materia || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Facultad</p>
                      <p className="text-sm font-semibold text-foreground">{claseData?.facultad || '—'}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Observaciones */}
              <FormField label="Observaciones">
                <textarea
                  className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder="Observaciones de la clase..."
                  value={formInfo.observaciones || ''}
                  onChange={(e) => setFormInfo((f) => ({ ...f, observaciones: e.target.value }))}
                />
              </FormField>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleGuardarInfo} disabled={actualizarClase.isPending}>
                  {actualizarClase.isPending ? 'Guardando...' : 'Guardar información'}
                </Button>
              </DialogFooter>
            </RadixTabs.Content>

            {/* ── TAB 2: Fantasmas ── */}
            <RadixTabs.Content value="fantasmas" className="space-y-4">
              {esFantasma && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Este grupo es fantasma de:</p>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <Ghost className="h-4 w-4 text-purple-500 shrink-0" />
                    <span className="text-sm font-mono font-semibold text-purple-700 dark:text-purple-300 flex-1">{claseData?.fantasma_de}</span>
                    <button
                      className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                      title="Desvincular"
                      onClick={() => handleDesvincular(claseData?.codigo_materia, claseData?.grupo)}
                      disabled={desvincularFantasma.isPending}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {esPrincipal && (
                <div className="space-y-4">
                  {/* Agregar fantasma */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2.5 bg-muted/30 border-b border-border">
                      <p className="text-sm font-semibold">Agregar fantasma</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Ingresa el código de la materia que actuará como fantasma de esta clase</p>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder="Código de la materia..."
                          value={busquedaFantasma}
                          onChange={(e) => setBusquedaFantasma(e.target.value.toUpperCase())}
                          className="flex-1 font-mono"
                        />
                        {loadingValidacion && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
                      </div>

                      {busquedaFantasma.trim() && !loadingValidacion && (
                        <div className="space-y-2">
                          {gruposDisponibles.length === 0 ? (
                            <div className="flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-destructive">
                              <XCircle className="h-4 w-4 shrink-0" />
                              <span>No se encontraron grupos para este código en el semestre.</span>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-muted-foreground">Selecciona un grupo para vincular:</p>
                              <div className="flex flex-wrap gap-2">
                                {gruposDisponibles.map(({ grupo, puede, razon }) => (
                                  <button
                                    key={grupo}
                                    type="button"
                                    title={puede ? `Vincular grupo ${grupo}` : razon}
                                    disabled={!puede}
                                    onClick={() => puede && setGrupoFantasmaSeleccionado(String(grupo) === grupoFantasmaSeleccionado ? '' : String(grupo))}
                                    className={[
                                      'inline-flex items-center gap-1.5 text-sm font-mono px-3 py-1.5 rounded-md border transition-colors',
                                      puede
                                        ? grupoFantasmaSeleccionado === String(grupo)
                                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700'
                                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
                                    ].join(' ')}
                                  >
                                    {puede ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                    Grupo {grupo}
                                  </button>
                                ))}
                              </div>
                              {grupoFantasmaSeleccionado && (
                                <Button
                                  size="sm"
                                  onClick={handleVincular}
                                  disabled={vincularFantasma.isPending}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                                  Vincular Grupo {grupoFantasmaSeleccionado}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lista de fantasmas asociados */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
                      <p className="text-sm font-semibold">Fantasmas asociados</p>
                      {fantasmasDeEste.length > 0 && (
                        <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full">
                          {fantasmasDeEste.length}
                        </span>
                      )}
                    </div>
                    <div className="divide-y divide-border">
                      {fantasmasDeEste.length === 0 ? (
                        <div className="px-3 py-6 text-center">
                          <Ghost className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Sin fantasmas vinculados</p>
                        </div>
                      ) : (
                        fantasmasDeEste.map(({ codigo_materia, grupo, materia, total_estudiantes, facultad, dias, horarios }) => (
                          <div
                            key={`${codigo_materia}|${grupo}`}
                            className="flex items-start gap-3 px-3 py-3 hover:bg-muted/30 transition-colors"
                          >
                            <Ghost className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono font-bold text-purple-700 dark:text-purple-300">{codigo_materia}</span>
                                <span className="text-xs font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">Grupo {grupo}</span>
                              </div>
                              {materia && <p className="text-xs text-foreground font-medium">{materia}</p>}
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {facultad && <span className="text-xs text-muted-foreground">{facultad}</span>}
                                {total_estudiantes != null && (
                                  <span className="text-xs text-muted-foreground">{total_estudiantes} estudiantes</span>
                                )}
                                {dias.length > 0 && <span className="text-xs text-muted-foreground">{dias.join(' · ')}</span>}
                                {horarios.length > 0 && <span className="text-xs text-muted-foreground font-mono">{horarios.join(' · ')}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDesvincular(codigo_materia, grupo)}
                              disabled={desvincularFantasma.isPending}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded shrink-0 mt-0.5"
                              title="Desvincular"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!esPrincipal && !esFantasma && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Ghost className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Los fantasmas solo se gestionan en registros de tipo Clase.</p>
                </div>
              )}
            </RadixTabs.Content>

            {/* ── TAB 3: Horario y Salón ── */}
            <RadixTabs.Content value="horario" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Día">
                  <Select
                    value={formHorario.dia || ''}
                    onChange={(e) => { setFormHorario((f) => ({ ...f, dia: e.target.value })); resetFranja('dia'); }}
                  >
                    <option value="">Seleccione...</option>
                    {DIAS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </FormField>

                <div />

                <FormField label="Hora inicio">
                  <MobileTimePicker
                    openTo="hours"
                    ampm={false}
                    disabled={!formHorario.dia}
                    value={formHorario.hora_inicio ? dayjs(`2000-01-01T${formHorario.hora_inicio}`) : null}
                    onChange={(v) => {
                      if (v) {
                        setFormHorario((f) => ({ ...f, hora_inicio: v.format('HH:mm') }));
                        resetFranja('hora_inicio');
                      }
                    }}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </FormField>

                <FormField label="Hora fin">
                  <MobileTimePicker
                    openTo="hours"
                    ampm={false}
                    disabled={!formHorario.hora_inicio}
                    value={formHorario.hora_fin ? dayjs(`2000-01-01T${formHorario.hora_fin}`) : null}
                    onChange={(v) => {
                      if (v) {
                        setFormHorario((f) => ({ ...f, hora_fin: v.format('HH:mm') }));
                        resetFranja('hora_fin');
                      }
                    }}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                  {horaInvalida && (
                    <p className="text-xs text-destructive mt-1">La hora fin debe ser mayor que la hora inicio</p>
                  )}
                </FormField>

                {franjaCompleta && (
                  <>
                    <FormField label="Bloque">
                      <Select
                        value={bloqueSeleccionado}
                        onChange={(e) => { setBloqueSeleccionado(e.target.value); setFormHorario((f) => ({ ...f, aula: '' })); setConflictos(null); }}
                      >
                        <option value="">Todos los bloques</option>
                        {bloques.map((b) => (
                          <option key={b} value={b}>{b} ({salonesPerBloque[b]})</option>
                        ))}
                      </Select>
                    </FormField>

                    <FormField label="Salón">
                      <div className="flex items-center gap-2">
                        <Select
                          value={formHorario.aula || ''}
                          onChange={(e) => setFormHorario((f) => ({ ...f, aula: e.target.value }))}
                          disabled={loadingSalones}
                          className="flex-1"
                        >
                          <option value="">Seleccione salón...</option>
                          {opcionesSalon.map((s) => (
                            <option key={s.nombre_salon} value={s.nombre_salon}>{s.nombre_salon}</option>
                          ))}
                        </Select>
                        {loadingSalones && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
                      </div>
                    </FormField>
                  </>
                )}

                {formHorario.aula && (
                  <div className="col-span-2">
                    {validarConflictos.isPending ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Verificando disponibilidad...
                      </div>
                    ) : conflictos !== null && (
                      conflictos.length === 0 ? (
                        <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                          <CheckCircle className="h-4 w-4" /> Horario disponible
                        </div>
                      ) : (
                        <div className="text-sm text-destructive space-y-1">
                          <div className="flex items-center gap-1.5 font-medium">
                            <XCircle className="h-4 w-4" /> Conflictos detectados:
                          </div>
                          <ul className="ml-5 list-disc space-y-0.5">
                            {conflictos.map((c, i) => <li key={i}>{c.detalle}</li>)}
                          </ul>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleGuardarHorario} disabled={actualizarClase.isPending}>
                  {actualizarClase.isPending ? 'Guardando...' : 'Guardar horario'}
                </Button>
              </DialogFooter>
            </RadixTabs.Content>
          </RadixTabs.Root>
        </DialogContent>
      </Dialog>
  );
}
