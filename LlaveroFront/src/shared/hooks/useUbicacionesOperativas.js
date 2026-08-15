import { useMemo } from 'react';
import { useUbicaciones } from '@/features/ubicaciones/ubicacionesApi';
import { UBICACIONES, UBICACIONES_LABEL } from '@/shared/constants';

export function useUbicacionesOperativas() {
  const query = useUbicaciones({ incluirInactivas: false });
  const ubicaciones = query.data || [];

  const labelMap = useMemo(() => {
    const dynamicLabels = Object.fromEntries(
      ubicaciones.map((ubicacion) => [ubicacion.clave, ubicacion.nombre])
    );
    return {
      ...UBICACIONES_LABEL,
      ...dynamicLabels,
    };
  }, [ubicaciones]);

  const prestamoLlavesOptions = useMemo(
    () => ubicaciones.filter((ubicacion) => ubicacion.permite_prestamo_llaves),
    [ubicaciones]
  );

  const devolucionLlavesOptions = useMemo(
    () => ubicaciones.filter((ubicacion) => ubicacion.permite_devolucion_llaves),
    [ubicaciones]
  );

  const prestamoEquiposOptions = useMemo(
    () => ubicaciones.filter((ubicacion) => ubicacion.permite_prestamo_equipos),
    [ubicaciones]
  );

  const identificacionOptions = useMemo(
    () => ubicaciones.filter((ubicacion) => ubicacion.permite_identificacion),
    [ubicaciones]
  );

  const ubicacionPrestamoLlavesDefault = prestamoLlavesOptions[0]?.clave || UBICACIONES.OFICINA;
  const ubicacionDevolucionLlavesDefault = devolucionLlavesOptions[0]?.clave || UBICACIONES.OFICINA;
  const ubicacionPrestamoEquiposDefault = prestamoEquiposOptions[0]?.clave || UBICACIONES.OFICINA;

  function getUbicacionLabel(clave) {
    if (!clave) return '—';
    return labelMap[clave] || clave;
  }

  return {
    ...query,
    ubicaciones,
    labelMap,
    getUbicacionLabel,
    prestamoLlavesOptions,
    devolucionLlavesOptions,
    prestamoEquiposOptions,
    identificacionOptions,
    ubicacionPrestamoLlavesDefault,
    ubicacionDevolucionLlavesDefault,
    ubicacionPrestamoEquiposDefault,
  };
}
