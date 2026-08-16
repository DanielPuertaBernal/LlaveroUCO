import { useState } from 'react';
import DataTable from '@/shared/components/DataTable';
import {
  useNovedades,
  useActualizarEstadoNovedad,
  useEstadisticasNovedades,
  useRegistrarNovedad,
} from './novedadesApi';
import { useTodosPendientes } from '@/features/llaves/llavesApi';
import { useEquipos } from '@/features/equipos/equiposApi';
import { useSalones } from '@/features/salones/salonesApi';
import { useAuthStore } from '@/features/auth/authStore';
import Swal from '@/shared/lib/swal';
import { AlertTriangle, CheckCircle, Clock, XCircle, PlusCircle, Trash2 } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import Button from '@/shared/components/ui/Button';
import { ROLES } from '@/shared/constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/Sheet';
import { sinHTML } from '@/shared/utils/inputValidation';

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
};

// Una novedad solo puede avanzar (abierta → en_revision → resuelta), nunca
// retroceder — mismo orden que valida el backend (novedad.service.js).
const RANGO_ESTADO = { abierta: 0, en_revision: 1, resuelta: 2 };

export default function NovedadesPage() {
  const [filters, setFilters] = useState({
    tipo_recurso: '',
    estado: '',
    categoria: '',
    busqueda: '',
  });
  const [showRegistrar, setShowRegistrar] = useState(false);
  const [tipoNovedad, setTipoNovedad] = useState('general');
  const [busquedaPrestamo, setBusquedaPrestamo] = useState('');
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);
  const [busquedaEquipo, setBusquedaEquipo] = useState('');
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);
  const [salonGeneral, setSalonGeneral] = useState('');
  const [nuevaNovedad, setNuevaNovedad] = useState({ categoria: '', descripcion: '' });

  const { data: novedades = [], isLoading } = useNovedades(filters);
  const { data: stats } = useEstadisticasNovedades();
  const { data: pendientesLlaves = [] } = useTodosPendientes();
  const { data: equipos = [] } = useEquipos();
  const { data: salones = [] } = useSalones();
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

  const equiposFiltrados = equipos.filter((eq) => {
    if (!busquedaEquipo) return true;
    const q = busquedaEquipo.toLowerCase();
    return (
      (eq.nombre || '').toLowerCase().includes(q) ||
      (eq.codigo_inventario || '').toLowerCase().includes(q) ||
      (eq.marca || '').toLowerCase().includes(q)
    );
  });

  function limpiarFormularioRegistro() {
    setTipoNovedad('general');
    setBusquedaPrestamo('');
    setPrestamoSeleccionado(null);
    setBusquedaEquipo('');
    setEquipoSeleccionado(null);
    setSalonGeneral('');
    setNuevaNovedad({ categoria: '', descripcion: '' });
  }

  async function handleRegistrarNovedad() {
    if (!nuevaNovedad.categoria) return Swal.fire({ icon: 'warning', title: 'Selecciona una categoría' });
    if (!nuevaNovedad.descripcion.trim()) return Swal.fire({ icon: 'warning', title: 'La descripción es requerida' });

    const payload = { categoria: nuevaNovedad.categoria, descripcion: nuevaNovedad.descripcion };
    if (tipoNovedad === 'llave') {
      if (!prestamoSeleccionado) return Swal.fire({ icon: 'warning', title: 'Selecciona un préstamo activo' });
      payload.tipo_recurso = 'llave';
      payload.recurso_id = prestamoSeleccionado.id;
      payload.salon = prestamoSeleccionado.aula;
    } else if (tipoNovedad === 'equipo') {
      if (!equipoSeleccionado) return Swal.fire({ icon: 'warning', title: 'Selecciona un equipo' });
      payload.tipo_recurso = 'equipo';
      payload.recurso_id = equipoSeleccionado.id;
    } else {
      payload.tipo_recurso = 'general';
      payload.salon = salonGeneral;
    }

    try {
      await registrarNovedad.mutateAsync(payload);
      Swal.fire({ icon: 'success', title: 'Novedad registrada', timer: 1500, showConfirmButton: false });
      limpiarFormularioRegistro();
      setShowRegistrar(false);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo registrar' });
    }
  }

  async function handleCambiarEstado(row) {
    const rangoActual = RANGO_ESTADO[row.estado] ?? 0;
    const opcionesEstado = Object.entries(ESTADOS)
      .filter(([valor]) => RANGO_ESTADO[valor] >= rangoActual)
      .map(([valor, { label }]) => `<option value="${valor}" ${row.estado === valor ? 'selected' : ''}>${label}</option>`)
      .join('');

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
            ${opcionesEstado}
          </select>
          <p style="font-size:12px;color:#888;margin:4px 0 0">Una novedad no puede regresar a un estado anterior.</p>
          <label style="display:block;font-weight:600;margin:10px 0 4px">Resolución<span style="color:#dc2626"> *</span></label>
          <textarea id="swal-resolucion" class="swal2-textarea" style="width:100%;margin:0" placeholder="Notas de resolución...">${row.resolucion || ''}</textarea>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const estado = document.getElementById('swal-estado').value;
        const resolucion = document.getElementById('swal-resolucion').value.trim();
        if (!resolucion) {
          Swal.showValidationMessage('La resolución es obligatoria');
          return false;
        }
        return { estado, resolucion };
      },
    });
    if (!formValues) return;
    try {
      await actualizarEstado.mutateAsync({ id: row.id, ...formValues });
      Swal.fire({ icon: 'success', title: 'Estado actualizado', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo actualizar' });
    }
  }

  function abrirDetalles(row) {
    const campo = (label, valor) => `<div><b>${label}:</b> ${valor}</div>`;
    const formatoFecha = (v) => new Date(v).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    Swal.fire({
      title: 'Detalle de novedad',
      width: 640,
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.9">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">
            ${campo('Tipo recurso', row.tipo_recurso)}
            ${campo('Lugar', row.salon || '—')}
            ${campo('Categoría', CATEGORIAS[row.categoria] || row.categoria)}
            ${campo('Estado', ESTADOS[row.estado]?.label || row.estado)}
            ${campo('Reportado por', `${row.reportado_por_nombre}${row.reportado_por ? ` (${row.reportado_por})` : ''}`)}
            ${campo('Fecha reporte', formatoFecha(row.fecha_reporte))}
            ${row.en_revision_por ? campo('En revisión por', row.en_revision_por) : ''}
            ${row.en_revision_en ? campo('Fecha de revisión', formatoFecha(row.en_revision_en)) : ''}
            ${row.resuelto_por ? campo('Resuelto por', row.resuelto_por) : ''}
            ${row.fecha_resolucion ? campo('Fecha resolución', formatoFecha(row.fecha_resolucion)) : ''}
          </div>
          <div style="margin-top:10px">
            ${campo('Descripción', row.descripcion || '—')}
            ${row.resolucion ? campo('Resolución', row.resolucion) : ''}
          </div>
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
    {
      key: 'tipo_recurso',
      label: 'Tipo',
      render: (v) => (v === 'llave' ? 'Llave' : v === 'equipo' ? 'Equipo' : 'General'),
    },
    { key: 'salon', label: 'Lugar' },
    { key: 'categoria', label: 'Categoría', render: (v) => CATEGORIAS[v] || v },
    { key: 'reportado_por_nombre', label: 'Reportado por' },
    {
      key: 'estado',
      label: 'Estado',
      render: (v, row) => {
        const { label, variant } = ESTADOS[v] || { label: v, variant: 'default' };
        const badge = <StatusBadge variant={variant}>{label}</StatusBadge>;
        if (isAdmin) {
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
        <Button onClick={() => setShowRegistrar(true)}>
          <PlusCircle className="h-4 w-4 mr-1" />
          Registrar novedad
        </Button>
      </div>

      <Sheet open={showRegistrar} onOpenChange={(open) => { if (!open) setShowRegistrar(false); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Registrar novedad</SheetTitle>
          </SheetHeader>

          <FormField label="¿Sobre qué es la novedad?">
            <Select
              value={tipoNovedad}
              onChange={(e) => {
                setTipoNovedad(e.target.value);
                setPrestamoSeleccionado(null);
                setBusquedaPrestamo('');
                setEquipoSeleccionado(null);
                setBusquedaEquipo('');
                setSalonGeneral('');
              }}
            >
              <option value="general">Salón</option>
              <option value="llave">Llave prestada actualmente</option>
              <option value="equipo">Un equipo del inventario</option>
            </Select>
          </FormField>

          {tipoNovedad === 'llave' && (
            <>
              <FormField label="Buscar préstamo activo (documento, nombre, salón)">
                <Input
                  value={busquedaPrestamo}
                  onChange={(e) => { setBusquedaPrestamo(e.target.value); setPrestamoSeleccionado(null); }}
                  placeholder="Ej: 1234567890, Prof. García, A-301"
                />
              </FormField>
              {busquedaPrestamo && !prestamoSeleccionado && (
                <div className="max-h-40 overflow-y-auto border border-border rounded-lg">
                  {pendientesFiltrados.length === 0 && (
                    <p className="text-sm text-muted-foreground p-3 text-center">No hay préstamos activos con esa búsqueda</p>
                  )}
                  {pendientesFiltrados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPrestamoSeleccionado(p); setBusquedaPrestamo(p.profesor || p.aula || ''); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
                    >
                      <span className="font-medium">{p.profesor || '—'}</span>
                      {' '}<span className="text-muted-foreground">({p.nroidenti})</span>
                      {' — '}<span>{p.aula}</span>
                    </button>
                  ))}
                </div>
              )}
              {prestamoSeleccionado && (
                <p className="text-sm text-foreground">
                  Préstamo seleccionado: <b>{prestamoSeleccionado.profesor}</b> — {prestamoSeleccionado.aula}
                </p>
              )}
            </>
          )}

          {tipoNovedad === 'equipo' && (
            <>
              <FormField label="Buscar equipo (nombre, código, marca)">
                <Input
                  value={busquedaEquipo}
                  onChange={(e) => { setBusquedaEquipo(e.target.value); setEquipoSeleccionado(null); }}
                  placeholder="Ej: Videobeam, INV-045, Epson"
                />
              </FormField>
              {busquedaEquipo && !equipoSeleccionado && (
                <div className="max-h-40 overflow-y-auto border border-border rounded-lg">
                  {equiposFiltrados.length === 0 && (
                    <p className="text-sm text-muted-foreground p-3 text-center">No hay equipos con esa búsqueda</p>
                  )}
                  {equiposFiltrados.map((eq) => (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => { setEquipoSeleccionado(eq); setBusquedaEquipo(eq.nombre || ''); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
                    >
                      <span className="font-medium">{eq.nombre}</span>
                      {' '}<span className="text-muted-foreground">({eq.codigo_inventario})</span>
                    </button>
                  ))}
                </div>
              )}
              {equipoSeleccionado && (
                <p className="text-sm text-foreground">
                  Equipo seleccionado: <b>{equipoSeleccionado.nombre}</b> ({equipoSeleccionado.codigo_inventario})
                </p>
              )}
            </>
          )}

          {tipoNovedad === 'general' && (
            <FormField label="Ubicación (opcional)">
              <Input
                list="novedad-salones-list"
                value={salonGeneral}
                onChange={(e) => setSalonGeneral(e.target.value)}
                placeholder="Ej: M210, J4, Bloque J..."
              />
              <datalist id="novedad-salones-list">
                {salonGeneral.trim() &&
                  salones
                    .filter((s) => s.nombre_salon.toLowerCase().includes(salonGeneral.trim().toLowerCase()))
                    .map((s) => (
                      <option key={s.id} value={s.nombre_salon}>{s.nombre_bloque}</option>
                    ))}
              </datalist>
            </FormField>
          )}

          {(tipoNovedad === 'general' ||
            (tipoNovedad === 'llave' && prestamoSeleccionado) ||
            (tipoNovedad === 'equipo' && equipoSeleccionado)) && (
            <div className="space-y-3 pt-2 border-t border-border">
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
              <FormField label="Descripción">
                <Input
                  value={nuevaNovedad.descripcion}
                  onChange={(e) => setNuevaNovedad((n) => ({ ...n, descripcion: sinHTML(e.target.value) }))}
                  placeholder="Detalle la novedad..."
                />
              </FormField>
              <div className="flex gap-2">
                <Button onClick={handleRegistrarNovedad} disabled={registrarNovedad.isPending}>
                  {registrarNovedad.isPending ? 'Registrando...' : 'Registrar novedad'}
                </Button>
                <Button variant="outline" onClick={limpiarFormularioRegistro}>
                  Limpiar
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
            <option value="general">General</option>
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
        exportable
        exportFileName="novedades"
        onRowClick={abrirDetalles}
      />
      <p className="text-xs text-muted-foreground text-center">
        Clic en una fila para ver detalles{isAdmin && ' · Clic en estado para gestionarlo'}
      </p>
    </div>
  );
}
