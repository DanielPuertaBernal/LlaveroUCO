import { createPortal } from 'react-dom';
import { X, Package, User } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import StatusBadge from '@/shared/components/ui/StatusBadge';

/**
 * What a person currently has on loan, opened by scanning their card or by
 * looking them up by document or name.
 *
 * The page already listed every open loan in a searchable table, but the
 * counter flow is the other way around: the person arrives, identifies
 * themselves, and the operator needs to see that person's pending equipment
 * without filtering a global table.
 */
function formatFecha(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PrestamosPersonaModal({
  persona,
  prestamos = [],
  onClose,
  onGestionarDevolucion,
}) {
  if (!persona) return null;

  const pendientesDe = (prestamo) =>
    (prestamo.equipos || []).filter((e) => e.estado_equipo === 'entregado');

  const totalPendientes = prestamos.reduce((sum, p) => sum + pendientesDe(p).length, 0);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-card border border-border rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <User className="h-3 w-3" /> Equipos en préstamo
            </p>
            <h2 className="text-lg font-bold text-foreground truncate">{persona.nombre || '—'}</h2>
            <p className="text-sm text-muted-foreground">
              Documento: {persona.numero_documento || '—'}
              {persona.id_carnet ? ` | Carnet: ${persona.id_carnet}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {prestamos.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <Package className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Esta persona no tiene equipos pendientes de devolución.
              </p>
            </div>
          )}

          {prestamos.map((prestamo) => {
            const pendientes = pendientesDe(prestamo);
            return (
              <div key={prestamo.id} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-muted/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
                      {prestamo.equipos?.length ? ` de ${prestamo.equipos.length}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatFecha(prestamo.fecha_prestamo)}</p>
                  </div>
                  <StatusBadge variant={prestamo.estado === 'parcialmente_devuelto' ? 'orange' : 'warning'}>
                    {prestamo.estado?.replace(/_/g, ' ')}
                  </StatusBadge>
                </div>

                <ul className="divide-y divide-border">
                  {pendientes.map((eq) => (
                    <li key={eq.id || eq.equipo_id} className="px-4 py-2 text-sm">
                      <span className="text-foreground">{eq.equipo_nombre || 'Equipo'}</span>
                      {eq.equipo_codigo_barras && (
                        <span className="text-muted-foreground"> — {eq.equipo_codigo_barras}</span>
                      )}
                    </li>
                  ))}
                </ul>

                {pendientes.length > 0 && onGestionarDevolucion && (
                  <div className="px-4 py-3 border-t border-border">
                    <Button className="w-full" onClick={() => onGestionarDevolucion(prestamo)}>
                      Gestionar devolución
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {totalPendientes > 0 && (
          <div className="px-5 py-3 border-t border-border text-sm text-muted-foreground">
            Total pendiente: <b className="text-foreground">{totalPendientes}</b> equipo{totalPendientes === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
