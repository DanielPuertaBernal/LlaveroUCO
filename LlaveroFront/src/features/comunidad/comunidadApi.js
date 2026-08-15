import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const comunidadApi = {
  listar: (tipo) => apiClient.get('/comunidad', { params: tipo ? { tipo } : {} }),
  buscarPorCarnet: (idCarnet) => apiClient.get(`/comunidad/carnet/${idCarnet}`),
  buscarPorDocumento: (documento) => apiClient.get(`/comunidad/${documento}`),
  crear: (data) => apiClient.post('/comunidad', data),
  actualizar: (id, data) => apiClient.patch(`/comunidad/${id}`, data),
  eliminar: (id) => apiClient.delete(`/comunidad/${id}`),
};

export function useComunidad(tipo) {
  return useQuery({
    queryKey: ['comunidad', tipo],
    queryFn: () => comunidadApi.listar(tipo).then((r) => r.data.data.personas),
  });
}

export function useCrearPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: comunidadApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comunidad'] }),
  });
}

export function useActualizarPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => comunidadApi.actualizar(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comunidad'] }),
  });
}

export function useEliminarPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => comunidadApi.eliminar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comunidad'] }),
  });
}
