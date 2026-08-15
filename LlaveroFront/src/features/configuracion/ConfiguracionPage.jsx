import { useState } from 'react';
import {
  useConfiguraciones,
  useConfiguracionDefaults,
  useGuardarConfiguracion,
  useEliminarConfiguracion,
} from './configuracionApi';
import { useBloques } from '@/features/bloques/bloquesApi';
import Swal from '@/shared/lib/swal';
import { Settings, Save, Trash2, Plus } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { FormField, Select } from '@/shared/components/ui/FormField';

const OPCIONES_TIEMPO_PRESTAMO = [30, 45, 60, 90, 120, 150, 180, 240];
const OPCIONES_INTERVALO = [10, 15, 20, 30, 45, 60];
const OPCIONES_MAX_RECORDATORIOS = [1, 2, 3, 5, 8, 10];

export default function ConfiguracionPage() {
  const { data: configs = [], isLoading } = useConfiguraciones();
  const { data: defaults } = useConfiguracionDefaults();
  const { data: bloques = [] } = useBloques();
  const guardar = useGuardarConfiguracion();
  const eliminar = useEliminarConfiguracion();
  const [editando, setEditando] = useState(null); // nombre_bloque o '__nuevo__'
  const [form, setForm] = useState({});

  function abrirEditor(config) {
    setEditando(config?.nombre_bloque || '__nuevo__');
    setForm({
      nombre_bloque: config?.nombre_bloque || '',
      tiempo_maximo_prestamo_minutos: config?.tiempo_maximo_prestamo_minutos ?? defaults?.tiempo_maximo_prestamo_minutos ?? 120,
      intervalo_recordatorio_minutos: config?.intervalo_recordatorio_minutos ?? defaults?.intervalo_recordatorio_minutos ?? 30,
      max_recordatorios: config?.max_recordatorios ?? defaults?.max_recordatorios ?? 5,
      notificaciones_activas: config?.notificaciones_activas ?? true,
    });
  }

  async function handleGuardar() {
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Configuración de Notificaciones
          </h1>
          <p className="text-muted-foreground text-sm">Tiempos y políticas por bloque</p>
        </div>
        <Button onClick={() => abrirEditor(null)}>
          <Plus className="h-4 w-4 mr-1" />Nuevo bloque
        </Button>
      </div>

      {/* Defaults info */}
      {defaults && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="font-semibold text-sm text-muted-foreground mb-2">Valores por defecto (bloques sin configuración)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground">Tiempo máximo:</span> <strong>{defaults.tiempo_maximo_prestamo_minutos} min</strong></div>
            <div><span className="text-muted-foreground">Intervalo:</span> <strong>{defaults.intervalo_recordatorio_minutos} min</strong></div>
            <div><span className="text-muted-foreground">Máx recordatorios:</span> <strong>{defaults.max_recordatorios}</strong></div>
            <div><span className="text-muted-foreground">Activas:</span> <strong>{defaults.notificaciones_activas ? 'Sí' : 'No'}</strong></div>
          </div>
        </div>
      )}

      {/* Formulario edición */}
      {editando && (
        <div className="bg-card border-2 border-primary/30 rounded-lg p-5 space-y-4">
          <h2 className="font-semibold">{editando === '__nuevo__' ? 'Nueva configuración de bloque' : `Editando bloque: ${editando}`}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Bloque">
              <Select
                value={form.nombre_bloque}
                onChange={(e) => setForm((f) => ({ ...f, nombre_bloque: e.target.value }))}
                disabled={editando !== '__nuevo__'}
              >
                <option value="">Seleccionar bloque...</option>
                {bloques
                  .filter((b) => editando === '__nuevo__' ? !configs.some((c) => c.nombre_bloque === b.nombre_bloque) : true)
                  .map((b) => (
                    <option key={b.nombre_bloque} value={b.nombre_bloque}>{b.nombre_bloque}</option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Tiempo máximo préstamo">
              <Select
                value={form.tiempo_maximo_prestamo_minutos}
                onChange={(e) => setForm((f) => ({ ...f, tiempo_maximo_prestamo_minutos: Number(e.target.value) }))}
              >
                {OPCIONES_TIEMPO_PRESTAMO.map((v) => (
                  <option key={v} value={v}>{v} minutos</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Intervalo entre recordatorios">
              <Select
                value={form.intervalo_recordatorio_minutos}
                onChange={(e) => setForm((f) => ({ ...f, intervalo_recordatorio_minutos: Number(e.target.value) }))}
              >
                {OPCIONES_INTERVALO.map((v) => (
                  <option key={v} value={v}>{v} minutos</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Máximo de recordatorios">
              <Select
                value={form.max_recordatorios}
                onChange={(e) => setForm((f) => ({ ...f, max_recordatorios: Number(e.target.value) }))}
              >
                {OPCIONES_MAX_RECORDATORIOS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Notificaciones activas">
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={form.notificaciones_activas}
                  onChange={(e) => setForm((f) => ({ ...f, notificaciones_activas: e.target.checked }))}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm">{form.notificaciones_activas ? 'Activas' : 'Desactivadas'}</span>
              </label>
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGuardar} disabled={guardar.isPending}>
              <Save className="h-4 w-4 mr-1" />{guardar.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista de configuraciones */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Cargando...</p>
      ) : configs.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No hay configuraciones personalizadas. Se usan los valores por defecto para todos los bloques.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {configs.map((c) => (
            <div key={c.nombre_bloque} className="bg-card border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Bloque {c.nombre_bloque}</h3>
                <div className="flex gap-1">
                  <button onClick={() => abrirEditor(c)} className="p-1.5 hover:bg-muted rounded" title="Editar">
                    <Settings className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleEliminar(c.nombre_bloque)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950 rounded text-red-500" title="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Tiempo máx:</span> {c.tiempo_maximo_prestamo_minutos} min</p>
                <p><span className="text-muted-foreground">Intervalo:</span> {c.intervalo_recordatorio_minutos} min</p>
                <p><span className="text-muted-foreground">Máx recordatorios:</span> {c.max_recordatorios}</p>
                <p>
                  <span className="text-muted-foreground">Estado:</span>{' '}
                  <span className={c.notificaciones_activas ? 'text-green-600' : 'text-red-500'}>
                    {c.notificaciones_activas ? 'Activas' : 'Desactivadas'}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
