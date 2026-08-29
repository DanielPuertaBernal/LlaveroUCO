import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useCrearReservaSemestral,
  useActualizarReservaSemestral,
  useValidarConflictosSemestral,
  useSalonesDisponiblesFranja,
  reservasSemestralesApi,
} from './reservasSemestralesApi';
import { useSemestres, useSemestreVigente } from '@/features/programacion/programacionApi';
import { comunidadApi } from '@/features/comunidad/comunidadApi';
import Swal from '@/shared/lib/swal';
import { toast } from 'sonner';
import {
  BookMarked, Plus, X, Search, Loader2, CreditCard,
  CheckCircle2, AlertTriangle, UserPlus, ArrowLeft,
} from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import { cn } from '@/shared/lib/utils';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import dayjs from 'dayjs';
import { abrirBuscadorPersonaPorNombre } from '@/shared/utils/personaSearchHotkey';
import { sinHTML, soloNumerosConTope, LONGITUD_MAXIMA } from '@/shared/utils/inputValidation';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const FORM_INICIAL = {
  solicitante_documento: '',
  solicitante_nombre: '',
  tipo_solicitante: 'docente',
  responsable_documento: '',
  responsable_nombre: '',
  materia: '',
  semestre: '',
};

const FRANJA_INICIAL = { dia: '', hora_inicio: '', hora_fin: '', nombre_salon: '', nombre_bloque: '', motivo_diferente: false, motivo: '', con_monitor: false, monitor_documento: '', monitor_nombre: '' };

// ─────────────────────────────────────────────────────────────────────────────

