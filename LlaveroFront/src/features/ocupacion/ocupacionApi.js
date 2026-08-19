import apiClient from '@/shared/api/axios.client';
import { useQuery } from '@tanstack/react-query';

export const ocupacionApi = {
  obtener: (semestre) => apiClient.get('/programacion/ocupacion', { params: semestre ? { semestre } : {} }),
  obtenerDetalleAulaDia: (aula, dia, semestre) =>
    apiClient.get(`/programacion/ocupacion/aula/${encodeURIComponent(aula)}/dia/${encodeURIComponent(dia)}`, {
      params: semestre ? { semestre } : {},
    }),
};

export function useOcupacion(semestre) {
  return useQuery({
    queryKey: ['ocupacion', semestre || 'vigente'],
    queryFn: () => ocupacionApi.obtener(semestre).then((r) => r.data.data),
    staleTime: 60000,
  });
}

export function useDetalleAulaDia(aula, dia, semestre) {
  return useQuery({
    queryKey: ['ocupacion', 'detalle', aula, dia, semestre || 'vigente'],
    queryFn: () => ocupacionApi.obtenerDetalleAulaDia(aula, dia, semestre).then((r) => r.data.data.clases),
    enabled: !!aula && !!dia,
    staleTime: 60000,
  });
}
