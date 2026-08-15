export function getHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const SLOT_MOTIVO_STYLE = {
  programacion: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  semestral:    'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700',
  reserva:      'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700',
};

export const SLOT_MOTIVO_LABEL = { programacion: 'Clase', semestral: 'Semestral', reserva: 'Reserva' };

export const ESTADOS = {
  pendiente:   { label: 'Pendiente',     variant: 'warning' },
  aprobada:    { label: 'Aprobada',      variant: 'success' },
  rechazada:   { label: 'Rechazada',     variant: 'danger'  },
  cancelada:   { label: 'Cancelada',     variant: 'neutral' },
  completada:  { label: 'Cerrada',       variant: 'orange'  },
  no_reclamada:{ label: 'No reclamada',  variant: 'danger'  },
};

export function _fechaHoraFromRow(row, hora) {
  const fecha = new Date(row.fecha);
  const yyyy = String(fecha.getFullYear());
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T${hora}:00`);
}

export function isEnCurso(row) {
  if (!row || !['pendiente', 'aprobada'].includes(row.estado)) return false;
  if (!row.fecha || !row.hora_inicio || !row.hora_fin) return false;
  if (Number.isNaN(new Date(row.fecha).getTime())) return false;
  const now = new Date();
  const fechaInicio = _fechaHoraFromRow(row, row.hora_inicio);
  const fechaFin = _fechaHoraFromRow(row, row.hora_fin);
  if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) return false;
  return now >= fechaInicio && now < fechaFin;
}
