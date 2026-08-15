import { X, CalendarDays, Clock, School, Key, Pencil, Trash2 } from 'lucide-react';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import dayjs from 'dayjs';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import DataTable from '@/shared/components/DataTable';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/Sheet';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import { cn } from '@/shared/lib/utils';
import { ESTADOS } from './reservasConstants';

function puedeCancelarReserva(row) {
  if (!row || !['pendiente', 'aprobada'].includes(row.estado)) return false;
  if (!row.fecha || !row.hora_fin) return false;
  const fecha = new Date(row.fecha);
  if (Number.isNaN(fecha.getTime())) return false;
  const yyyy = String(fecha.getFullYear());
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const fechaFin = new Date(`${yyyy}-${mm}-${dd}T${row.hora_fin}:00`);
  if (Number.isNaN(fechaFin.getTime())) return false;
  return new Date() < fechaFin;
}

function _fechaFromRow(row, hora) {
  const fecha = new Date(row.fecha);
  const yyyy = String(fecha.getFullYear());
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T${hora}:00`);
}

function isEnCurso(row) {
  if (!row || !['pendiente', 'aprobada'].includes(row.estado)) return false;
  if (!row.fecha || !row.hora_inicio || !row.hora_fin) return false;
  if (Number.isNaN(new Date(row.fecha).getTime())) return false;
  const now = new Date();
  const fechaInicio = _fechaFromRow(row, row.hora_inicio);
  const fechaFin = _fechaFromRow(row, row.hora_fin);
  if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) return false;
  return now >= fechaInicio && now < fechaFin;
}

function isEditable(row) {
  if (!row || !['pendiente', 'aprobada'].includes(row.estado)) return false;
  if (!row.fecha || !row.hora_fin) return false;
  if (Number.isNaN(new Date(row.fecha).getTime())) return false;
  const fechaFin = _fechaFromRow(row, row.hora_fin);
  if (Number.isNaN(fechaFin.getTime())) return false;
  return new Date() < fechaFin;
}

export default function ReservasListaTab({
  reservas, isLoading,
  filters, setFilters,
  bloques,
  reservaDetalle, setReservaDetalle,
  handleCancelar,
  onEditar,
}) {

  const COLS = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v) => v ? new Date(v).toLocaleDateString('es-CO') : '—',
    },
    { key: 'nombre_salon', label: 'Salón' },
    {
      key: 'hora_inicio',
      label: 'Horario',
      render: (v, row) => v && row.hora_fin ? `${v} - ${row.hora_fin}` : v || '—',
    },
    { key: 'solicitante_nombre', label: 'Solicitante' },
    { key: 'motivo', label: 'Motivo', render: (v) => v || '—' },
    {
      key: 'estado',
      label: 'Estado',
      render: (v, row) => {
        if (isEnCurso(row) && row.llave_entregada) return <StatusBadge variant="info">En curso</StatusBadge>;
        const { label, variant } = ESTADOS[v] || { label: v, variant: 'default' };
        return <StatusBadge variant={variant}>{label}</StatusBadge>;
      },
    },
    {
      key: '_acciones',
      label: 'Acciones',
      render: (_, row) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {isEditable(row) && (
            <button
              onClick={() => onEditar(row)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-400 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30 transition-colors"
            >
              <Pencil className="h-3 w-3" />Editar
            </button>
          )}
          {puedeCancelarReserva(row) && (
            <button
              onClick={() => handleCancelar(row)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
            >
              <X className="h-3 w-3" />Cancelar
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-4 flex gap-4 flex-wrap">
        <FormField label="Bloque">
          <Select
            value={filters.nombre_bloque}
            onChange={(e) => setFilters((f) => ({ ...f, nombre_bloque: e.target.value }))}
          >
            <option value="">Todos</option>
            {bloques.map((b) => (
              <option key={b.nombre_bloque} value={b.nombre_bloque}>{b.nombre_bloque}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Estado">
          <Select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobada">Aprobada</option>
            <option value="rechazada">Rechazada</option>
            <option value="cancelada">Cancelada</option>
            <option value="completada">Cerrada</option>
            <option value="no_reclamada">No reclamada</option>
          </Select>
        </FormField>
        <FormField label="Fecha">
          <MobileDatePicker
            value={filters.fecha ? dayjs(filters.fecha) : null}
            onChange={(v) => setFilters((f) => ({ ...f, fecha: v ? v.format('YYYY-MM-DD') : '' }))}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </FormField>
        <div className="flex items-end">
          <button
            onClick={() => setFilters({ estado: '', nombre_bloque: '', fecha: '' })}
            title="Limpiar filtros"
            className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <DataTable
        columns={COLS}
        data={reservas}
        loading={isLoading}
        searchable
        exportable
        exportFileName="reservas"
        onRowDoubleClick={(row) => setReservaDetalle(row)}
      />

      <Sheet open={!!reservaDetalle} onOpenChange={(open) => { if (!open) setReservaDetalle(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {reservaDetalle && (() => {
            const { label, variant } = ESTADOS[reservaDetalle.estado] || { label: reservaDetalle.estado, variant: 'default' };
            const fecha = reservaDetalle.fecha
              ? new Date(reservaDetalle.fecha).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : '—';
            const creado = reservaDetalle.createdAt ? new Date(reservaDetalle.createdAt).toLocaleString('es-CO') : '—';
            return (
              <>
                <SheetHeader className="mb-6">
                  <SheetTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    Detalle de reserva
                  </SheetTitle>
                </SheetHeader>

                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Estado</span>
                    <StatusBadge variant={variant}>{label}</StatusBadge>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Espacio</p>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <School className="h-4 w-4 text-primary shrink-0" />
                      {reservaDetalle.nombre_salon || '—'}
                    </p>
                    <p className="text-sm text-muted-foreground">Bloque {reservaDetalle.nombre_bloque || '—'}</p>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Fecha y horario</p>
                    <p className="font-medium text-foreground capitalize">{fecha}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {reservaDetalle.hora_inicio} – {reservaDetalle.hora_fin}
                    </p>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Solicitante</p>
                    <p className="font-medium text-foreground">{reservaDetalle.solicitante_nombre || '—'}</p>
                    <p className="text-sm text-muted-foreground">Doc: {reservaDetalle.solicitante_documento || '—'}</p>
                    {reservaDetalle.tipo_solicitante && (
                      <p className="text-sm text-muted-foreground capitalize">Tipo: {reservaDetalle.tipo_solicitante}</p>
                    )}
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5" /> Llave
                    </p>
                    <p className="text-sm text-foreground">
                      {reservaDetalle.entregar_llave === false ? 'Reclama la llave después' : 'Entrega inmediata al reservar'}
                    </p>
                    <p className={cn('text-sm font-medium', reservaDetalle.llave_entregada ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                      {reservaDetalle.llave_entregada ? '✓ Llave entregada' : 'Llave no entregada aún'}
                    </p>
                  </div>

                  {reservaDetalle.motivo && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Motivo</p>
                      <p className="text-sm text-foreground">{reservaDetalle.motivo}</p>
                    </div>
                  )}

                  {(reservaDetalle.responsable_nombre || reservaDetalle.responsable_documento) && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Responsable</p>
                      <p className="text-sm text-foreground">{reservaDetalle.responsable_nombre || '—'}</p>
                      <p className="text-sm text-muted-foreground">Doc: {reservaDetalle.responsable_documento || '—'}</p>
                    </div>
                  )}

                  {(reservaDetalle.aprobado_por || reservaDetalle.creado_por_rol) && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Gestión</p>
                      {reservaDetalle.aprobado_por && <p className="text-sm text-foreground">Aprobado/rechazado por: {reservaDetalle.aprobado_por}</p>}
                      {reservaDetalle.creado_por_rol && <p className="text-sm text-muted-foreground">Creado por rol: {reservaDetalle.creado_por_rol}</p>}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-right">Registrada: {creado}</p>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

    </>
  );
}
