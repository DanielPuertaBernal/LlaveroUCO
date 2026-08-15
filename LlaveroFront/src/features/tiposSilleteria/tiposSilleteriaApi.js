import apiClient from '@/shared/api/axios.client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const tiposSilleteriaApi = {
  listar: () => apiClient.get('/tipos-silleteria'),
  crear: (data) => apiClient.post('/tipos-silleteria', data),
  actualizar: (id, data) => apiClient.patch(`/tipos-silleteria/${id}`, data),
  eliminar: (id) => apiClient.delete(`/tipos-silleteria/${id}`),
};

export function useTiposSilleteria() {
  return useQuery({
    queryKey: ['tipos-silleteria'],
    queryFn: () => tiposSilleteriaApi.listar().then((r) => r.data.data.tipos),
  });
}

export function useCrearTipoSilleteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tiposSilleteriaApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tipos-silleteria'] }),
  });
}

export function useActualizarTipoSilleteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => tiposSilleteriaApi.actualizar(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tipos-silleteria'] }),
  });
}

export function useEliminarTipoSilleteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => tiposSilleteriaApi.eliminar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tipos-silleteria'] }),
  });
}
