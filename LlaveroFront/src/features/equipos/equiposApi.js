import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const equiposApi = {
  listar: () => apiClient.get('/inventario'),
  disponibles: () => apiClient.get('/inventario/disponibles'),
  crear: (data) => apiClient.post('/inventario', data),
  actualizar: (id, data) => apiClient.patch(`/inventario/${id}`, data),
  eliminar: (id) => apiClient.delete(`/inventario/${id}`),
  buscarBarcode: (codigo) => apiClient.get(`/inventario/barcode/${codigo}`),
  buscarPorTexto: (q) => apiClient.get('/inventario/buscar', { params: { q } }),
};

export function useEquipos() {
  return useQuery({
    queryKey: ['equipos'],
    queryFn: () => equiposApi.listar().then((r) => r.data.data.equipos),
  });
}

export function useEquiposDisponibles() {
  return useQuery({
    queryKey: ['equipos', 'disponibles'],
    queryFn: () => equiposApi.disponibles().then((r) => r.data.data.equipos),
  });
}

export function useCrearEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: equiposApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipos'] }),
  });
}

export function useActualizarEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => equiposApi.actualizar(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipos'] }),
  });
}

export function useEliminarEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => equiposApi.eliminar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipos'] }),
  });
}
