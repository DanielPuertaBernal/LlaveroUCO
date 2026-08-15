import apiClient from '@/shared/api/axios.client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const porterosApi = {
  listar: () => apiClient.get('/porteros'),
  crear: (data) => apiClient.post('/porteros', data),
  actualizarBloques: (usuarioId, bloques) =>
    apiClient.put(`/porteros/${usuarioId}/bloques`, { bloques }),
  eliminar: (usuarioId) => apiClient.delete(`/porteros/${usuarioId}`),
};

export function usePorteros() {
  return useQuery({
    queryKey: ['porteros'],
    queryFn: () => porterosApi.listar().then((r) => r.data.data.porteros),
  });
}

export function useCrearPortero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: porterosApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['porteros'] }),
  });
}

export function useActualizarBloquesPortero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ usuarioId, bloques }) => porterosApi.actualizarBloques(usuarioId, bloques),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['porteros'] }),
  });
}

export function useEliminarPortero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (usuarioId) => porterosApi.eliminar(usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['porteros'] }),
  });
}
