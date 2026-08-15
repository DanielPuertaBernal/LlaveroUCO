import { X, User, UserCheck, MapPin, Clock, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';

function tiempoTranscurrido(fechaInicio, fechaFin = null) {
  if (!fechaInicio) return '—';
  const diff = Math.max(0, (fechaFin ? new Date(fechaFin) : Date.now()) - new Date(fechaInicio));
  const total = Math.floor(diff / 60000);
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (mins > 0 || partes.length === 0) partes.push(`${mins}min`);
  return partes.join(' ');
}

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const tipoBadgeVariant = { docente: 'info', estudiante: 'warning', empleado: 'neutral' };

export default function PrestamosDetallePanel({ prestamo, onClose, onGestionarDevolucion, getUbicacionLabel }) {
  if (!prestamo) return null;

  const puedeDevolver = prestamo.estado !== 'completamente_devuelto';

  // Fecha de última devolución (para calcular duración total en historial)
  const ultimaDevolucion = (prestamo.equipos || [])
    .map((e) => e.fecha_devolucion)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
        <h3 className="font-semibold text-foreground text-sm">Detalle del préstamo</h3>
        <button
          onClick={onClose}
          className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          title="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">

        {/* Solicitante */}
        <section className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <User className="h-3 w-3" /> Solicitante
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{prestamo.docente_nombre || '—'}</span>
            {prestamo.solicitante_tipo && (
              <StatusBadge variant={tipoBadgeVariant[prestamo.solicitante_tipo] || 'neutral'}>
                {prestamo.solicitante_tipo}
              </StatusBadge>
            )}
          </div>
          {prestamo.docente_codigo_nfc && (
            <p className="text-muted-foreground font-mono text-xs">Doc: {prestamo.docente_codigo_nfc}</p>
          )}
        </section>

        {/* Responsable — solo si existe */}
        {prestamo.docente_responsable_nombre && (
          <section className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <UserCheck className="h-3 w-3" /> Responsable
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">{prestamo.docente_responsable_nombre}</span>
              <StatusBadge variant="info">docente</StatusBadge>
            </div>
            {prestamo.docente_responsable_codigo && (
              <p className="text-muted-foreground font-mono text-xs">Doc: {prestamo.docente_responsable_codigo}</p>
            )}
          </section>
        )}

        {/* Ubicación + Auxiliar */}
        <section className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Ubicación
            </p>
            <p className="text-foreground">{(getUbicacionLabel && getUbicacionLabel(prestamo.ubicacion_prestamo)) || prestamo.ubicacion_prestamo || '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auxiliar</p>
            <p className="text-foreground">{prestamo.auxiliar_prestamista || '—'}</p>
            <p className="text-muted-foreground text-xs">Auxiliar que prestó el equipo</p>
          </div>
        </section>

        {/* Fechas + tiempo */}
        <section className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Clock className="h-3 w-3" /> Tiempo
          </p>
          <p className="text-foreground">{formatFecha(prestamo.fecha_prestamo)}</p>
          <p className="text-muted-foreground text-xs">
            {prestamo.estado === 'completamente_devuelto'
              ? `Duración total: ${tiempoTranscurrido(prestamo.fecha_prestamo, ultimaDevolucion)}`
              : `Lleva en préstamo: ${tiempoTranscurrido(prestamo.fecha_prestamo)}`}
          </p>
        </section>

        {/* Artículos */}
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Package className="h-3 w-3" /> Artículos ({prestamo.equipos?.length || 0})
          </p>
          <div className="space-y-2">
            {(prestamo.equipos || []).map((eq, i) => {
              const devuelto = eq.estado_equipo === 'devuelto';
              return (
                <div key={i} className="border border-border rounded-lg p-2.5 space-y-1 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground leading-tight">{eq.equipo_nombre}</span>
                    {devuelto
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                      : <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
                  </div>
                  {(eq.equipo_marca || eq.equipo_codigo) && (
                    <p className="text-muted-foreground">
                      {[eq.equipo_marca, eq.equipo_codigo].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <div className="text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                    <p>Entregado: {formatFecha(eq.fecha_entrega)}</p>
                    {devuelto ? (
                      <>
                        <p>Devuelto: {formatFecha(eq.fecha_devolucion)}</p>
                        <p className="text-foreground font-medium">
                          Estuvo {tiempoTranscurrido(eq.fecha_entrega, eq.fecha_devolucion)} prestado
                        </p>
                      </>
                    ) : (
                      <p className="text-amber-600 dark:text-amber-400 font-medium">
                        Lleva {tiempoTranscurrido(eq.fecha_entrega)} prestado
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Footer */}
      {puedeDevolver && onGestionarDevolucion && (
        <div className="px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onGestionarDevolucion}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Gestionar devolución
          </button>
        </div>
      )}
    </div>
  );
}
