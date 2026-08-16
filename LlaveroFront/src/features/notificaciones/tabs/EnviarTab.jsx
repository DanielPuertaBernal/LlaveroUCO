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
import { useTodosPendientes } from '@/features/llaves/llavesApi';
import { useConfiguraciones } from '@/features/configuracion/configuracionApi';
import {
  useEnviarNotificacion,
  useEnviarNotificacionReservas,
  useReservasNoReclamadas,
  useContadoresRecordatorios,
  useDescartarNotificacionReserva,
} from '../notificacionesApi';
import { showSuccess, showError } from '@/shared/utils/alert';
import { esCorreoValido } from '@/shared/utils/inputValidation';
import Swal from '@/shared/lib/swal';
import { AlertTriangle, Mail, Send, Key, CalendarX, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const ASUNTO_LLAVE_DEFAULT = 'Recordatorio de devolucion de llave - Llavero';
const ASUNTO_RESERVA_DEFAULT = 'Reserva cerrada - Llave no reclamada - Llavero';

const TABS = { LLAVES: 'llaves', RESERVAS: 'reservas' };

function calcularTiempoTranscurrido(fechaEntrega, horario) {
  if (!fechaEntrega || !horario) return '-';
  const partes = horario.toUpperCase().split(' A ');
  if (partes.length < 2) return '-';
  const horaFin = partes[1].trim();
  const ahora = dayjs();
  const finClase = dayjs(`${fechaEntrega}T${horaFin}`);
  const diffTotal = ahora.diff(finClase, 'minute');
  if (diffTotal < 0) return 'En clase';
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

/**
 * Calcula el estado de la notificación automática para un préstamo.
 * Retorna { label, variant, title } para mostrar como badge.
 */
function estadoNotificacion(prestamo, configs = []) {
  const bloque = (prestamo.aula || '').match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '';
  const config = configs.find((c) => c.nombre_bloque?.toUpperCase() === bloque)
    || { tiempo_maximo_prestamo_minutos: 120, notificaciones_activas: true };

  if (!config.notificaciones_activas) {
    return { label: 'Desactivado', variant: 'neutral', title: 'Notificaciones desactivadas para este bloque' };
  }
  const partes = (prestamo.horario || '').toUpperCase().split(' A ');
  if (partes.length < 2) {
    return { label: 'Sin horario', variant: 'neutral', title: 'No se puede calcular: horario no disponible' };
  }
  const horaFin = partes[1].trim();
  const finClase = dayjs(`${prestamo.fechaEntrega}T${horaFin}`);
  if (!finClase.isValid()) {
    return { label: 'Sin horario', variant: 'neutral', title: 'Formato de horario inválido' };
  }
  const minutosDesdeFinClase = dayjs().diff(finClase, 'minute');
  if (minutosDesdeFinClase < 0) {
    return { label: 'En clase', variant: 'neutral', title: 'La clase aún no ha terminado' };
  }
  const minutosRestantes = config.tiempo_maximo_prestamo_minutos - minutosDesdeFinClase;
  if (minutosRestantes > 0) {
    const h = Math.floor(minutosRestantes / 60);
    const m = minutosRestantes % 60;
    const t = h > 0 ? `${h}h ${m}min` : `${m}min`;
    return { label: `Faltan ${t}`, variant: 'warning', title: `Notificación automática en aprox. ${t}` };
  }
  return { label: 'Lista para notificar', variant: 'success', title: 'El tiempo máximo ya superó — el scheduler debería haberla disparado' };
}

/** Panel lateral compartido para redactar y enviar notificaciones (llaves o reservas) */
function ComposerSheet({ open, onOpenChange, destinatarios, mode, onEnviar, isPending }) {
  const asuntoDefault = mode === 'reservas' ? ASUNTO_RESERVA_DEFAULT : ASUNTO_LLAVE_DEFAULT;
  const [tipoMensaje, setTipoMensaje] = useState('predeterminado');
  const [asunto, setAsunto] = useState(asuntoDefault);
  const [mensajePersonalizado, setMensajePersonalizado] = useState('');
  const [correosEditados, setCorreosEditados] = useState({});

  function handleOpen(val) {
    if (val) {
      setTipoMensaje('predeterminado');
      setAsunto(asuntoDefault);
      setMensajePersonalizado('');
      setCorreosEditados({});
    }
    onOpenChange(val);
  }

  async function handleEnviar() {
    if (tipoMensaje === 'personalizado' && !mensajePersonalizado.trim()) {
      showError('Escriba un mensaje personalizado o seleccione el mensaje predeterminado');
      return;
    }
    // Verificar que todos tengan correo (original o editado)
    const sinCorreo = destinatarios.filter((p) => {
      const id = p.id;
      const correoFinal = correosEditados[id] ?? (mode === 'reservas' ? p.solicitante_correo : p.correo);
      return !correoFinal || !correoFinal.trim();
    });
    if (sinCorreo.length > 0) {
      const nombres = sinCorreo.map((p) => mode === 'reservas' ? p.solicitante_nombre : p.docente).join(', ');
      showError(`Complete el correo de: ${nombres}`);
      return;
    }
    // Verificar que los correos (originales o editados) tengan un formato válido
    const correoInvalido = destinatarios.filter((p) => {
      const id = p.id;
      const correoFinal = correosEditados[id] ?? (mode === 'reservas' ? p.solicitante_correo : p.correo);
      return !esCorreoValido(correoFinal);
    });
    if (correoInvalido.length > 0) {
      const nombres = correoInvalido.map((p) => mode === 'reservas' ? p.solicitante_nombre : p.docente).join(', ');
      showError(`Correo con formato inválido: ${nombres}`);
      return;
    }
    const confirm = await Swal.fire({
      title: 'Confirmar envio',
      html: `<p>Se enviaran <b>${destinatarios.length}</b> notificacion(es) por correo electronico.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;
    await onEnviar({ tipoMensaje, asunto, mensajePersonalizado, correosEditados });
  }

  const esReservas = mode === 'reservas';

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {esReservas ? 'Notificar reservas sin reclamar' : 'Enviar notificacion de devolucion'}
          </SheetTitle>
          <SheetDescription>
            Se notificara a {destinatarios.length} destinatario(s) por correo electronico.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          {/* Destinatarios */}
          <div className="bg-muted/50 border border-border rounded-lg p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Destinatarios ({destinatarios.length})
            </p>
            <div className="max-h-44 overflow-y-auto space-y-2">
              {destinatarios.map((p, i) => {
                const id = p.id ?? i;
                const correoOriginal = esReservas ? p.solicitante_correo : p.correo;
                const nombre = esReservas ? p.solicitante_nombre : p.docente;
                const correoActual = correosEditados[id] !== undefined ? correosEditados[id] : (correoOriginal || '');
                const sinCorreo = !correoOriginal;
                return (
                  <div key={id} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground truncate flex-1">{nombre}</span>
                      {sinCorreo && (
                        <span className="text-xs text-warning flex items-center gap-0.5 shrink-0">
                          <AlertTriangle className="h-3 w-3" /> Sin correo
                        </span>
                      )}
                    </div>
                    <input
                      type="email"
                      value={correoActual}
                      onChange={(e) => setCorreosEditados((prev) => ({ ...prev, [id]: e.target.value }))}
                      placeholder="correo@ejemplo.com"
                      className={`w-full border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring ${
                        correoActual && correoActual !== correoOriginal
                          ? 'border-primary text-primary'
                          : sinCorreo && !correoActual
                          ? 'border-warning'
                          : 'border-border'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tipo de mensaje */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Tipo de mensaje</p>
            <div className="flex gap-2">
              {['predeterminado', 'personalizado'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTipoMensaje(opt)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                    tipoMensaje === opt
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Asunto */}
          <FormField label="Asunto">
            <input
              type="text"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </FormField>

          {/* Cuerpo */}
          {tipoMensaje === 'predeterminado' ? (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Vista previa</p>
              <div className="bg-muted/50 border border-border rounded-lg p-4 text-sm text-muted-foreground leading-relaxed">
                {esReservas ? (
                  <>
                    <p>Estimado/a <strong>[Nombre del solicitante]</strong>,</p>
                    <p className="mt-2">
                      Le informamos que la reserva del salon <strong>[Salon]</strong> del dia{' '}
                      <strong>[Fecha]</strong> ha vencido sin que se haya reclamado la llave correspondiente.
                    </p>
                    <p className="mt-2">
                      Si necesita el salon en otra ocasion, debe realizar una nueva reserva.
                    </p>
                  </>
                ) : (
                  <>
                    <p>Estimado/a <strong>[Nombre del docente]</strong>,</p>
                    <p className="mt-2">
                      Le informamos que actualmente tiene en su poder la llave del salon{' '}
                      <strong>[Salon]</strong>, la cual fue prestada el dia <strong>[Fecha]</strong>.
                    </p>
                    <p className="mt-2">
                      Le solicitamos amablemente realizar la devolucion a la mayor brevedad posible.
                    </p>
                  </>
                )}
                <p className="mt-2 text-xs italic">
                  Los datos especificos se completaran automaticamente al enviar.
                </p>
              </div>
            </div>
          ) : (
            <FormField label="Mensaje personalizado">
              <Textarea
                value={mensajePersonalizado}
                onChange={(e) => setMensajePersonalizado(e.target.value)}
                placeholder="Escriba su mensaje. Los datos del destinatario se incluiran automaticamente..."
                rows={6}
              />
            </FormField>
          )}
        </div>

        <SheetFooter className="flex-wrap">
          <Button variant="outline" onClick={() => handleOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleEnviar} disabled={isPending}>
            {isPending ? 'Enviando...' : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Enviar notificacion
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function EnviarTab() {
  const [tab, setTab] = useState(TABS.LLAVES);

  // ── Llaves ──
  const { data: pendientes = [], isLoading: loadingLlaves } = useTodosPendientes();
  const { mutateAsync: enviarLlaves, isPending: isPendingLlaves } = useEnviarNotificacion();
  const [seleccionadosLlaves, setSeleccionadosLlaves] = useState({});

  // ── Reservas ──
  const { data: reservasNoReclamadas = [], isLoading: loadingReservas } = useReservasNoReclamadas();
  const { mutateAsync: enviarReservas, isPending: isPendingReservas } = useEnviarNotificacionReservas();
  const { mutateAsync: descartarReserva } = useDescartarNotificacionReserva();
  const [seleccionadosReservas, setSeleccionadosReservas] = useState({});

  // ── Sheet compartido ──
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState('llaves');
  const [destinatariosSheet, setDestinatariosSheet] = useState([]);

  const isPending = sheetMode === 'llaves' ? isPendingLlaves : isPendingReservas;

  // ── Config de bloques (para indicador de estado de notificación) ──
  const { data: configs = [] } = useConfiguraciones();

  // ── Contadores de recordatorios enviados ──
  const { data: contadores = {} } = useContadoresRecordatorios();

  // ── Llaves: seleccion ──
  const selLlavesCount = useMemo(
    () => Object.values(seleccionadosLlaves).filter(Boolean).length,
    [seleccionadosLlaves]
  );
  const selLlavesList = useMemo(
    () => pendientes.filter((p) => seleccionadosLlaves[p.id]),
    [pendientes, seleccionadosLlaves]
  );
  const todosLlavesSeleccionados =
    pendientes.length > 0 && pendientes.every((p) => seleccionadosLlaves[p.id]);

  // ── Reservas: seleccion ──
  const selReservasCount = useMemo(
    () => Object.values(seleccionadosReservas).filter(Boolean).length,
    [seleccionadosReservas]
  );
  const selReservasList = useMemo(
    () => reservasNoReclamadas.filter((r) => seleccionadosReservas[r.id]),
    [reservasNoReclamadas, seleccionadosReservas]
  );

  // ── Sheet helpers ──
  function abrirSheetLlave(rows) {
    setSheetMode('llaves');
    setDestinatariosSheet(rows);
    setSheetOpen(true);
  }
  function abrirSheetReserva(rows) {
    setSheetMode('reservas');
    setDestinatariosSheet(rows);
    setSheetOpen(true);
  }

  // ── Enviar llaves ──
  async function onEnviarLlaves({ tipoMensaje, asunto, mensajePersonalizado, correosEditados = {} }) {
    try {
      const payload = {
        destinatarios: destinatariosSheet.map((p) => ({
          nombre: p.docente,
          documento: p.documento,
          correo: correosEditados[p.id] !== undefined ? correosEditados[p.id] : (p.correo || ''),
          salon: p.aula,
          fecha_prestamo: p.fechaEntrega && p.horaEntrega
            ? `${p.fechaEntrega}T${p.horaEntrega}`
            : p.fechaEntrega || '',
          tiempo_transcurrido: calcularTiempoTranscurrido(p.fechaEntrega, p.horario),
          llave_id: p.id,
        })),
        tipo_mensaje: tipoMensaje,
        mensaje_personalizado: tipoMensaje === 'personalizado' ? mensajePersonalizado : '',
        asunto,
      };
      const res = await enviarLlaves(payload);
      const data = res.data?.data;
      showSuccess(
        `Enviados: ${data?.enviados || 0} de ${data?.total || 0}${data?.fallidos ? ` (${data.fallidos} fallidos)` : ''}`
      );
      setSheetOpen(false);
      setSeleccionadosLlaves({});
    } catch (err) {
      showError(err.response?.data?.message || 'Error al enviar notificaciones');
    }
  }

  // ── Descartar notificación de reserva ──
  async function handleDescartarReserva(e, row) {
    e.stopPropagation();
    const result = await Swal.fire({
      title: 'Descartar notificación',
      html: `<p style="font-size:14px">¿Descartar la notificación de <b>${row.solicitante_nombre}</b> para el salón <b>${row.nombre_salon}</b>?<br/>No se enviará el correo.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, descartar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    try {
      await descartarReserva(row.id);
      showSuccess('Notificación descartada');
    } catch (err) {
      showError(err.response?.data?.message || 'No se pudo descartar');
    }
  }

  // ── Enviar reservas ──
  async function onEnviarReservas({ tipoMensaje, asunto, mensajePersonalizado }) {
    try {
      const payload = {
        reserva_ids: destinatariosSheet.map((r) => r.id),
        tipo_mensaje: tipoMensaje,
        mensaje_personalizado: tipoMensaje === 'personalizado' ? mensajePersonalizado : '',
        asunto,
      };
      const res = await enviarReservas(payload);
      const data = res.data?.data;
      showSuccess(
        `Enviados: ${data?.enviados || 0} de ${data?.total || 0}${data?.fallidos ? ` (${data.fallidos} fallidos)` : ''}`
      );
      setSheetOpen(false);
      setSeleccionadosReservas({});
    } catch (err) {
      showError(err.response?.data?.message || 'Error al enviar notificaciones');
    }
  }

  // ── Columnas llaves ──
  const columnasLlaves = [
    {
      key: '_sel',
      label: (
        <input
          type="checkbox"
          checked={todosLlavesSeleccionados}
          onChange={() => {
            if (todosLlavesSeleccionados) {
              setSeleccionadosLlaves({});
            } else {
              const next = {};
              pendientes.forEach((p) => { next[p.id] = true; });
              setSeleccionadosLlaves(next);
            }
          }}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      ),
      render: (_, row) => (
        <input
          type="checkbox"
          checked={!!seleccionadosLlaves[row.id]}
          onChange={(e) => { e.stopPropagation(); setSeleccionadosLlaves((prev) => ({ ...prev, [row.id]: !prev[row.id] })); }}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      ),
    },
    { key: 'docente', label: 'Docente' },
    {
      key: 'correo',
      label: 'Correo',
      render: (v) => v
        ? <span className="text-sm">{v}</span>
        : <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" />Sin correo</span>,
    },
    { key: 'aula', label: 'Salon' },
    { key: 'horario', label: 'Horario' },
    {
      key: '_tiempo',
      label: 'Tiempo',
      render: (_, row) => calcularTiempoTranscurrido(row.fechaEntrega, row.horario),
    },
    {
      key: '_recordatorios',
      label: 'Recordatorios',
      render: (_, row) => {
        const bloque = (row.aula || '').match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '';
        const config = configs.find((c) => c.nombre_bloque === bloque)
          || configs.find((c) => c.nombre_bloque === `BLOQUE ${bloque}`)
          || { max_recordatorios: null };
        const enviados = contadores[row.id] ?? 0;
        const max = config.max_recordatorios ?? '?';
        const variant = max === '?' ? 'neutral'
          : enviados >= max ? 'danger'
          : enviados > 0 ? 'warning'
          : 'neutral';
        return (
          <StatusBadge variant={variant}>
            {enviados} / {max}
          </StatusBadge>
        );
      },
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (v) => (
        <StatusBadge variant={esMora(v) ? 'danger' : 'warning'}>
          {esMora(v) ? 'En mora' : 'En prestamo'}
        </StatusBadge>
      ),
    },
    {
      key: '_estado_notif',
      label: 'Notif. auto',
      render: (_, row) => {
        const { label, variant, title } = estadoNotificacion(row, configs);
        return (
          <span title={title}>
            <StatusBadge variant={variant}>{label}</StatusBadge>
          </span>
        );
      },
    },
  ];

  // ── Columnas reservas ──
  const columnasReservas = [
    {
      key: '_sel',
      label: (
        <input
          type="checkbox"
          checked={reservasNoReclamadas.length > 0 && reservasNoReclamadas.every((r) => seleccionadosReservas[r.id])}
          onChange={() => {
            const allSel = reservasNoReclamadas.every((r) => seleccionadosReservas[r.id]);
            if (allSel) {
              setSeleccionadosReservas({});
            } else {
              const next = {};
              reservasNoReclamadas.forEach((r) => { next[r.id] = true; });
              setSeleccionadosReservas(next);
            }
          }}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      ),
      render: (_, row) => (
        <input
          type="checkbox"
          checked={!!seleccionadosReservas[row.id]}
          onChange={(e) => { e.stopPropagation(); setSeleccionadosReservas((prev) => ({ ...prev, [row.id]: !prev[row.id] })); }}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      ),
    },
    { key: 'solicitante_nombre', label: 'Solicitante' },
    { key: 'documento', label: 'Documento' },
    { key: 'nombre_salon', label: 'Salon' },
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v) => v ? new Date(v).toLocaleDateString('es-CO') : '-',
    },
    { key: 'horario', label: 'Horario' },
    {
      key: '_descartar',
      label: 'Descartar',
      render: (_, row) => (
        <button
          title="Descartar notificación"
          onClick={(e) => handleDescartarReserva(e, row)}
          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950 text-muted-foreground hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Selector de pestañas ── */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab(TABS.LLAVES)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
            tab === TABS.LLAVES
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Key className="h-4 w-4" />
          Llaves pendientes
          {pendientes.length > 0 && (
            <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
              {pendientes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab(TABS.RESERVAS)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
            tab === TABS.RESERVAS
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <CalendarX className="h-4 w-4" />
          Reservas sin reclamar
          {reservasNoReclamadas.length > 0 && (
            <span className="text-xs bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5">
              {reservasNoReclamadas.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Seccion: Prestamos de llaves ── */}
      {tab === TABS.LLAVES && (
        <section className="space-y-3">
          <div className="flex items-center justify-end flex-wrap gap-3">
            {selLlavesCount > 0 && (
              <Button onClick={() => abrirSheetLlave(selLlavesList)}>
                <Mail className="h-4 w-4 mr-1.5" />
                Notificar devolucion ({selLlavesCount})
              </Button>
            )}
          </div>

          <DataTable
            columns={columnasLlaves}
            data={pendientes}
            loading={loadingLlaves}
            searchable
            exportable
            exportFileName="llaves_pendientes"
            onRowClick={(row) => { abrirSheetLlave([row]); }}
            emptyMessage="No hay prestamos pendientes"
          />
        </section>
      )}

      {/* ── Seccion: Reservas sin reclamar ── */}
      {tab === TABS.RESERVAS && (
        <section className="space-y-3">
          <div className="flex items-center justify-end flex-wrap gap-3">
            {selReservasCount > 0 && (
              <Button onClick={() => abrirSheetReserva(selReservasList)}>
                <Mail className="h-4 w-4 mr-1.5" />
                Notificar ({selReservasCount})
              </Button>
            )}
          </div>

          <DataTable
            columns={columnasReservas}
            data={reservasNoReclamadas}
            loading={loadingReservas}
            searchable
            exportable
            exportFileName="reservas_sin_reclamar"
            onRowClick={(row) => abrirSheetReserva([row])}
            emptyMessage="No hay reservas sin reclamar"
          />
        </section>
      )}

      {/* ── Sheet compartido ── */}
      <ComposerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        destinatarios={destinatariosSheet}
        mode={sheetMode}
        onEnviar={sheetMode === 'llaves' ? onEnviarLlaves : onEnviarReservas}
        isPending={isPending}
      />
    </div>
  );
}