import { useState } from 'react';
import DataTable from '@/shared/components/DataTable';
import {
  useNovedades,
  useActualizarEstadoNovedad,
  useEstadisticasNovedades,
  useRegistrarNovedad,
} from './novedadesApi';
import { useTodosPendientes } from '@/features/llaves/llavesApi';
import { useAuthStore } from '@/features/auth/authStore';
import Swal from '@/shared/lib/swal';
import { AlertTriangle, CheckCircle, Clock, XCircle, PlusCircle, Trash2 } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import Button from '@/shared/components/ui/Button';
import { ROLES } from '@/shared/constants';

const CATEGORIAS = {
  sin_novedad: 'Sin novedad',
  'daño_fisico': 'Daño físico',
  no_funciona: 'No funciona',
  perdida: 'Pérdida',
  otro: 'Otro',
  demora_entrega: 'Demora en entrega de llave',
};

const ESTADOS = {
  abierta: { label: 'Abierta', variant: 'danger' },
  en_revision: { label: 'En revisión', variant: 'warning' },
  resuelta: { label: 'Resuelta', variant: 'success' },
  cerrada: { label: 'Cerrada', variant: 'default' },
};

export default function NovedadesPage() {
  const [filters, setFilters] = useState({
    tipo_recurso: '',
    estado: '',
    categoria: '',
    busqueda: '',
  });
  const [showRegistrar, setShowRegistrar] = useState(false);
  const [busquedaPrestamo, setBusquedaPrestamo] = useState('');
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);
  const [nuevaNovedad, setNuevaNovedad] = useState({ categoria: '', descripcion: '' });

  const { data: novedades = [], isLoading } = useNovedades(filters);
  const { data: stats } = useEstadisticasNovedades();
  const { data: pendientesLlaves = [] } = useTodosPendientes();
  const actualizarEstado = useActualizarEstadoNovedad();
  const registrarNovedad = useRegistrarNovedad();
  const usuario = useAuthStore((s) => s.usuario);
  const isAdmin = usuario?.rol === ROLES.ADMIN;

  const pendientesFiltrados = pendientesLlaves.filter((p) => {
    if (!busquedaPrestamo) return true;
    const q = busquedaPrestamo.toLowerCase();
    return (
      (p.nroidenti || '').toLowerCase().includes(q) ||
      (p.profesor || '').toLowerCase().includes(q) ||
      (p.aula || '').toLowerCase().includes(q)
    );
  });

  async function handleRegistrarNovedad() {
    if (!prestamoSeleccionado) return Swal.fire({ icon: 'warning', title: 'Selecciona un préstamo activo' });
    if (!nuevaNovedad.categoria) return Swal.fire({ icon: 'warning', title: 'Selecciona una categoría' });
    try {
      await registrarNovedad.mutateAsync({
        tipo_recurso: 'llave',
        salon: prestamoSeleccionado.aula,
        referencia_id: prestamoSeleccionado._id,
        categoria: nuevaNovedad.categoria,
        descripcion: nuevaNovedad.descripcion,
      });
      Swal.fire({ icon: 'success', title: 'Novedad registrada', timer: 1500, showConfirmButton: false });
      setPrestamoSeleccionado(null);
      setNuevaNovedad({ categoria: '', descripcion: '' });
      setBusquedaPrestamo('');
      setShowRegistrar(false);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo registrar' });
    }
  }

  async function handleCambiarEstado(row) {
    const { value: formValues } = await Swal.fire({
      title: 'Actualizar estado',
      html: `
        <div style="text-align:left;font-size:14px">
          <p><b>Recurso:</b> ${row.tipo_recurso} — ${row.salon || '—'}</p>
          <p><b>Categoría:</b> ${CATEGORIAS[row.categoria] || row.categoria}</p>
          <p><b>Descripción:</b> ${row.descripcion || '—'}</p>
          <hr style="margin:10px 0"/>
          <label style="display:block;font-weight:600;margin-bottom:4px">Nuevo estado</label>
          <select id="swal-estado" class="swal2-input" style="width:100%;margin:0">
            <option value="abierta" ${row.estado === 'abierta' ? 'selected' : ''}>Abierta</option>
            <option value="en_revision" ${row.estado === 'en_revision' ? 'selected' : ''}>En revisión</option>
            <option value="resuelta" ${row.estado === 'resuelta' ? 'selected' : ''}>Resuelta</option>
            <option value="cerrada" ${row.estado === 'cerrada' ? 'selected' : ''}>Cerrada</option>
          </select>
          <label style="display:block;font-weight:600;margin:10px 0 4px">Resolución (opcional)</label>
          <textarea id="swal-resolucion" class="swal2-textarea" style="width:100%;margin:0" placeholder="Notas de resolución...">${row.resolucion || ''}</textarea>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => ({
        estado: document.getElementById('swal-estado').value,
        resolucion: document.getElementById('swal-resolucion').value,
      }),
    });
    if (!formValues) return;
    try {
      await actualizarEstado.mutateAsync({ id: row._id, ...formValues });
      Swal.fire({ icon: 'success', title: 'Estado actualizado', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo actualizar' });
    }
  }

  function abrirDetalles(row) {
    Swal.fire({
      title: 'Detalle de novedad',
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.9">
          <b>Tipo recurso:</b> ${row.tipo_recurso}<br/>
          <b>Salón:</b> ${row.salon || '—'}<br/>
          <b>Categoría:</b> ${CATEGORIAS[row.categoria] || row.categoria}<br/>
          <b>Descripción:</b> ${row.descripcion || '—'}<br/>
          <b>Reportado por:</b> ${row.reportado_por_nombre} (${row.reportado_por})<br/>
          <b>Estado:</b> ${ESTADOS[row.estado]?.label || row.estado}<br/>
          ${row.resolucion ? `<b>Resolución:</b> ${row.resolucion}<br/>` : ''}
          <b>Fecha reporte:</b> ${new Date(row.fecha_reporte).toLocaleString('es-CO')}<br/>
          ${row.fecha_resolucion ? `<b>Fecha resolución:</b> ${new Date(row.fecha_resolucion).toLocaleString('es-CO')}<br/>` : ''}
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'Cerrar',
    });
  }

  const COLS = [
    {
      key: 'fecha_reporte',
      label: 'Fecha',
      render: (v) => v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—',
    },
    { key: 'tipo_recurso', label: 'Tipo', render: (v) => v === 'llave' ? 'Llave' : 'Equipo' },
    { key: 'salon', label: 'Salón' },
    { key: 'categoria', label: 'Categoría', render: (v) => CATEGORIAS[v] || v },
    { key: 'reportado_por_nombre', label: 'Reportado por' },
    {
      key: 'estado',
      label: 'Estado',
      render: (v, row) => {
        const { label, variant } = ESTADOS[v] || { label: v, variant: 'default' };
        const badge = <StatusBadge variant={variant}>{label}</StatusBadge>;
        if (isAdmin && v !== 'cerrada') {
          return (
            <button
              title="Cambiar estado"
              onClick={(e) => { e.stopPropagation(); handleCambiarEstado(row); }}
              className="cursor-pointer hover:opacity-75 transition-opacity"
            >
              {badge}
            </button>
          );
        }
        return badge;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            Novedades
          </h1>
          <p className="text-muted-foreground text-sm">Incidencias reportadas en llaves y equipos</p>
        </div>
        <Button onClick={() => setShowRegistrar((v) => !v)} variant={showRegistrar ? 'outline' : 'default'}>
          <PlusCircle className="h-4 w-4 mr-1" />
          {showRegistrar ? 'Cerrar' : 'Registrar novedad'}
        </Button>
      </div>

      {/* Sección registro manual */}
      {showRegistrar && (
        <div className="bg-card border-2 border-primary/30 rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Registrar novedad sobre préstamo de llave activo</h2>
          <FormField label="Buscar préstamo (documento, nombre, salón)">
            <Input
              value={busquedaPrestamo}
              onChange={(e) => { setBusquedaPrestamo(e.target.value); setPrestamoSeleccionado(null); }}
              placeholder="Ej: 1234567890, Prof. García, A-301"
            />
          </FormField>

          {busquedaPrestamo && (
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg">
              {pendientesFiltrados.length === 0 && (
                <p className="text-sm text-muted-foreground p-3 text-center">No hay préstamos activos con esa búsqueda</p>
              )}
              {pendientesFiltrados.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => { setPrestamoSeleccionado(p); setBusquedaPrestamo(p.profesor || p.aula || ''); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-0 ${
                    prestamoSeleccionado?._id === p._id ? 'bg-primary/10 font-semibold' : ''
                  }`}
                >
                  <span className="font-medium">{p.profesor || '—'}</span>
                  {' '}<span className="text-muted-foreground">({p.nroidenti})</span>
                  {' — '}<span>{p.aula}</span>
                </button>
              ))}
            </div>
          )}

          {prestamoSeleccionado && (
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-sm text-foreground">
                Préstamo seleccionado: <b>{prestamoSeleccionado.profesor}</b> — {prestamoSeleccionado.aula}
              </p>
              <FormField label="Categoría">
                <Select
                  value={nuevaNovedad.categoria}
                  onChange={(e) => setNuevaNovedad((n) => ({ ...n, categoria: e.target.value }))}
                >
                  <option value="">Seleccionar...</option>
                  <option value="daño_fisico">Daño físico</option>
                  <option value="no_funciona">No funciona</option>
                  <option value="perdida">Pérdida</option>
                  <option value="otro">Otro</option>
                  <option value="demora_entrega">Demora en entrega de llave</option>
                </Select>
              </FormField>
              <FormField label="Descripción (opcional)">
                <Input
                  value={nuevaNovedad.descripcion}
                  onChange={(e) => setNuevaNovedad((n) => ({ ...n, descripcion: e.target.value }))}
                  placeholder="Detalle la novedad..."
                />
              </FormField>
              <div className="flex gap-2">
                <Button onClick={handleRegistrarNovedad} disabled={registrarNovedad.isPending}>
                  {registrarNovedad.isPending ? 'Registrando...' : 'Registrar novedad'}
                </Button>
                <Button variant="outline" onClick={() => { setPrestamoSeleccionado(null); setNuevaNovedad({ categoria: '', descripcion: '' }); }}>
                  Limpiar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estadísticas */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{stats.por_estado?.abierta ?? 0}</p>
              <p className="text-sm text-muted-foreground">Abiertas</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{stats.por_estado?.en_revision ?? 0}</p>
              <p className="text-sm text-muted-foreground">En revisión</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{stats.por_estado?.resuelta ?? 0}</p>
              <p className="text-sm text-muted-foreground">Resueltas</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{stats.total ?? 0}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-4 flex gap-4 flex-wrap">
        <FormField label="Buscar">
          <Input
            placeholder="Nombre, documento, salón..."
            value={filters.busqueda}
            onChange={(e) => setFilters((f) => ({ ...f, busqueda: e.target.value }))}
          />
        </FormField>
        <FormField label="Tipo">
          <Select
            value={filters.tipo_recurso}
            onChange={(e) => setFilters((f) => ({ ...f, tipo_recurso: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="llave">Llave</option>
            <option value="equipo">Equipo</option>
          </Select>
        </FormField>
        <FormField label="Estado">
          <Select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="abierta">Abierta</option>
            <option value="en_revision">En revisión</option>
            <option value="resuelta">Resuelta</option>
            <option value="cerrada">Cerrada</option>
          </Select>
        </FormField>
        <FormField label="Categoría">
          <Select
            value={filters.categoria}
            onChange={(e) => setFilters((f) => ({ ...f, categoria: e.target.value }))}
          >
            <option value="">Todas</option>
            <option value="daño_fisico">Daño físico</option>
            <option value="no_funciona">No funciona</option>
            <option value="perdida">Pérdida</option>
            <option value="otro">Otro</option>
            <option value="demora_entrega">Demora en entrega de llave</option>
          </Select>
        </FormField>
        <div className="flex items-end">
          <button
            onClick={() => setFilters({ tipo_recurso: '', estado: '', categoria: '', busqueda: '' })}
            title="Limpiar filtros"
            className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <DataTable
        columns={COLS}
        data={novedades}
        loading={isLoading}
        searchable
        onRowClick={abrirDetalles}
      />
      <p className="text-xs text-muted-foreground text-center">
        Clic en una fila para ver detalles{isAdmin && ' · Clic en estado para gestionarlo'}
      </p>
    </div>
  );
}
