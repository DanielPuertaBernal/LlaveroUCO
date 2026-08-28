/**
 * Resolves the point of service shown for a key/equipment record.
 *
 * The `ubicacion_*` snapshot stopped being meaningful in migration 009: the
 * portería authorization gate moved to `portero_bloques` and every write path
 * now falls back to `UBICACIONES.OFICINA`, so the stored location reads
 * "Oficina Centro de Servicios Docentes" no matter who processed the record.
 * The user who managed the operation (`gestionado_por_usuario_id`, added by
 * that same migration) is the reliable signal, so it takes precedence and the
 * legacy location is only used when there is no managing user — historical
 * rows written before 009.
 */
export function getPuntoAtencion(row, ubicacionClave, getUbicacionLabel) {
  const gestor = row?.gestionadoPorNombre || row?.gestionado_por_nombre;
  if (gestor) return gestor;

  const label = getUbicacionLabel?.(ubicacionClave);
  return label || '—';
}

/**
 * Same resolution for the return leg. Keys and equipment store the returning
 * user separately from the delivering one, so the two legs never collapse into
 * a single name (see migration 022 for keys; equipment already had its own
 * `devoluciones` table).
 */
export function getPuntoAtencionDevolucion(row, ubicacionClave, getUbicacionLabel) {
  const gestor = row?.gestionadoPorDevolucionNombre || row?.gestionado_por_devolucion_nombre;
  if (gestor) return gestor;

  const label = getUbicacionLabel?.(ubicacionClave);
  return label || '—';
}
