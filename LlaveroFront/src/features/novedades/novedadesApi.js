import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const novedadesApi = {
  listar: (params) => apiClient.get('/novedades', { params }),
  obtener: (id) => apiClient.get(`/novedades/${id}`),
  registrar: (data) => apiClient.post('/novedades', data),
  actualizarEstado: (id, data) => apiClient.patch(`/novedades/${id}/estado`, data),
  estadisticas: () => apiClient.get('/novedades/estadisticas'),
};

export function useNovedades(params) {
  return useQuery({
    queryKey: ['novedades', params],
    queryFn: () => novedadesApi.listar(params).then((r) => r.data.data),
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
}

export function useRegistrarNovedad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: novedadesApi.registrar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['novedades'] }),
  });
}

export function useActualizarEstadoNovedad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => novedadesApi.actualizarEstado(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['novedades'] }),
  });
}

export function useEstadisticasNovedades() {
  return useQuery({
    queryKey: ['novedades', 'estadisticas'],
    queryFn: () => novedadesApi.estadisticas().then((r) => r.data.data),
    refetchOnMount: 'always',
  });
}
