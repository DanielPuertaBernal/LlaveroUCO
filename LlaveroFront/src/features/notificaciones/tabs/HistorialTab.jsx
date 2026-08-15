import { useState } from 'react';
import DataTable from '@/shared/components/DataTable';
import {
  useHistorialNotificaciones,
  useEstadisticasNotificaciones,
  useReenviarNotificacion,
  useDescartarNotificacion,
} from '../notificacionesApi';
import Swal from '@/shared/lib/swal';
import { RefreshCw, MailCheck, MailX, Clock, Mail, Bell, CalendarX, Trash2 } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';

const TIPO_META = {
  manual: { label: 'Manual', icon: Mail, color: 'text-blue-500' },
  vencimiento_inicial: { label: 'Vencimiento inicial', icon: Bell, color: 'text-amber-500' },
  recordatorio: { label: 'Recordatorio automático', icon: RefreshCw, color: 'text-orange-500' },
  reserva_no_reclamada: { label: 'Reserva no reclamada', icon: CalendarX, color: 'text-red-500' },
  delegado_vencimiento: { label: 'Vencimiento — recogida en nombre del docente', icon: Bell, color: 'text-amber-600' },
  delegado_recordatorio: { label: 'Recordatorio — recogida en nombre del docente', icon: RefreshCw, color: 'text-orange-600' },
};

function tipoLabel(tipo) {
  return TIPO_META[tipo]?.label ?? tipo ?? '—';
}

