import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const reservasApi = {
  listar: (params) => apiClient.get('/reservas', { params }),
  crear: (data) => apiClient.post('/reservas', data),
  aprobar: (id) => apiClient.post(`/reservas/${id}/aprobar`),
  rechazar: (id) => apiClient.post(`/reservas/${id}/rechazar`),
  cancelar: (id) => apiClient.post(`/reservas/${id}/cancelar`),
  disponibilidad: (params) => apiClient.get('/reservas/disponibilidad', { params }),
  validar: (data) => apiClient.post('/reservas/validar', data),
  salonesDisponibles: (params) => apiClient.get('/reservas/salones-disponibles', { params }),
  editar: (id, data) => apiClient.patch(`/reservas/${id}`, data),
};

export function useReservas(params) {
  return useQuery({
    queryKey: ['reservas', params],
    queryFn: () => reservasApi.listar(params).then((r) => r.data.data),
  });
}

export function useCrearReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reservasApi.crear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas'] });
      qc.invalidateQueries({ queryKey: ['reservas', 'salones-disponibles'] });
      qc.invalidateQueries({ queryKey: ['reservas', 'disponibilidad'] });
    },
  });
}

export function useAprobarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reservasApi.aprobar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  });
}

export function useRechazarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reservasApi.rechazar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  });
}

export function useCancelarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reservasApi.cancelar,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas'] });
      qc.invalidateQueries({ queryKey: ['reservas', 'salones-disponibles'] });
      qc.invalidateQueries({ queryKey: ['reservas', 'disponibilidad'] });
    },
  });
}

export function useEditarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => reservasApi.editar(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas'] });
      qc.invalidateQueries({ queryKey: ['reservas', 'disponibilidad'] });
    },
  });
}

export function useDisponibilidad(nombre_salon, fecha) {
  return useQuery({
    queryKey: ['reservas', 'disponibilidad', nombre_salon, fecha],
    queryFn: () => reservasApi.disponibilidad({ nombre_salon, fecha }).then((r) => r.data.data),
    enabled: !!nombre_salon && !!fecha,
  });
}

export function useSalonesDisponibles(params) {
  return useQuery({
    queryKey: ['reservas', 'salones-disponibles', params],
    queryFn: () => reservasApi.salonesDisponibles(params).then((r) => r.data.data),
    enabled: !!(params?.fecha && params?.hora_inicio && params?.hora_fin),
  });
}
