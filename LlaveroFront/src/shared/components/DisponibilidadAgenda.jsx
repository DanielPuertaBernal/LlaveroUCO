import { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const SLOT_MOTIVO_LABEL = { programacion: 'Clase', semestral: 'Semestral', reserva: 'Reserva' };

/**
 * Agenda visual de disponibilidad de un salón para una fecha.
 *
 * Props:
 *   slots        — array de slots de useDisponibilidad (puede ser undefined → null render)
 *   horaInicio   — "HH:MM" inicio del rango seleccionado (para highlight)
 *   horaFin      — "HH:MM" fin del rango seleccionado (para highlight)
 *   onSlotClick  — callback(slot, blockEndHora) al hacer clic en un bloque libre
 *   maxHeight    — CSS string para el alto scrollable del grid
 */
export default function DisponibilidadAgenda({
  slots,
  horaInicio,
  horaFin,
  onSlotClick,
  maxHeight = 'calc(100vh - 22rem)',
}) {
  const [slotDetalle, setSlotDetalle] = useState(null);

  if (!slots) return null;

  const isSlotInRange = (slotHora) => {
    if (!horaInicio) return false;
    if (horaFin) return slotHora >= horaInicio && slotHora < horaFin;
    return slotHora === horaInicio;
  };

  const add30 = (hora) => {
    const [h, m] = hora.split(':').map(Number);
    const total = h * 60 + m + 30;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Construye bloques fusionando slots consecutivos con igual clave
  const buildBlocks = (slotList, keyFn) => {
    const blocks = [];
    let cur = null;
    for (const s of slotList) {
      const key = keyFn(s);
      if (cur && cur._key === key && cur.endHora === s.hora) {
        cur.endHora = add30(s.hora);
      } else {
        if (cur) { const { _key, ...rest } = cur; blocks.push(rest); }
        cur = { _key: key, startHora: s.hora, endHora: add30(s.hora), ...s._extra };
      }
    }
    if (cur) { const { _key, ...rest } = cur; blocks.push(rest); }
    return blocks;
  };

  const HORAS = [];
  for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) HORAS.push(`${String(h).padStart(2, '0')}:${m}`);
  const slotMap = Object.fromEntries(HORAS.map((hora) => [hora, slots.find((s) => s.hora === hora) ?? { hora, disponible: true }]));

  // Bloques libres: solo slots disponibles
  const libreBlocks = buildBlocks(
    HORAS.filter((h) => slotMap[h].disponible).map((h) => ({ hora: h, _extra: { disponible: true, motivo: null, detalle: '' } })),
    (s) => 'libre'
  );

  // Bloques de clase/semestral
  const claseSlots = HORAS.filter((h) => ['programacion', 'semestral'].includes(slotMap[h].motivo));
  const claseBlocks = buildBlocks(
    claseSlots.map((h) => { const s = slotMap[h]; return { hora: h, _extra: { disponible: false, motivo: s.motivo, detalle: s.detalle ?? '' } }; }),
    (s) => { const sl = slotMap[s.hora]; return `${sl.motivo}||${sl.detalle ?? ''}`; }
  );

  // Bloques de reserva: slots con motivo=reserva O con reserva_solapada=true
  const reservaSlots = HORAS.filter((h) => slotMap[h].motivo === 'reserva' || slotMap[h].reserva_solapada);
  const reservaBlocks = buildBlocks(
    reservaSlots.map((h) => {
      const s = slotMap[h];
      const det = s.motivo === 'reserva' ? (s.detalle ?? '') : (s.reserva_detalle ?? '');
      return { hora: h, _extra: { disponible: false, motivo: 'reserva', detalle: det } };
    }),
    (s) => { const sl = slotMap[s.hora]; return sl.motivo === 'reserva' ? `reserva||${sl.detalle ?? ''}` : `reserva||${sl.reserva_detalle ?? ''}`; }
  );

  // Lista final: libre + reserva + clase, ordenados por startHora (empate: reserva antes que clase)
  const ORDER = { libre: 0, reserva: 1, programacion: 2, semestral: 3 };
  const agendaBlocks = [
    ...libreBlocks.map((b) => ({ ...b, _type: 'libre' })),
    ...reservaBlocks.map((b) => ({ ...b, _type: 'reserva' })),
    ...claseBlocks.map((b) => ({ ...b, _type: b.motivo })),
  ].sort((a, b) => a.startHora < b.startHora ? -1 : a.startHora > b.startHora ? 1 : ORDER[a._type] - ORDER[b._type]);

  return (
    <>
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">
          Agenda de disponibilidad — clic en un slot libre para pre-rellenar el horario
        </p>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="divide-y divide-border overflow-y-auto" style={{ maxHeight }}>
            {agendaBlocks.map((block) => {
              const { startHora, endHora, disponible, motivo, detalle, _type } = block;
              const motivoLabel = !disponible ? (SLOT_MOTIVO_LABEL[motivo] ?? 'Ocupado') : '';
              const badgeStyle = motivo === 'programacion'
                ? 'bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100'
                : motivo === 'semestral'
                  ? 'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100'
                  : 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100';
              const selected = isSlotInRange(startHora);
              const accentBorder = selected ? 'border-l-primary'
                : !disponible
                  ? motivo === 'programacion' ? 'border-l-blue-500'
                    : motivo === 'semestral' ? 'border-l-violet-500'
                    : 'border-l-amber-500'
                  : 'border-l-transparent';
              const rowBg = selected ? 'bg-primary/10'
                : !disponible
                  ? motivo === 'programacion' ? 'bg-blue-50 dark:bg-blue-950/30'
                    : motivo === 'semestral' ? 'bg-violet-50 dark:bg-violet-950/30'
                    : 'bg-amber-50 dark:bg-amber-950/30'
                  : '';
              const dotColor = selected ? 'bg-primary'
                : disponible ? 'bg-green-400'
                  : motivo === 'programacion' ? 'bg-blue-500'
                    : motivo === 'semestral' ? 'bg-violet-500'
                    : 'bg-amber-500';
              const syntheticSlot = { hora: startHora, disponible, motivo, detalle };
              return (
                <button
                  key={`${_type}-${startHora}-${endHora}`}
                  onClick={() => disponible && onSlotClick && onSlotClick(syntheticSlot, endHora)}
                  onDoubleClick={() => !disponible && setSlotDetalle({ startHora, endHora, motivoLabel, motivo, detalle })}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-4',
                    accentBorder, rowBg,
                    disponible && !selected ? 'hover:bg-muted/50 cursor-pointer' : '',
                    !disponible ? 'cursor-pointer' : ''
                  )}
                >
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', dotColor)} />
                  <span className="font-mono text-sm font-semibold w-32 shrink-0 text-foreground">
                    {startHora} a {endHora}
                  </span>
                  <span className="text-muted-foreground/40 text-xs select-none shrink-0">│</span>
                  {disponible ? (
                    <span className="text-xs text-muted-foreground">
                      {selected ? 'Seleccionado' : 'Disponible'}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs truncate flex-1 text-foreground">{detalle || motivoLabel}</span>
                      <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', badgeStyle)}>
                        {motivoLabel}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-card border border-border inline-block" /> Disponible</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block" /> Seleccionado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/40 border border-blue-300 inline-block" /> Clase</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-100 dark:bg-violet-900/40 border border-violet-300 inline-block" /> Semestral</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-300 inline-block" /> Reserva</span>
      </div>

      {slotDetalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSlotDetalle(null)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Detalle del horario</h3>
              <button
                onClick={() => setSlotDetalle(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-mono font-semibold text-foreground">
                  {slotDetalle.startHora} — {slotDetalle.endHora}
                </span>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Tipo</p>
                <span className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full inline-block',
                  slotDetalle.motivo === 'programacion' ? 'bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100'
                    : slotDetalle.motivo === 'semestral' ? 'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100'
                    : 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100'
                )}>
                  {slotDetalle.motivoLabel}
                </span>
              </div>

              {slotDetalle.detalle && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Detalle</p>
                  <p className="text-sm text-foreground">{slotDetalle.detalle}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSlotDetalle(null)}
              className="w-full text-sm text-center text-muted-foreground hover:text-foreground transition-colors pt-1"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
