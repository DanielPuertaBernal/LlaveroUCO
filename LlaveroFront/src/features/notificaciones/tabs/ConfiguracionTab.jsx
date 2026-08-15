import { useState } from 'react';
import {
  useConfiguraciones,
  useConfiguracionDefaults,
  useGuardarConfiguracion,
  useEliminarConfiguracion,
  useActualizarDefaults,
} from '@/features/configuracion/configuracionApi';
import { useBloques } from '@/features/bloques/bloquesApi';
import Swal from '@/shared/lib/swal';
import { Plus, Trash2, Pencil, Clock, Bell, RefreshCw, Hash } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { FormField, Select } from '@/shared/components/ui/FormField';

const OPCIONES_TIEMPO_PRESTAMO = [30, 45, 60, 90, 120, 150, 180, 240];
const OPCIONES_INTERVALO = [10, 15, 20, 30, 45, 60];
const OPCIONES_MAX_RECORDATORIOS = [1, 2, 3, 5, 8, 10];

function PillSelector({ opciones, valor, onChange, formatLabel, min = 1, max = 9999, suffix = '' }) {
  const esPersonalizado = !opciones.includes(valor);
  const [modoCustom, setModoCustom] = useState(esPersonalizado);

  function activarCustom() {
    setModoCustom(true);
  }

  function handleCustomChange(e) {
    const n = parseInt(e.target.value, 10);
    if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
  }

  function handlePillClick(opt) {
    setModoCustom(false);
    onChange(opt);
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {opciones.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => handlePillClick(opt)}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            !modoCustom && valor === opt
              ? 'bg-primary text-primary-foreground border-primary font-medium'
              : 'bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground'
          }`}
        >
          {formatLabel ? formatLabel(opt) : opt}
        </button>
      ))}

      {modoCustom ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            defaultValue={esPersonalizado ? valor : ''}
            onChange={handleCustomChange}
            autoFocus
            className="w-20 border border-primary rounded-full px-3 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center"
          />
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        </div>
      ) : (
        <button
          type="button"
          onClick={activarCustom}
          className="px-3 py-1 text-sm rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-foreground transition-colors"
        >
          Personalizado
        </button>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label ?? (checked ? 'Activas' : 'Desactivadas')}
      </span>
    </label>
  );
}

function ConfigForm({ initial, bloques, configs, editando, onSave, onCancel, isPending }) {
  const [form, setForm] = useState(initial);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="bg-card border-2 border-primary/30 rounded-xl p-5 space-y-5">
      <h2 className="font-semibold text-base">
        {editando === '__defaults__'
          ? 'Editar valores por defecto'
          : editando === '__nuevo__'
          ? 'Nueva configuración de bloque'
          : `Editando: ${editando}`}
      </h2>

      {editando === '__nuevo__' && (
        <FormField label="Bloque">
          <Select
            value={form.nombre_bloque}
            onChange={(e) => set('nombre_bloque', e.target.value)}
          >
            <option value="">Seleccionar bloque...</option>
            {bloques
              .filter((b) => !configs.some((c) => c.nombre_bloque === b.nombre_bloque))
              .map((b) => (
                <option key={b.nombre_bloque} value={b.nombre_bloque}>{b.nombre_bloque}</option>
              ))}
          </Select>
        </FormField>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Tiempo máximo de préstamo</span>
            <span className="text-xs text-muted-foreground">(desde fin de clase)</span>
          </div>
          <PillSelector
            opciones={OPCIONES_TIEMPO_PRESTAMO}
            valor={form.tiempo_maximo_prestamo_minutos}
            onChange={(v) => set('tiempo_maximo_prestamo_minutos', v)}
            formatLabel={(v) => `${v} min`}
            min={5}
            max={1440}
            suffix="min"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Intervalo entre recordatorios</span>
          </div>
          <PillSelector
            opciones={OPCIONES_INTERVALO}
            valor={form.intervalo_recordatorio_minutos}
            onChange={(v) => set('intervalo_recordatorio_minutos', v)}
            formatLabel={(v) => `${v} min`}
            min={1}
            max={1440}
            suffix="min"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Máximo de recordatorios</span>
          </div>
          <PillSelector
            opciones={OPCIONES_MAX_RECORDATORIOS}
            valor={form.max_recordatorios}
            onChange={(v) => set('max_recordatorios', v)}
            min={1}
            max={50}
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Notificaciones automáticas</span>
          </div>
          <Toggle
            checked={form.notificaciones_activas}
            onChange={(v) => set('notificaciones_activas', v)}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={() => onSave(form)} disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar'}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

export default function ConfiguracionTab() {
  const { data: configs = [], isLoading } = useConfiguraciones();
  const { data: defaults } = useConfiguracionDefaults();
  const { data: bloques = [] } = useBloques();
  const guardar = useGuardarConfiguracion();
  const eliminar = useEliminarConfiguracion();
  const actualizarDefaults = useActualizarDefaults();
  const [editando, setEditando] = useState(null);
  const [formInicial, setFormInicial] = useState({});
  const [editandoDefaults, setEditandoDefaults] = useState(false);

  function abrirEditor(config) {
    setEditando(config?.nombre_bloque || '__nuevo__');
    setFormInicial({
      nombre_bloque: config?.nombre_bloque || '',
      tiempo_maximo_prestamo_minutos: config?.tiempo_maximo_prestamo_minutos ?? defaults?.tiempo_maximo_prestamo_minutos ?? 120,
      intervalo_recordatorio_minutos: config?.intervalo_recordatorio_minutos ?? defaults?.intervalo_recordatorio_minutos ?? 30,
      max_recordatorios: config?.max_recordatorios ?? defaults?.max_recordatorios ?? 5,
      notificaciones_activas: config?.notificaciones_activas ?? true,
    });
  }

  async function handleGuardar(form) {
    if (!form.nombre_bloque.trim()) {
      Swal.fire({ icon: 'warning', title: 'Nombre de bloque requerido' });
      return;
    }
    try {
      await guardar.mutateAsync({
        bloque: form.nombre_bloque.trim(),
        tiempo_maximo_prestamo_minutos: Number(form.tiempo_maximo_prestamo_minutos),
        intervalo_recordatorio_minutos: Number(form.intervalo_recordatorio_minutos),
        max_recordatorios: Number(form.max_recordatorios),
        notificaciones_activas: form.notificaciones_activas,
      });
      Swal.fire({ icon: 'success', title: 'Configuración guardada', timer: 1500, showConfirmButton: false });
      setEditando(null);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo guardar' });
    }
  }

  async function handleGuardarDefaults(form) {
    try {
      const { nombre_bloque: _ignored, ...data } = form;
      await actualizarDefaults.mutateAsync({
        tiempo_maximo_prestamo_minutos: Number(data.tiempo_maximo_prestamo_minutos),
        intervalo_recordatorio_minutos: Number(data.intervalo_recordatorio_minutos),
        max_recordatorios: Number(data.max_recordatorios),
        notificaciones_activas: data.notificaciones_activas,
      });
      Swal.fire({ icon: 'success', title: 'Valores por defecto actualizados', timer: 1500, showConfirmButton: false });
      setEditandoDefaults(false);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo guardar' });
    }
  }

  async function handleEliminar(bloque) {
    const result = await Swal.fire({
      title: '¿Eliminar configuración?',
      text: `El bloque "${bloque}" usará los valores por defecto`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    try {
      await eliminar.mutateAsync(bloque);
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo eliminar' });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {configs.length === 0
            ? 'Sin configuraciones personalizadas — todos los bloques usan valores por defecto'
            : `${configs.length} bloque${configs.length !== 1 ? 's' : ''} con configuración personalizada`}
        </p>
        <Button onClick={() => abrirEditor(null)} size="sm">
          <Plus className="h-4 w-4 mr-1" />Nuevo bloque
        </Button>
      </div>

      {editandoDefaults && defaults && (
        <ConfigForm
          key="__defaults__"
          initial={{
            nombre_bloque: '__defaults__',
            tiempo_maximo_prestamo_minutos: defaults.tiempo_maximo_prestamo_minutos,
            intervalo_recordatorio_minutos: defaults.intervalo_recordatorio_minutos,
            max_recordatorios: defaults.max_recordatorios,
            notificaciones_activas: defaults.notificaciones_activas,
          }}
          bloques={[]}
          configs={[]}
          editando="__defaults__"
          onSave={handleGuardarDefaults}
          onCancel={() => setEditandoDefaults(false)}
          isPending={actualizarDefaults.isPending}
        />
      )}

      {editando && (
        <ConfigForm
          key={editando}
          initial={formInicial}
          bloques={bloques}
          configs={configs}
          editando={editando}
          onSave={handleGuardar}
          onCancel={() => setEditando(null)}
          isPending={guardar.isPending}
        />
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defaults && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">Valores por defecto</h3>
                <button
                  onClick={() => setEditandoDefaults(true)}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  title="Editar valores por defecto"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">Bloques sin configuración personalizada</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {defaults.tiempo_maximo_prestamo_minutos} min
                </span>
                <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                  <RefreshCw className="h-3 w-3 text-muted-foreground" />
                  c/ {defaults.intervalo_recordatorio_minutos} min
                </span>
                <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  {defaults.max_recordatorios} recordatorios
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${
                  defaults.notificaciones_activas
                    ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <Bell className="h-3 w-3" />
                  {defaults.notificaciones_activas ? 'Activas' : 'Inactivas'}
                </span>
              </div>
            </div>
          )}
          {configs.map((c) => (
            <div key={c.nombre_bloque} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">Bloque {c.nombre_bloque}</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => abrirEditor(c)}
                    className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleEliminar(c.nombre_bloque)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors text-muted-foreground hover:text-red-500"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {c.tiempo_maximo_prestamo_minutos} min
                </span>
                <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                  <RefreshCw className="h-3 w-3 text-muted-foreground" />
                  c/ {c.intervalo_recordatorio_minutos} min
                </span>
                <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  {c.max_recordatorios} recordatorios
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${
                  c.notificaciones_activas
                    ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <Bell className="h-3 w-3" />
                  {c.notificaciones_activas ? 'Activas' : 'Inactivas'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
