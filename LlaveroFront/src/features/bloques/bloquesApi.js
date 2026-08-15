import apiClient from '@/shared/api/axios.client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const bloquesApi = {
  listar: () => apiClient.get('/bloques'),
  crear: (data) => apiClient.post('/bloques', data),
  actualizar: (id, data) => apiClient.patch(`/bloques/${id}`, data),
  eliminar: (id) => apiClient.delete(`/bloques/${id}`),
};

export function useBloques() {
  return useQuery({
    queryKey: ['bloques'],
    queryFn: () => bloquesApi.listar().then((r) => r.data.data.bloques),
  });
}

export function useCrearBloque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bloquesApi.crear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bloques'] });
      qc.invalidateQueries({ queryKey: ['salones'] });
    },
  });
}

export function useActualizarBloque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => bloquesApi.actualizar(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bloques'] });
      qc.invalidateQueries({ queryKey: ['salones'] });
    },
  });
}

export function useEliminarBloque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => bloquesApi.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bloques'] });
      qc.invalidateQueries({ queryKey: ['salones'] });
    },
  });
}
