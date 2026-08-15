import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const notificacionesApi = {
  enviarDevolucion: (data) => apiClient.post('/notificaciones/devolucion-llaves', data),
  enviarReservasManual: (data) => apiClient.post('/notificaciones/reservas-manual', data),
  historial: (params) => apiClient.get('/notificaciones/historial', { params }),
  estadisticas: () => apiClient.get('/notificaciones/estadisticas'),
  reenviar: (id) => apiClient.post(`/notificaciones/reenviar/${id}`),
  descartar: (id) => apiClient.post(`/notificaciones/descartar/${id}`),
  descartarPorReserva: (reservaId) => apiClient.post(`/notificaciones/descartar-por-reserva/${reservaId}`),
  contadoresRecordatorios: () => apiClient.get('/notificaciones/contadores-recordatorios'),
};

export function useEnviarNotificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificacionesApi.enviarDevolucion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useEnviarNotificacionReservas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificacionesApi.enviarReservasManual,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useReservasNoReclamadas() {
  return useQuery({
    queryKey: ['reservas', { estado: 'no_reclamada' }],
    queryFn: () =>
      apiClient.get('/reservas', { params: { estado: 'no_reclamada' } }).then((r) => {
        const d = r.data.data;
        return Array.isArray(d) ? d : (d?.reservas ?? []);
      }),
    staleTime: 30_000,
  });
}

export function useHistorialNotificaciones(params) {
  return useQuery({
    queryKey: ['notificaciones', 'historial', params],
    queryFn: () => notificacionesApi.historial(params).then((r) => r.data.data.registros),
  });
}

export function useContadoresRecordatorios() {
  return useQuery({
    queryKey: ['notificaciones', 'contadores-recordatorios'],
    queryFn: () => notificacionesApi.contadoresRecordatorios().then((r) => r.data.data),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useEstadisticasNotificaciones() {
  return useQuery({
    queryKey: ['notificaciones', 'estadisticas'],
    queryFn: () => notificacionesApi.estadisticas().then((r) => {
      const pe = r.data.data.por_estado || {};
      return {
        enviados: pe.enviado || 0,
        pendientes: pe.pendiente || 0,
        fallidos: pe.fallido || 0,
        por_tipo: r.data.data.por_tipo || {},
      };
    }),
    refetchInterval: 60_000,
  });
}

export function useReenviarNotificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificacionesApi.reenviar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useDescartarNotificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificacionesApi.descartar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useDescartarNotificacionReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificacionesApi.descartarPorReserva,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}
