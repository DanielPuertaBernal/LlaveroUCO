import { CalendarDays, Loader2, CreditCard, CheckCircle2, Search } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import { cn } from '@/shared/lib/utils';
import DisponibilidadAgenda from '@/shared/components/DisponibilidadAgenda';
import { soloNombre, sinHTML, soloNumerosConTope, LONGITUD_MAXIMA } from '@/shared/utils/inputValidation';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import dayjs from 'dayjs';

export default function ReservasNuevaTab({
  form, setForm,
  salones = [],
  disponibilidad,
  solicitanteEncontrado, setSolicitanteEncontrado,
  responsableEncontrado, setResponsableEncontrado,
  buscandoPersona,
  objetivoEscaneo,
  handleCrear, cerrarForm,
  buscarPersona,
  isPendingCrear,
  editando,
  handleGuardarEdicion,
  isPendingEditar,
}) {
  const editModo = editando?.modo ?? null;
  const isReadonly = editModo === 'en_curso';
  return (
    <div className="bg-card border-2 border-primary/30 rounded-xl p-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Columna izquierda: formulario ── */}
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold">
              {editModo === 'en_curso' ? 'Editando reserva en curso' : editModo === 'completo' ? 'Editando reserva' : 'Nueva reserva'}
            </h2>
            {!isReadonly && (
              <p className="text-xs text-muted-foreground">Atajo: presiona F1 para buscar por nombre cuando no tengas el documento.</p>
            )}
          </div>

          {/* Indicador de identificación */}
          {isReadonly ? (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Modo edición restringida — solo la hora de fin es modificable
            </div>
          ) : (
            <div className={cn(
              'flex items-center gap-2 text-sm px-3 py-2 rounded-lg border',
              (objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)
                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : buscandoPersona
                  ? 'bg-primary/5 border-primary/20 text-primary'
                  : 'bg-muted border-border text-muted-foreground'
            )}>
              {(objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : buscandoPersona
                  ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  : <CreditCard className="h-4 w-4 shrink-0" />}
              {buscandoPersona
                ? 'Buscando...'
                : (objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)
                  ? `${objetivoEscaneo === 'responsable' ? 'Profesor responsable' : 'Solicitante'}: ${(objetivoEscaneo === 'responsable' ? responsableEncontrado : solicitanteEncontrado)?.nombre}`
                  : `Pase el carnet por el lector o escriba el documento de ${objetivoEscaneo === 'responsable' ? 'profesor responsable' : 'solicitante'}`}
            </div>
          )}

          {/* Campos del formulario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Fecha */}
            <FormField label="Fecha" className="sm:col-span-2">
              <MobileDatePicker
                disabled={isReadonly}
                value={form.fecha ? dayjs(form.fecha) : null}
                onChange={(v) => setForm((f) => ({ ...f, fecha: v ? v.format('YYYY-MM-DD') : '' }))}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </FormField>

            {/* 2-3. Horario (hora inicio + hora fin en la misma fila) */}
            <FormField label="Hora inicio">
              <MobileTimePicker
                openTo="hours"
                ampm={false}

                disabled={isReadonly}
                value={form.hora_inicio ? dayjs(`2000-01-01T${form.hora_inicio}`) : null}
                onChange={(v) => v && setForm((f) => ({ ...f, hora_inicio: v.format('HH:mm') }))}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </FormField>
            <FormField label="Hora fin">
              <MobileTimePicker
                openTo="hours"
                ampm={false}

                value={form.hora_fin ? dayjs(`2000-01-01T${form.hora_fin}`) : null}
                onChange={(v) => v && setForm((f) => ({ ...f, hora_fin: v.format('HH:mm') }))}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </FormField>

            {/* Duración calculada */}
            {form.hora_inicio && form.hora_fin && (() => {
              const [h1, m1] = form.hora_inicio.split(':').map(Number);
              const [h2, m2] = form.hora_fin.split(':').map(Number);
              const mins = h2 * 60 + m2 - h1 * 60 - m1;
              if (mins <= 0) return (
                <p className="text-sm text-destructive self-end pb-2 sm:col-span-2 whitespace-nowrap">
                  La hora fin debe ser posterior a la hora inicio
                </p>
              );
              const hrs = Math.floor(mins / 60);
              const minRest = mins % 60;
              return (
                <p className="text-sm text-muted-foreground sm:col-span-2 whitespace-nowrap">
                  Duración: {hrs > 0 ? `${hrs}h ` : ''}{minRest > 0 ? `${minRest} min` : ''}
                </p>
              );
            })()}

            {/* 4. Documento solicitante */}
            <FormField label="Documento solicitante">
              <div className="flex gap-1">
                <Input
                  value={form.solicitante_documento}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      solicitante_documento: soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento),
                      solicitante_nombre: '',
                      tipo_solicitante: 'docente',
                      responsable_documento: '',
                      responsable_nombre: '',
                    }));
                    setSolicitanteEncontrado(null);
                    setResponsableEncontrado(null);
                  }}
                  placeholder="Escanee carnet o escriba documento"
                  maxLength={LONGITUD_MAXIMA.documento}
                  disabled={isReadonly}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPersona(form.solicitante_documento, 'solicitante'); } }}
                />
                <button
                  type="button"
                  onClick={() => buscarPersona(form.solicitante_documento, 'solicitante')}
                  disabled={buscandoPersona || isReadonly}
                  className="px-2 rounded border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50"
                  title="Buscar persona"
                >
                  {buscandoPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            {/* 5. Nombre solicitante (solo lectura) */}
            <FormField label="Nombre solicitante">
              <div className="relative">
                <Input
                  value={form.solicitante_nombre}
                  disabled
                  placeholder="Se autocompleta con el documento"
                />
                {solicitanteEncontrado && (
                  <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                )}
              </div>
            </FormField>

            {/* 6. Responsable (solo si estudiante) */}
            {form.tipo_solicitante === 'estudiante' && (
              <>
                <FormField label="Documento profesor responsable">
                  <div className="flex gap-1">
                    <Input
                      value={form.responsable_documento}
                      onChange={(e) => { setForm((f) => ({ ...f, responsable_documento: soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento) })); setResponsableEncontrado(null); }}
                      placeholder="Escanee carnet o escriba documento"
                      maxLength={LONGITUD_MAXIMA.documento}
                      disabled={isReadonly}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPersona(form.responsable_documento, 'responsable'); } }}
                    />
                    <button
                      type="button"
                      onClick={() => buscarPersona(form.responsable_documento, 'responsable')}
                      disabled={buscandoPersona || isReadonly}
                      className="px-2 rounded border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50"
                      title="Buscar profesor responsable"
                    >
                      {buscandoPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </button>
                  </div>
                </FormField>
                <FormField label="Nombre profesor responsable">
                  <div className="relative">
                    <Input
                      value={form.responsable_nombre}
                      disabled
                      placeholder="Se autocompleta con el documento"
                    />
                    {responsableEncontrado && (
                      <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                    )}
                  </div>
                </FormField>
              </>
            )}

            {/* 7. Salón (busca por nombre, el bloque se deriva solo) */}
            <FormField label="Salón" className="sm:col-span-2">
              <Input
                list="reserva-salones-list"
                value={form.nombre_salon}
                onChange={(e) => {
                  const nombre = e.target.value;
                  const salon = salones.find(
                    (s) => s.nombre_salon.toLowerCase() === nombre.toLowerCase()
                  );
                  setForm((f) => ({
                    ...f,
                    nombre_salon: nombre,
                    nombre_bloque: salon ? salon.nombre_bloque : '',
                  }));
                }}
                placeholder="Ej: M210, J4..."
                disabled={isReadonly}
              />
              <datalist id="reserva-salones-list">
                {form.nombre_salon.trim() &&
                  salones
                    .filter((s) => s.nombre_salon.toLowerCase().includes(form.nombre_salon.trim().toLowerCase()))
                    .map((s) => (
                      <option key={s.id} value={s.nombre_salon}>{s.nombre_bloque}</option>
                    ))}
              </datalist>
              {form.nombre_salon && (
                <p className="text-xs text-muted-foreground mt-1">
                  {form.nombre_bloque
                    ? `Bloque: ${form.nombre_bloque}`
                    : 'Salón no reconocido — verifica el nombre'}
                </p>
              )}
            </FormField>

            {/* 9. Motivo */}
            <FormField label="Motivo" className="sm:col-span-2">
              <Input
                value={form.motivo}
                onChange={(e) => setForm((f) => ({ ...f, motivo: sinHTML(e.target.value) }))}
                placeholder="Ej: Reunión, clase extra..."
                disabled={isReadonly}
              />
            </FormField>

            {/* 10. Entrega de llave */}
            {editModo === null && <FormField label="Entrega de llave al momento" className="sm:col-span-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, entregar_llave: !f.entregar_llave }))}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full',
                  form.entregar_llave ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-muted text-muted-foreground'
                )}
              >
                <span className={cn('w-8 h-4 rounded-full transition-colors relative shrink-0', form.entregar_llave ? 'bg-primary' : 'bg-muted-foreground/30')}>
                  <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', form.entregar_llave ? 'left-4' : 'left-0.5')} />
                </span>
                {form.entregar_llave ? 'Sí, entregar llave ahora' : 'No — reclamará la llave después'}
              </button>
            </FormField>}
          </div>

          <div className="flex gap-2 pt-2">
            {editModo !== null ? (
              <Button onClick={handleGuardarEdicion} disabled={isPendingEditar}>
                {isPendingEditar ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            ) : (
              <Button onClick={handleCrear} disabled={isPendingCrear}>
                {isPendingCrear ? 'Creando...' : 'Crear reserva'}
              </Button>
            )}
            <Button variant="outline" onClick={cerrarForm}>Cancelar</Button>
          </div>
        </div>

        {/* ── Columna derecha: grid de disponibilidad ── */}
        <div className="space-y-3">
          {!form.nombre_salon || !form.fecha ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm text-center p-8 gap-2">
              <CalendarDays className="h-8 w-8 opacity-30" />
              <p>Selecciona un <strong>salón</strong> y una <strong>fecha</strong> para ver la disponibilidad</p>
            </div>
          ) : !disponibilidad?.slots ? (
            <div className="flex items-center justify-center h-full min-h-[300px] border border-border rounded-xl">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DisponibilidadAgenda
              slots={disponibilidad.slots}
              horaInicio={form.hora_inicio}
              horaFin={form.hora_fin}
            />
          )}
        </div>

      </div>
    </div>
  );
}
