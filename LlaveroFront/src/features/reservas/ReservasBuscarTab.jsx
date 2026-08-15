import { useState } from 'react';
import { Loader2, Search, Sparkles, School, Users, Plus } from 'lucide-react';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import dayjs from 'dayjs';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import { cn } from '@/shared/lib/utils';


export default function ReservasBuscarTab({
  buscarForm, setBuscarForm,
  buscarParams, setBuscarParams,
  salonesLibresFiltrados, porBloque, salonesVista,
  bloqueSeleccionado, setBloqueSeleccionado,
  buscandoSalones, tiposSilleteria,
  handleReservarDesdeResultado,
}) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          ¿Qué espacio necesitas?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <FormField label="Fecha">
            <MobileDatePicker
              value={buscarForm.fecha ? dayjs(buscarForm.fecha) : null}
              onChange={(v) => setBuscarForm((f) => ({ ...f, fecha: v ? v.format('YYYY-MM-DD') : '' }))}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />
          </FormField>
          <FormField label="Hora inicio">
            <MobileTimePicker
              openTo="hours"
              ampm={false}
              value={buscarForm.hora_inicio ? dayjs(`2000-01-01T${buscarForm.hora_inicio}`) : null}
              onChange={(v) => setBuscarForm((f) => ({ ...f, hora_inicio: v ? v.format('HH:mm') : '', hora_fin: '' }))}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />
          </FormField>
          <FormField label="Hora fin">
            <MobileTimePicker
              openTo="hours"
              ampm={false}
              disabled={!buscarForm.hora_inicio}
              value={buscarForm.hora_fin ? dayjs(`2000-01-01T${buscarForm.hora_fin}`) : null}
              onChange={(v) => setBuscarForm((f) => ({ ...f, hora_fin: v ? v.format('HH:mm') : '' }))}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />
          </FormField>
          <FormField label="Tipo de silletería">
            <Select
              value={buscarForm.tipo_silleteria}
              onChange={(e) => setBuscarForm((f) => ({ ...f, tipo_silleteria: e.target.value }))}
            >
              <option value="">Cualquiera</option>
              {tiposSilleteria.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Capacidad máxima">
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              value={buscarForm.capacidad_min}
              onChange={(e) => setBuscarForm((f) => ({ ...f, capacidad_min: e.target.value }))}
              placeholder="Ej: 30"
            />
          </FormField>
        </div>
        {buscarForm.hora_inicio && buscarForm.hora_fin && buscarForm.hora_fin <= buscarForm.hora_inicio && (
          <p className="text-sm text-destructive">La hora fin debe ser posterior a la hora inicio</p>
        )}
        <Button
          onClick={() => {
            setBuscarParams({ fecha: buscarForm.fecha, hora_inicio: buscarForm.hora_inicio, hora_fin: buscarForm.hora_fin });
            setBloqueSeleccionado(null);
          }}
          disabled={!buscarForm.fecha || !buscarForm.hora_inicio || !buscarForm.hora_fin || (buscarForm.hora_fin <= buscarForm.hora_inicio) || buscandoSalones}
        >
          {buscandoSalones
            ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Buscando...</>
            : <><Search className="h-4 w-4 mr-1" />Buscar salones libres</>}
        </Button>
      </div>

      {buscarParams && !buscandoSalones && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {salonesLibresFiltrados.length === 0
              ? 'Sin salones disponibles con los criterios indicados'
              : `${salonesLibresFiltrados.length} salón${salonesLibresFiltrados.length !== 1 ? 'es' : ''} disponible${salonesLibresFiltrados.length !== 1 ? 's' : ''} — ${buscarParams.fecha}, ${buscarParams.hora_inicio}–${buscarParams.hora_fin}`}
          </p>

          {salonesLibresFiltrados.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setBloqueSeleccionado(null)}
                className={cn('px-3 py-1 text-sm rounded-full border transition-colors',
                  bloqueSeleccionado === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground')}
              >
                Todos ({salonesLibresFiltrados.length})
              </button>
              {Object.entries(porBloque).sort(([a], [b]) => a.localeCompare(b)).map(([bloque, list]) => (
                <button
                  key={bloque}
                  onClick={() => setBloqueSeleccionado(bloque)}
                  className={cn('px-3 py-1 text-sm rounded-full border transition-colors',
                    bloqueSeleccionado === bloque
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  Bloque {bloque} ({list.length})
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {salonesVista.map((salon) => (
              <div
                key={salon.nombre_salon}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <School className="h-4 w-4 text-primary shrink-0" />
                      {salon.nombre_salon}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Bloque {salon.nombre_bloque}</p>
                  </div>
                  <StatusBadge variant="success">Libre</StatusBadge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{salon.capacidad_estudiantes} estudiantes</span>
                  <span>{salon.tipo_silleteria}</span>
                </div>
                <Button size="sm" className="w-full" onClick={() => handleReservarDesdeResultado(salon)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Reservar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
