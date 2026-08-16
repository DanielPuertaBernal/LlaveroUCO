import apiClient from '@/shared/api/axios.client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const porterosApi = {
  listar: () => apiClient.get('/porteros'),
  crear: (data) => apiClient.post('/porteros', data),
  actualizarBloques: (usuarioId, bloques) =>
    apiClient.put(`/porteros/${usuarioId}/bloques`, { bloques }),
  eliminar: (usuarioId) => apiClient.delete(`/porteros/${usuarioId}`),
  misBloques: () => apiClient.get('/porteros/mis-bloques'),
};

export function usePorteros() {
  return useQuery({
    queryKey: ['porteros'],
    queryFn: () => porterosApi.listar().then((r) => r.data.data.porteros),
  });
}

/**
 * Bloques asignados al usuario autenticado (solo si es portería; `[]` en
 * caso contrario, incluida una portería sin bloques asignados aún).
 */
export function useMisBloques() {
  return useQuery({
    queryKey: ['porteros', 'mis-bloques'],
    queryFn: () => porterosApi.misBloques().then((r) => r.data.data.bloques),
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
