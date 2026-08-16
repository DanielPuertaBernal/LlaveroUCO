import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import DataTable from '@/shared/components/DataTable';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Textarea } from '@/shared/components/ui/FormField';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/shared/components/ui/Sheet';
import { useTodosPendientes } from './llavesApi';
import { useEnviarNotificacion } from '@/features/notificaciones/notificacionesApi';
import { useContadoresRecordatorios } from '@/features/notificaciones/notificacionesApi';
import { useConfiguraciones } from '@/features/configuracion/configuracionApi';
import { showSuccess, showError } from '@/shared/utils/alert';
import Swal from '@/shared/lib/swal';
import { Mail, Send } from 'lucide-react';

const ASUNTO_DEFAULT = 'Recordatorio de devolución de llave - Llavero';

function calcularTiempoTranscurrido(fechaEntrega, horaEntrega) {
  if (!fechaEntrega) return '—';
  const fechaCompleta = horaEntrega ? `${fechaEntrega}T${horaEntrega}` : fechaEntrega;
  const ahora = dayjs();
  const entrega = dayjs(fechaCompleta);
  const diffTotal = Math.abs(ahora.diff(entrega, 'minute'));
  const diffHoras = Math.floor(diffTotal / 60);
  const diffMinutos = diffTotal % 60;

  if (diffHoras >= 24) {
    const dias = Math.floor(diffHoras / 24);
    const horasRest = diffHoras % 24;
    return `${dias}d ${horasRest}h`;
  }
  return `${diffHoras}h ${diffMinutos}min`;
}

function esMora(estado) {
  return estado === 'en_mora' || estado === 'demora_entrega' || estado === 'Demora en entrega';
}

function encontrarConfig(aula, configs = []) {
  const bloque = (aula || '').match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '';
  return (
    configs.find(
      (c) =>
        c.nombre_bloque?.toUpperCase() === bloque ||
        c.nombre_bloque?.toUpperCase() === `BLOQUE ${bloque}`
    ) || { max_recordatorios: 5 }
  );
}