export default function HistorialTab() {
  const [filters, setFilters] = useState({
    estado_envio: '',
    tipo_notificacion: '',
    busqueda: '',
  });
  const { data: registros = [], isLoading, refetch } = useHistorialNotificaciones(filters);
  const { data: stats } = useEstadisticasNotificaciones();
  const reenviar = useReenviarNotificacion();
  const descartar = useDescartarNotificacion();

  async function handleReenviar(row) {
    const result = await Swal.fire({
      title: 'Reenviar notificación',
      html: `<p style="font-size:14px">¿Reenviar a <b>${row.destinatario_nombre}</b> (${row.destinatario_correo})?</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, reenviar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;
    try {
      await reenviar.mutateAsync(row._id);
      Swal.fire({ icon: 'success', title: 'Reenviado', timer: 1800, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo reenviar' });
    }
  }

  async function abrirDetalles(row) {
    const esReservaNoReclamada = row.tipo_notificacion === 'reserva_no_reclamada';
    const esPendiente = row.estado_envio === 'pendiente';
    const horario = (row.reserva_hora_inicio && row.reserva_hora_fin)
      ? `${row.reserva_hora_inicio} - ${row.reserva_hora_fin}`
      : '—';

    const result = await Swal.fire({
      title: 'Detalle de notificación',
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.9">
          <b>Destinatario:</b> ${row.destinatario_nombre}<br/>
          <b>Documento:</b> ${row.destinatario_documento}<br/>
          <b>Correo:</b> ${row.destinatario_correo}<br/>
          ${row.numero_contacto_destinatario ? `<b>Contacto:</b> ${row.numero_contacto_destinatario}<br/>` : ''}
          <b>Salón:</b> ${row.salon || '—'}<br/>
          ${esReservaNoReclamada ? `<b>Fecha reserva:</b> ${row.reserva_fecha || '—'}<br/><b>Horario:</b> ${horario}<br/>` : ''}
          <b>Asunto:</b> ${row.asunto}<br/>
          <b>Tipo:</b> ${tipoLabel(row.tipo_notificacion)}<br/>
          <b>Estado:</b> ${row.estado_envio}<br/>
          ${row.error_envio ? `<b>Error:</b> ${row.error_envio}<br/>` : ''}
          ${row.numero_recordatorio ? `<b>Recordatorio #:</b> ${row.numero_recordatorio}<br/>` : ''}
          <b>Enviado por:</b> ${row.enviado_por}<br/>
          <b>Fecha:</b> ${new Date(row.fecha_envio).toLocaleString('es-CO')}
        </div>
      `,
      icon: 'info',
      ...(esReservaNoReclamada && esPendiente
        ? {
            confirmButtonText: 'Enviar ahora',
                  showDenyButton: true,
            denyButtonText: 'Descartar',
            denyButtonColor: '#dc2626',
            showCancelButton: true,
            cancelButtonText: 'Cerrar',
          }
        : {
            confirmButtonText: 'Cerrar',
                }),
    });

    if (esReservaNoReclamada && esPendiente) {
      if (result.isConfirmed) {
        await handleReenviar(row);
      } else if (result.isDenied) {
        await handleDescartar(row);
      }
    }
  }

  async function handleDescartar(row) {
    try {
      await descartar.mutateAsync(row._id);
      Swal.fire({ icon: 'success', title: 'Descartada', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo descartar' });
    }
  }

  const COLS = [
    {
      key: 'fecha_envio',
      label: 'Fecha',
      render: (v) => v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—',
    },
    { key: 'destinatario_nombre', label: 'Destinatario' },
    { key: 'destinatario_correo', label: 'Correo' },
    { key: 'salon', label: 'Salón' },
    {
      key: 'tipo_notificacion',
      label: 'Tipo',
      render: (v) => {
        const meta = TIPO_META[v];
        if (!meta) return <span className="text-muted-foreground text-xs">{v || '—'}</span>;
        const Icon = meta.icon;
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'estado_envio',
      label: 'Estado',
      render: (v, row) => {
        const badge = (
          <StatusBadge variant={v === 'enviado' ? 'success' : v === 'pendiente' ? 'warning' : v === 'descartado' ? 'default' : 'danger'}>
            {v === 'enviado' ? 'Enviado' : v === 'pendiente' ? 'Pendiente' : v === 'descartado' ? 'Descartado' : 'Fallido'}
          </StatusBadge>
        );
        if ((v === 'fallido' || v === 'pendiente') && row.tipo_notificacion !== 'reserva_no_reclamada') {
          return (
            <button
              title="Reenviar"
              onClick={(e) => { e.stopPropagation(); handleReenviar(row); }}
              className="cursor-pointer hover:opacity-75 transition-opacity"
            >
              {badge}
            </button>
          );
        }
        return badge;
      },
    },
    { key: 'enviado_por', label: 'Enviado por' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-muted-foreground text-sm">{registros.length} registros</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />Actualizar
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
              <MailCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.enviados ?? 0}</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.pendientes ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-950 rounded-lg">
              <MailX className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.fallidos ?? 0}</p>
              <p className="text-xs text-muted-foreground">Fallidos</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 flex gap-4 flex-wrap items-end">
        <FormField label="Buscar">
          <Input
            placeholder="Nombre, documento o correo"
            value={filters.busqueda}
            onChange={(e) => setFilters((f) => ({ ...f, busqueda: e.target.value }))}
          />
        </FormField>
        <FormField label="Estado">
          <Select
            value={filters.estado_envio}
            onChange={(e) => setFilters((f) => ({ ...f, estado_envio: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="enviado">Enviado</option>
            <option value="pendiente">Pendiente</option>
            <option value="fallido">Fallido</option>
            <option value="descartado">Descartado</option>
          </Select>
        </FormField>
        <FormField label="Tipo">
          <Select
            value={filters.tipo_notificacion}
            onChange={(e) => setFilters((f) => ({ ...f, tipo_notificacion: e.target.value }))}
          >
            <option value="">Todos los tipos</option>
            <option value="manual">Manual</option>
            <option value="vencimiento_inicial">Vencimiento inicial</option>
            <option value="recordatorio">Recordatorio automático</option>
            <option value="reserva_no_reclamada">Reserva no reclamada</option>
            <option value="delegado_vencimiento">Vencimiento — recogida en nombre del docente</option>
            <option value="delegado_recordatorio">Recordatorio — recogida en nombre del docente</option>
          </Select>
        </FormField>
        {(filters.busqueda || filters.estado_envio || filters.tipo_notificacion) && (
          <div className="flex items-end pb-0.5">
            <button
              onClick={() => setFilters({ estado_envio: '', tipo_notificacion: '', busqueda: '' })}
              title="Limpiar filtros"
              className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <DataTable
        columns={COLS}
        data={registros}
        loading={isLoading}
        searchable
        onRowClick={abrirDetalles}
      />
      <p className="text-xs text-muted-foreground text-center">
        Clic en una fila para ver detalles · Clic en badge de estado fallido/pendiente para reenviar
      </p>
    </div>
  );
}
