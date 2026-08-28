import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const elementosAfectadosApi = {
  listar: ({ incluirInactivos = false } = {}) => apiClient.get('/elementos-afectados', {
    params: { incluir_inactivos: incluirInactivos },
  }),
  crear: (data) => apiClient.post('/elementos-afectados', data),
  actualizar: (id, data) => apiClient.patch(`/elementos-afectados/${id}`, data),
  eliminar: (id) => apiClient.delete(`/elementos-afectados/${id}`),
};

export function useElementosAfectados({ incluirInactivos = false } = {}) {
  return useQuery({
    queryKey: ['elementos-afectados', { incluirInactivos }],
    queryFn: () => elementosAfectadosApi.listar({ incluirInactivos }).then((r) => r.data.data.elementos),
    // A catalog, not live data: it only changes when an admin edits it.
    staleTime: 5 * 60_000,
  });
}

export function useCrearElementoAfectado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: elementosAfectadosApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['elementos-afectados'] }),
  });
}

export function useActualizarElementoAfectado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => elementosAfectadosApi.actualizar(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['elementos-afectados'] }),
  });
}

export function useEliminarElementoAfectado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: elementosAfectadosApi.eliminar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['elementos-afectados'] }),
  });
}