export default function NotificacionesTab() {
  const { data: pendientes = [], isLoading } = useTodosPendientes();
  const enviarMutation = useEnviarNotificacion();
  const { data: contadores = {} } = useContadoresRecordatorios();
  const { data: configs = [] } = useConfiguraciones();
  const [seleccionados, setSeleccionados] = useState({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [destinatariosSheet, setDestinatariosSheet] = useState([]);
  const [tipoMensaje, setTipoMensaje] = useState('predeterminado');
  const [asunto, setAsunto] = useState(ASUNTO_DEFAULT);
  const [mensajePersonalizado, setMensajePersonalizado] = useState('');

  const seleccionadosCount = Object.values(seleccionados).filter(Boolean).length;
  const seleccionadosList = useMemo(
    () => pendientes.filter((p) => seleccionados[p.id]),
    [pendientes, seleccionados]
  );

  const todosSeleccionados = pendientes.length > 0
    && pendientes.filter((p) => p.correo).every((p) => seleccionados[p.id]);

  function toggleSeleccion(id) {
    setSeleccionados((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleTodos() {
    if (todosSeleccionados) {
      setSeleccionados({});
    } else {
      const next = {};
      pendientes.forEach((p) => {
        if (p.correo) next[p.id] = true;
      });
      setSeleccionados(next);
    }
  }

  function abrirSheet(destinatarios) {
    setDestinatariosSheet(destinatarios);
    setAsunto(ASUNTO_DEFAULT);
    setTipoMensaje('predeterminado');
    setMensajePersonalizado('');
    setSheetOpen(true);
  }

  function onRowClick(row) {
    if (!row.correo) {
      showError('Este docente no tiene correo electrónico registrado');
      return;
    }
    abrirSheet([row]);
  }

  function onNotificarMultiples() {
    abrirSheet(seleccionadosList);
  }

  async function onEnviar() {
    const sinCorreo = destinatariosSheet.filter((p) => !p.correo);
    if (sinCorreo.length > 0) {
      showError('Algunos destinatarios seleccionados no tienen correo registrado');
      return;
    }

    if (tipoMensaje === 'personalizado' && !mensajePersonalizado.trim()) {
      showError('Escriba un mensaje personalizado o seleccione el mensaje predeterminado');
      return;
    }

    const confirm = await Swal.fire({
      title: 'Confirmar envío',
      html: `<p>Se enviarán <b>${destinatariosSheet.length}</b> notificación(es) por correo electrónico.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    const payload = {
      destinatarios: destinatariosSheet.map((p) => ({
        nombre: p.docente,
        documento: p.documento,
        correo: p.correo,
        salon: p.aula,
        fecha_prestamo: p.fechaEntrega && p.horaEntrega
          ? `${p.fechaEntrega}T${p.horaEntrega}`
          : p.fechaEntrega || '',
        tiempo_transcurrido: calcularTiempoTranscurrido(p.fechaEntrega, p.horaEntrega),
        llave_id: p.id,
      })),
      tipo_mensaje: tipoMensaje,
      mensaje_personalizado: tipoMensaje === 'personalizado' ? mensajePersonalizado : '',
      asunto,
    };

    try {
      const res = await enviarMutation.mutateAsync(payload);
      const data = res.data?.data;
      showSuccess(
        `Enviados: ${data?.enviados || 0} de ${data?.total || 0}${data?.fallidos ? ` (${data.fallidos} fallidos)` : ''}`
      );
      setSheetOpen(false);
      setSeleccionados({});
    } catch (err) {
      showError(err.response?.data?.message || 'Error al enviar notificaciones');
    }
  }

  const columns = [
    {
      key: '_seleccion',
      label: (
        <input
          type="checkbox"
          checked={todosSeleccionados}
          onChange={toggleTodos}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      ),
      render: (_, row) => (
        <input
          type="checkbox"
          checked={!!seleccionados[row.id]}
          onChange={(e) => {
            e.stopPropagation();
            toggleSeleccion(row.id);
          }}
          disabled={!row.correo}
          className="h-4 w-4 rounded border-border accent-primary disabled:opacity-40"
        />
      ),
    },
    { key: 'docente', label: 'Docente' },
    { key: 'documento', label: 'Documento' },
    {
      key: 'correo',
      label: 'Correo',
      render: (v) =>
        v ? (
          <span className="text-sm">{v}</span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="h-3 w-3" />
            Sin correo
          </span>
        ),
    },
    { key: 'aula', label: 'Salón' },
    {
      key: 'origenRegistro',
      label: 'Origen',
      render: (v) => (
        <StatusBadge variant={v === 'programacion' ? 'info' : 'neutral'}>
          {v === 'programacion' ? 'Programación' : 'Individual'}
        </StatusBadge>
      ),
    },
    { key: 'fechaEntrega', label: 'F. Préstamo' },
    {
      key: '_tiempo',
      label: 'Tiempo',
      render: (_, row) => calcularTiempoTranscurrido(row.fechaEntrega, row.horaEntrega),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (v) => (
        <StatusBadge variant={esMora(v) ? 'danger' : 'warning'}>
          {esMora(v) ? 'En mora' : 'En préstamo'}
        </StatusBadge>
      ),
    },
    {
      key: '_recordatorios',
      label: 'Recordatorios',
      render: (_, row) => {
        const count = contadores[row.id] ?? 0;
        const max = encontrarConfig(row.aula, configs).max_recordatorios ?? 5;
        const pct = max > 0 ? count / max : 0;
        const variant = pct >= 1 ? 'danger' : pct >= 0.5 ? 'warning' : 'neutral';
        return <StatusBadge variant={variant}>{count} / {max}</StatusBadge>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar — solo visible con selección múltiple */}
      {seleccionadosCount > 1 && (
        <div className="flex items-center justify-end">
          <Button onClick={onNotificarMultiples}>
            <Mail className="h-4 w-4 mr-1.5" />
            Notificar devolución ({seleccionadosCount})
          </Button>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={pendientes}
        loading={isLoading}
        searchable
        exportable
        exportFileName="notificaciones_pendientes"
        onRowClick={onRowClick}
      />

      {/* Send Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Enviar notificación de devolución</SheetTitle>
            <SheetDescription>
              Se notificará a {destinatariosSheet.length} destinatario(s) por correo electrónico.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5">
            {/* Recipients summary */}
            <div className="bg-muted/50 border border-border rounded-lg p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Destinatarios ({destinatariosSheet.length})
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {destinatariosSheet.map((p) => (
                  <div key={p.id} className="text-sm text-foreground flex justify-between">
                    <span>{p.docente}</span>
                    <span className="text-muted-foreground text-xs">{p.correo}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Message type toggle */}
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Tipo de mensaje</p>
              <div className="flex gap-2">
                {[
                  { value: 'predeterminado', label: 'Predeterminado' },
                  { value: 'personalizado', label: 'Personalizado' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTipoMensaje(opt.value)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      tipoMensaje === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <FormField label="Asunto">
              <input
                type="text"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </FormField>

            {/* Message content */}
            {tipoMensaje === 'predeterminado' ? (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Vista previa del mensaje</p>
                <div className="bg-muted/50 border border-border rounded-lg p-4 text-sm text-muted-foreground leading-relaxed">
                  <p>Estimado/a <strong>[Nombre del docente]</strong>,</p>
                  <p className="mt-2">
                    Le informamos que actualmente tiene en su poder la llave del salón
                    <strong> [Salón]</strong>, la cual fue prestada el día <strong>[Fecha]</strong>.
                  </p>
                  <p className="mt-2">
                    Le solicitamos amablemente realizar la devolución de esta llave a la mayor brevedad posible.
                    El cumplimiento oportuno de los tiempos de devolución es fundamental para garantizar
                    la disponibilidad de los espacios y facilitar su uso por parte de otros docentes y usuarios
                    de la institución.
                  </p>
                  <p className="mt-2 text-xs italic">
                    Los datos específicos de cada docente se completarán automáticamente al enviar.
                  </p>
                </div>
              </div>
            ) : (
              <FormField label="Mensaje personalizado">
                <Textarea
                  value={mensajePersonalizado}
                  onChange={(e) => setMensajePersonalizado(e.target.value)}
                  placeholder="Escriba aquí su mensaje. Los datos del préstamo se incluirán automáticamente..."
                  rows={6}
                />
              </FormField>
            )}
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onEnviar}
              disabled={enviarMutation.isPending}
            >
              {enviarMutation.isPending ? (
                'Enviando...'
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1.5" />
                  Enviar notificación
                </>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