function FranjaRow({ franja, index, onChange, onRemove, otrasSelecciones, semestreCtx, excluirGrupoId, docenteDocumento }) {
  const esMonitorInvalido = Boolean(
    franja.con_monitor && franja.monitor_documento && docenteDocumento &&
    String(franja.monitor_documento).trim() === docenteDocumento
  );
  const { data: salonesDisponibles = [], isFetching: isFetchingSalones } = useSalonesDisponiblesFranja(
    franja.dia,
    franja.hora_inicio,
    franja.hora_fin,
    semestreCtx?.semestre,
    undefined,
    undefined,
    excluirGrupoId,
  );

  // Salones ya tomados por otras franjas que se solapan en día y horario
  const salonesUsadosPorOtras = useMemo(() => {
    return new Set(
      otrasSelecciones
        .filter(
          (o) =>
            o.nombre_salon &&
            o.dia === franja.dia &&
            franja.hora_inicio && franja.hora_fin &&
            o.hora_inicio < franja.hora_fin &&
            o.hora_fin > franja.hora_inicio,
        )
        .map((o) => o.nombre_salon),
    );
  }, [otrasSelecciones, franja.dia, franja.hora_inicio, franja.hora_fin]);

  const salonesDisponiblesFiltrados = useMemo(
    () => salonesDisponibles.filter((s) => !salonesUsadosPorOtras.has(s.nombre_salon)),
    [salonesDisponibles, salonesUsadosPorOtras],
  );

  const [bloqueElegido, setBloqueElegido] = useState(franja.nombre_bloque || '');

  // Reset bloque cuando cambia día u horario
  useEffect(() => {
    setBloqueElegido('');
  }, [franja.dia, franja.hora_inicio, franja.hora_fin]);

  // Sincronizar bloqueElegido si la franja ya trae bloque asignado
  useEffect(() => {
    if (franja.nombre_bloque && franja.nombre_bloque !== bloqueElegido) {
      setBloqueElegido(franja.nombre_bloque);
    }
  }, [franja.nombre_bloque]);

  const bloquesDisponibles = useMemo(() => {
    const set = new Set(salonesDisponiblesFiltrados.map((s) => s.nombre_bloque).filter(Boolean));
    // En modo edición, incluir el bloque actual aunque no esté en la lista disponible
    if (franja.nombre_bloque) set.add(franja.nombre_bloque);
    return [...set].sort();
  }, [salonesDisponiblesFiltrados, franja.nombre_bloque]);

  const salonesPorBloque = useMemo(() => {
    if (!bloqueElegido) return [];
    const disponibles = salonesDisponiblesFiltrados.filter((s) => s.nombre_bloque === bloqueElegido);
    // En modo edición, incluir el salón actual si no está en disponibles
    const estaActual = disponibles.some((s) => s.nombre_salon === franja.nombre_salon);
    if (!estaActual && franja.nombre_salon && franja.nombre_bloque === bloqueElegido) {
      return [{ nombre_salon: franja.nombre_salon, nombre_bloque: franja.nombre_bloque }, ...disponibles];
    }
    return disponibles;
  }, [salonesDisponiblesFiltrados, bloqueElegido, franja.nombre_salon, franja.nombre_bloque]);

  const validar = useValidarConflictosSemestral();
  const [conflicto, setConflicto] = useState(null);

  const [buscandoMonitor, setBuscandoMonitor] = useState(false);

  async function buscarMonitorFranja(identificador) {
    const id = String(identificador || '').trim();
    if (!id) return;
    setBuscandoMonitor(true);
    try {
      let res;
      const esDocumento = /^\d+$/.test(id);
      if (esDocumento) {
        try { res = await comunidadApi.buscarPorDocumento(id); }
        catch (_) { res = await comunidadApi.buscarPorCarnet(id); }
      } else {
        try { res = await comunidadApi.buscarPorCarnet(id); }
        catch (_) { res = await comunidadApi.buscarPorDocumento(id); }
      }
      const persona = res.data.data.persona;
      onChange({ ...franja, monitor_documento: persona.numero_documento, monitor_nombre: persona.nombre });
    } catch {
      toast.error('No se encontró persona con ese documento o carnet');
    } finally {
      setBuscandoMonitor(false);
    }
  }

  useEffect(() => {
    if (!franja.dia || !franja.hora_inicio || !franja.hora_fin || !franja.nombre_salon) {
      setConflicto(null);
      return;
    }
    validar.mutate(
      {
        nombre_salon: franja.nombre_salon,
        dia: franja.dia,
        hora_inicio: franja.hora_inicio,
        hora_fin: franja.hora_fin,
        ...(semestreCtx?.semestre ? { semestre: semestreCtx.semestre } : {}),
        ...(excluirGrupoId ? { excluir_grupo_id: excluirGrupoId } : {}),
      },
      {
        onSuccess: (res) => setConflicto(res.data.data),
        onError: () => setConflicto(null),
      }
    );
  }, [franja.dia, franja.hora_inicio, franja.hora_fin, franja.nombre_salon, semestreCtx?.semestre, excluirGrupoId]);

  const franjaCompleta = franja.dia && franja.hora_inicio && franja.hora_fin;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-background">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/80">Franja {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-foreground/40 hover:text-destructive transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <FormField label="Día">
          <Select
            value={franja.dia}
            onChange={(e) => onChange({ ...franja, dia: e.target.value, hora_inicio: '', hora_fin: '', nombre_salon: '', nombre_bloque: '' })}
          >
            <option value="">-- Día --</option>
            {DIAS_SEMANA.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </FormField>
        <FormField label="Inicio">
          <MobileTimePicker
            openTo="hours"
            ampm={false}
            disabled={!franja.dia}
            value={franja.hora_inicio ? dayjs(`2000-01-01T${franja.hora_inicio}`) : null}
            onChange={(v) => v && onChange({ ...franja, hora_inicio: v.format('HH:mm'), hora_fin: '', nombre_salon: '', nombre_bloque: '' })}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </FormField>
        <FormField label="Fin">
          <MobileTimePicker
            openTo="hours"
            ampm={false}
            disabled={!franja.hora_inicio}
            value={franja.hora_fin ? dayjs(`2000-01-01T${franja.hora_fin}`) : null}
            onChange={(v) => v && onChange({ ...franja, hora_fin: v.format('HH:mm'), nombre_salon: '', nombre_bloque: '' })}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </FormField>
      </div>
      {franja.hora_fin && franja.hora_inicio && franja.hora_fin <= franja.hora_inicio && (
        <p className="text-xs text-destructive -mt-1">La hora fin debe ser posterior a la hora inicio</p>
      )}

      {/* Selector de salón disponible para esta franja */}
      {franjaCompleta && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FormField label="Bloque disponible">
            {isFetchingSalones
              ? <p className="text-xs text-foreground/50 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Buscando…</p>
              : salonesDisponiblesFiltrados.length === 0 && !franja.nombre_bloque
                ? <p className="text-xs text-amber-600 dark:text-amber-400">Sin salones disponibles para este horario</p>
                : (
                  <Select
                    value={bloqueElegido}
                    onChange={(e) => {
                      setBloqueElegido(e.target.value);
                      onChange({ ...franja, nombre_bloque: e.target.value, nombre_salon: '' });
                    }}
                  >
                    <option value="">-- Seleccionar bloque --</option>
                    {bloquesDisponibles.map((b) => (
                      <option key={b} value={b}>Bloque {b} ({salonesDisponiblesFiltrados.filter((s) => s.nombre_bloque === b).length || '—'})</option>
                    ))}
                  </Select>
                )}
          </FormField>
          <FormField label="Salón disponible">
            <Select
              value={franja.nombre_salon || ''}
              onChange={(e) => {
                const salon = salonesPorBloque.find((s) => s.nombre_salon === e.target.value);
                if (salon) onChange({ ...franja, nombre_salon: salon.nombre_salon, nombre_bloque: salon.nombre_bloque });
              }}
              disabled={!bloqueElegido || salonesPorBloque.length === 0}
            >
              <option value="">-- Seleccionar salón --</option>
              {salonesPorBloque.map((s) => (
                <option key={s.nombre_salon} value={s.nombre_salon}>{s.nombre_salon}</option>
              ))}
            </Select>
          </FormField>
        </div>
      )}

      {/* Salón asignado a esta franja */}
      {franja.nombre_salon && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={11} /> Salón asignado: <strong>{franja.nombre_salon}</strong> — Bloque {franja.nombre_bloque}
        </p>
      )}

      {/* Motivo diferente para esta franja */}
      {franjaCompleta && (
        <div className="space-y-1.5 border-t pt-2 mt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={franja.motivo_diferente}
              onChange={(e) => onChange({ ...franja, motivo_diferente: e.target.checked, motivo: '' })}
              className="rounded border-border"
            />
            <span className="text-foreground/70">Motivo específico para esta franja</span>
          </label>
          {franja.motivo_diferente && (
            <FormField label="Motivo de esta franja">
              <Input
                value={franja.motivo}
                onChange={(e) => onChange({ ...franja, motivo: sinHTML(e.target.value) })}
                placeholder="Escribe el motivo específico (sobreescribe la materia general)"
              />
            </FormField>
          )}
        </div>
      )}

      {/* Monitor específico para esta franja */}
      {franjaCompleta && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={franja.con_monitor}
              onChange={(e) => onChange({ ...franja, con_monitor: e.target.checked, monitor_documento: '', monitor_nombre: '' })}
              className="rounded border-border"
            />
            <span className="text-foreground/70 flex items-center gap-1"><UserPlus size={11} /> Asignar monitor para esta franja</span>
          </label>
          {franja.con_monitor && (
            <div className="space-y-1.5 pl-5">
              <div className="flex gap-1">
                <Input
                  value={franja.monitor_documento}
                  maxLength={LONGITUD_MAXIMA.documento}
                  onChange={(e) => onChange({ ...franja, monitor_documento: soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento), monitor_nombre: '' })}
                  onKeyDown={(e) => e.key === 'Enter' && buscarMonitorFranja(franja.monitor_documento)}
                  placeholder="Documento o carnet del monitor"
                />
                <button
                  type="button"
                  onClick={() => buscarMonitorFranja(franja.monitor_documento)}
                  disabled={buscandoMonitor}
                  className="px-2 rounded border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50 shrink-0"
                  title="Buscar monitor"
                >
                  {buscandoMonitor ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </button>
              </div>
              {franja.monitor_nombre && !esMonitorInvalido && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Monitor asignado: <strong>{franja.monitor_nombre}</strong>
                  <button
                    type="button"
                    onClick={() => onChange({ ...franja, monitor_documento: '', monitor_nombre: '' })}
                    className="ml-1 text-foreground/40 hover:text-destructive transition-colors"
                  >
                    <X size={10} />
                  </button>
                </p>
              )}
              {esMonitorInvalido && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle size={11} /> No puedes asignarte a ti mismo como monitor.
                  <button
                    type="button"
                    onClick={() => onChange({ ...franja, monitor_documento: '', monitor_nombre: '' })}
                    className="ml-1 text-foreground/40 hover:text-destructive transition-colors"
                  >
                    <X size={10} />
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {conflicto?.tiene_conflictos && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2 space-y-0.5">
          <p className="font-semibold flex items-center gap-1"><AlertTriangle size={11} /> Conflictos detectados:</p>
          {conflicto.conflictos.map((c, i) => <p key={i} className="pl-3">· [{c.tipo}] {c.detalle}</p>)}
        </div>
      )}
      {conflicto && !conflicto.tiene_conflictos && franja.hora_inicio && franja.hora_fin && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={11} /> Horario disponible</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ReservasSemestralesPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Detectar modo edición desde location.state
  const editData = location.state?.editData ?? null;
  const modoEdicion = !!editData;

  const [buscandoPersona, setBuscandoPersona] = useState(false);
  const [solicitanteEncontrado, setSolicitanteEncontrado] = useState(null);
  const [responsableEncontrado, setResponsableEncontrado] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [franjas, setFranjas] = useState([{ ...FRANJA_INICIAL }]);

  const { data: semestres = [] } = useSemestres();
  const { data: semestreVigente } = useSemestreVigente();
  const crear = useCrearReservaSemestral();
  const actualizar = useActualizarReservaSemestral();

  // Pre-cargar datos en modo edición
  useEffect(() => {
    if (editData) {
      setForm({
        solicitante_documento: editData.numero_documento || '',
        solicitante_nombre: editData.docente || '',
        tipo_solicitante: editData.tipo_solicitante || 'docente',
        responsable_documento: editData.responsable_documento || '',
        responsable_nombre: editData.responsable_nombre || '',
        materia: editData.materia || '',
        semestre: editData.semestre || '',
      });
      setFranjas(
        editData.franjas.map((f) => ({
          dia: f.dia || '',
          hora_inicio: f.hora_inicio || '',
          hora_fin: f.hora_fin || '',
          nombre_salon: f.aula || '',
          nombre_bloque: f.nombre_bloque || '',
          motivo_diferente: !!(f.materia && f.materia !== editData.materia),
          motivo: (f.materia && f.materia !== editData.materia) ? f.materia : '',
          con_monitor: false,
          monitor_documento: '',
          monitor_nombre: '',
        }))
      );
    }
  }, []);

  // Inicializar semestre con el vigente cuando carga (solo en modo crear)
  useEffect(() => {
    if (!modoEdicion && semestreVigente && !form.semestre) {
      setForm((f) => ({ ...f, semestre: semestreVigente.codigo }));
    }
  }, [semestreVigente]);

  const objetivoEscaneo = useMemo(() => {
    if (!solicitanteEncontrado) return 'solicitante';
    if (form.tipo_solicitante === 'estudiante' && !responsableEncontrado) return 'responsable';
    return 'solicitante';
  }, [solicitanteEncontrado, responsableEncontrado, form.tipo_solicitante]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      void handleBuscarPorNombre();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [objetivoEscaneo]);

  // Auto-búsqueda al escribir documento (sin Enter)
  useEffect(() => {
    if (!form.solicitante_documento || form.solicitante_documento.length < 5 || solicitanteEncontrado) return;
    const t = setTimeout(() => buscarPersona(form.solicitante_documento, 'solicitante'), 600);
    return () => clearTimeout(t);
  }, [form.solicitante_documento]);

  useEffect(() => {
    if (form.tipo_solicitante !== 'estudiante' || !form.responsable_documento || form.responsable_documento.length < 5 || responsableEncontrado) return;
    const t = setTimeout(() => buscarPersona(form.responsable_documento, 'responsable'), 600);
    return () => clearTimeout(t);
  }, [form.responsable_documento]);

  function aplicarPersonaEnFormulario(persona, objetivo, identificadorFallback = '') {
    if (!persona) return;
    const fallback = String(identificadorFallback || '').trim();
    if (objetivo === 'responsable') {
      setResponsableEncontrado(persona);
      setForm((f) => ({
        ...f,
        responsable_documento: persona.numero_documento || fallback,
        responsable_nombre: persona.nombre || '',
      }));
      return;
    }
    const tipoPersona = String(persona?.tipo || '').toLowerCase();
    const tipoSolicitante = ['docente', 'estudiante'].includes(tipoPersona) ? tipoPersona : 'docente';
    setSolicitanteEncontrado(persona);
    setForm((f) => ({
      ...f,
      solicitante_documento: persona.numero_documento || fallback,
      solicitante_nombre: persona.nombre || '',
      tipo_solicitante: tipoSolicitante,
      responsable_documento: tipoSolicitante === 'estudiante' ? f.responsable_documento : '',
      responsable_nombre: tipoSolicitante === 'estudiante' ? f.responsable_nombre : '',
    }));
    if (tipoSolicitante !== 'estudiante') setResponsableEncontrado(null);
  }

  async function handleBuscarPorNombre() {
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: objetivoEscaneo === 'responsable' ? 'Buscar profesor responsable (F1)' : 'Buscar solicitante (F1)',
      tipo: objetivoEscaneo === 'responsable' ? 'docente' : undefined,
      placeholder: objetivoEscaneo === 'responsable' ? 'Nombre del profesor' : 'Nombre del solicitante',
    });
    if (!persona) return;
    aplicarPersonaEnFormulario(persona, objetivoEscaneo);
  }

  async function buscarPersona(identificador, objetivo = 'solicitante') {
    const id = String(identificador || '').trim();
    if (!id) return;
    setBuscandoPersona(true);
    if (objetivo === 'responsable') setResponsableEncontrado(null);
    else setSolicitanteEncontrado(null);
    try {
      let res;
      const esDocumento = /^\d+$/.test(id);
      if (esDocumento) {
        try { res = await comunidadApi.buscarPorDocumento(id); }
        catch (_) { res = await comunidadApi.buscarPorCarnet(id); }
      } else {
        try { res = await comunidadApi.buscarPorCarnet(id); }
        catch (_) { res = await comunidadApi.buscarPorDocumento(id); }
      }
      aplicarPersonaEnFormulario(res.data.data.persona, objetivo, id);
    } catch {
      Swal.fire({ icon: 'warning', title: 'No encontrado', text: `No se encontró persona con "${id}". Puede ingresar el nombre manualmente.`, timer: 3000, showConfirmButton: false });
    } finally {
      setBuscandoPersona(false);
    }
  }

  function limpiarFormulario() {
    setForm({ ...FORM_INICIAL, semestre: semestreVigente?.codigo || '' });
    setFranjas([{ ...FRANJA_INICIAL }]);
    setSolicitanteEncontrado(null);
    setResponsableEncontrado(null);
  }

  async function handleGuardar() {
    const requiereResponsable = form.tipo_solicitante === 'estudiante';
    if (!form.solicitante_documento || !form.solicitante_nombre || !form.materia) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Documento, nombre y materia son requeridos.' });
      return;
    }
    if (requiereResponsable && (!form.responsable_documento || !form.responsable_nombre)) {
      Swal.fire({ icon: 'warning', title: 'Falta profesor responsable', text: 'Si el solicitante es estudiante, debes registrar el profesor responsable.' });
      return;
    }
    if (!form.semestre) {
      Swal.fire({ icon: 'warning', title: 'Semestre requerido', text: 'Debes seleccionar un semestre.' });
      return;
    }
    const franjasValidas = franjas.filter((f) => f.dia && f.hora_inicio && f.hora_fin);
    if (franjasValidas.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin franjas', text: 'Debes agregar al menos una franja horaria completa (día, inicio y fin).' });
      return;
    }

    const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
    const franjaInvalida = franjasValidas.find((f) => toMin(f.hora_fin) <= toMin(f.hora_inicio));
    if (franjaInvalida) {
      Swal.fire({ icon: 'error', title: 'Horario inválido', text: `Franja del ${franjaInvalida.dia}: la hora fin debe ser posterior a la hora inicio.` });
      return;
    }

    const llaves = franjasValidas.map((f) => `${f.dia}|${f.hora_inicio}|${f.hora_fin}`);
    if (new Set(llaves).size !== llaves.length) {
      Swal.fire({ icon: 'warning', title: 'Franjas duplicadas', text: 'No pueden existir dos franjas con el mismo día y horario.' });
      return;
    }

    const docenteDocumento = String((requiereResponsable ? form.responsable_documento : form.solicitante_documento) || '').trim();
    const franjaMonitorInvalida = franjasValidas.find(
      (f) => f.con_monitor && f.monitor_documento && docenteDocumento && String(f.monitor_documento).trim() === docenteDocumento
    );
    if (franjaMonitorInvalida) {
      Swal.fire({
        icon: 'error',
        title: 'Monitor inválido',
        text: `Franja del ${franjaMonitorInvalida.dia}: el monitor no puede ser la misma persona que el ${requiereResponsable ? 'profesor responsable' : 'docente'} de la reserva.`,
      });
      return;
    }

    const sinSalon = franjasValidas.filter((f) => !f.nombre_salon);
    if (sinSalon.length > 0) {
      Swal.fire({ icon: 'warning', title: 'Salón no asignado', text: `${sinSalon.length === 1 ? 'Una franja no tiene' : `${sinSalon.length} franjas no tienen`} salón asignado.` });
      return;
    }

    const semestrePayload = { semestre: form.semestre };
    const excluirGrupoId = modoEdicion ? editData?.grupo_id : null;

    let forzar = false;
    const conflictosTotales = [];
    for (const f of franjasValidas) {
      try {
        const res = await reservasSemestralesApi.validar({
          nombre_salon: f.nombre_salon,
          dia: f.dia,
          hora_inicio: f.hora_inicio,
          hora_fin: f.hora_fin,
          ...semestrePayload,
          ...(excluirGrupoId ? { excluir_grupo_id: excluirGrupoId } : {}),
        });
        if (res.data.data.tiene_conflictos) {
          conflictosTotales.push({ franja: f, conflictos: res.data.data.conflictos });
        }
      } catch { /* continuar */ }
    }

    if (conflictosTotales.length > 0) {
      const lineas = conflictosTotales.flatMap(({ franja, conflictos }) =>
        conflictos.map((c) => `• ${franja.dia} ${franja.hora_inicio}–${franja.hora_fin} [${c.tipo}] ${c.detalle}`)
      ).join('<br/>');
      const confirm = await Swal.fire({
        icon: 'warning',
        title: 'Conflictos detectados',
        html: `<p class="text-sm text-left mb-2">Existen solapamientos:</p><div class="text-left text-sm">${lineas}</div>`,
        showCancelButton: true,
        confirmButtonText: modoEdicion ? 'Actualizar de todas formas' : 'Crear de todas formas',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#d97706',
      });
      if (!confirm.isConfirmed) return;
      forzar = true;
    }

    const payload = { ...form, franjas: franjasValidas, forzar, ...semestrePayload };

    if (modoEdicion) {
      actualizar.mutate(
        { id: editData.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Reserva semestral actualizada correctamente');
            navigate(-1);
          },
          onError: (err) => {
            const msg = err?.response?.data?.message || 'Error al actualizar la reserva';
            Swal.fire({ icon: 'error', title: 'Error', text: msg });
          },
        }
      );
    } else {
      crear.mutate(
        payload,
        {
          onSuccess: () => {
            toast.success('Reserva semestral creada correctamente');
            limpiarFormulario();
          },
          onError: (err) => {
            const msg = err?.response?.data?.message || 'Error al crear la reserva';
            Swal.fire({ icon: 'error', title: 'Error', text: msg });
          },
        }
      );
    }
  }

  const isPending = modoEdicion ? actualizar.isPending : crear.isPending;
  const excluirGrupoId = modoEdicion ? editData?.grupo_id : null;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookMarked className="h-6 w-6" />
            {modoEdicion ? 'Editar Reserva Semestral' : 'Reservas Semestrales'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {modoEdicion
              ? `Editando reserva del semestre ${editData?.semestre || ''}`
              : 'Gestión de reservas por semestre completo'}
          </p>
        </div>
        {modoEdicion && (
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowLeft className="h-4 w-4" />Volver
          </Button>
        )}
      </div>

      <div className="bg-card border-2 border-primary/30 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">{modoEdicion ? 'Actualizar reserva semestral' : 'Nueva reserva semestral'}</h2>
        {!modoEdicion && (
          <p className="text-xs text-muted-foreground">Atajo: presiona F1 para buscar por nombre cuando no tengas el documento.</p>
        )}

        {/* Indicador de identificación */}
        <div className={cn(
          'flex items-center gap-2 text-sm px-3 py-2 rounded-lg border',
          (objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)
            ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
            : buscandoPersona
              ? 'bg-primary/5 border-primary/20 text-primary'
              : 'bg-muted border-border text-muted-foreground'
        )}>
          {(objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : buscandoPersona
              ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              : <CreditCard className="h-4 w-4 shrink-0" />}
          {buscandoPersona
            ? 'Buscando...'
            : (objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)
              ? `${objetivoEscaneo === 'responsable' ? 'Profesor responsable' : 'Solicitante'}: ${(objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)?.nombre}`
              : `Pase el carnet por el lector o escriba el documento de ${objetivoEscaneo === 'responsable' ? 'profesor responsable' : 'solicitante'}`}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Semestre */}
          <FormField label="Semestre">
            <Select
              value={form.semestre}
              onChange={(e) => setForm((f) => ({ ...f, semestre: e.target.value }))}
              disabled={modoEdicion}
            >
              <option value="">-- Seleccionar semestre --</option>
              {semestres.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.codigo}{s.codigo === semestreVigente?.codigo ? ' (vigente)' : ''}
                </option>
              ))}
            </Select>
          </FormField>

          {/* 2. Documento solicitante */}
          <FormField label="Documento">
            <div className="flex gap-1">
              <Input
                value={form.solicitante_documento}
                onChange={(e) => {
                  setForm((f) => ({ ...f, solicitante_documento: soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento), solicitante_nombre: '', tipo_solicitante: 'docente', responsable_documento: '', responsable_nombre: '' }));
                  setSolicitanteEncontrado(null);
                  setResponsableEncontrado(null);
                }}
                placeholder="Escanee carnet o escriba documento"
                maxLength={LONGITUD_MAXIMA.documento}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPersona(form.solicitante_documento, 'solicitante'); } }}
              />
              <button
                type="button"
                onClick={() => buscarPersona(form.solicitante_documento, 'solicitante')}
                disabled={buscandoPersona}
                className="px-2 rounded border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50"
                title="Buscar persona"
              >
                {buscandoPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          {/* 3. Nombre solicitante (solo lectura) */}
          <FormField label="Nombre solicitante">
            <div className="relative">
              <Input
                value={form.solicitante_nombre}
                disabled
                placeholder="Se autocompleta con el documento"
              />
              {solicitanteEncontrado && (
                <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
            </div>
          </FormField>

          {/* 4. Responsable (solo si estudiante) */}
          {form.tipo_solicitante === 'estudiante' && (
            <>
              <FormField label="Documento profesor responsable">
                <div className="flex gap-1">
                  <Input
                    value={form.responsable_documento}
                    onChange={(e) => { setForm((f) => ({ ...f, responsable_documento: soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento) })); setResponsableEncontrado(null); }}
                    placeholder="Escanee carnet o escriba documento"
                    maxLength={LONGITUD_MAXIMA.documento}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPersona(form.responsable_documento, 'responsable'); } }}
                  />
                  <button
                    type="button"
                    onClick={() => buscarPersona(form.responsable_documento, 'responsable')}
                    disabled={buscandoPersona}
                    className="px-2 rounded border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50"
                    title="Buscar profesor responsable"
                  >
                    {buscandoPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>
              <FormField label="Nombre profesor responsable">
                <div className="relative">
                  <Input
                    value={form.responsable_nombre}
                    disabled
                    placeholder="Se autocompleta con el documento"
                  />
                  {responsableEncontrado && (
                    <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
              </FormField>
            </>
          )}

          {/* 5. Motivo */}
          <FormField label="Motivo">
            <Input
              value={form.materia}
              onChange={(e) => setForm((f) => ({ ...f, materia: sinHTML(e.target.value) }))}
              placeholder="Nombre de la materia o motivo de la reserva"
            />
          </FormField>

        </div>

        {/* Franjas horarias */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Franjas horarias</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFranjas((f) => [...f, { ...FRANJA_INICIAL }])}
              className="gap-1 text-xs"
            >
              <Plus size={12} />Agregar franja
            </Button>
          </div>
          <p className="text-xs text-foreground/50 italic">Completa día e horario en cada franja para ver los salones disponibles.</p>
          {franjas.map((franja, i) => (
            <FranjaRow
              key={i}
              index={i}
              franja={franja}
              otrasSelecciones={franjas.filter((_, idx) => idx !== i)}
              onChange={(updated) => setFranjas((prev) => prev.map((f, idx) => idx === i ? updated : f))}
              onRemove={() => setFranjas((prev) => prev.filter((_, idx) => idx !== i))}
              semestreCtx={{ semestre: form.semestre }}
              excluirGrupoId={excluirGrupoId}
              docenteDocumento={String((form.tipo_solicitante === 'estudiante' ? form.responsable_documento : form.solicitante_documento) || '').trim()}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleGuardar} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <BookMarked size={15} />}
            {modoEdicion ? 'Actualizar reserva semestral' : 'Crear reserva semestral'}
          </Button>
          {modoEdicion
            ? <Button variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
            : <Button variant="outline" onClick={limpiarFormulario}>Limpiar</Button>
          }
        </div>
      </div>
    </div>
  );
}
