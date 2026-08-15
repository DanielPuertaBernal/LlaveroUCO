import apiClient from '@/shared/api/axios.client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const ubicacionesApi = {
  listar: ({ incluirInactivas = true } = {}) => apiClient.get('/ubicaciones', {
    params: incluirInactivas ? { incluir_inactivas: 'true' } : {},
  }),
  obtener: (clave) => apiClient.get(`/ubicaciones/${clave}`),
  crear: (data) => apiClient.post('/ubicaciones', data),
  actualizar: (id, data) => apiClient.patch(`/ubicaciones/${id}`, data),
  eliminar: (id) => apiClient.delete(`/ubicaciones/${id}`),
};

export function useUbicaciones(options = {}) {
  const { incluirInactivas = true, enabled = true } = options;
  return useQuery({
    queryKey: ['ubicaciones', { incluirInactivas }],
    enabled,
    queryFn: () => ubicacionesApi.listar({ incluirInactivas }).then((r) => r.data.data.ubicaciones),
  });
}

export function useCrearUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ubicacionesApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ubicaciones'] }),
  });
}

export function useActualizarUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => ubicacionesApi.actualizar(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ubicaciones'] }),
  });
}

export function useEliminarUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => ubicacionesApi.eliminar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ubicaciones'] }),
  });
}
