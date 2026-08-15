import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const llavesApi = {
  pendientes: () => apiClient.get('/llaves/pendientes'),
  todosPendientes: () => apiClient.get('/llaves/pendientes/todos'),
  hoy: () => apiClient.get('/llaves/dia'),
  historial: (params) => apiClient.get('/llaves/historial', { params }),
  entregar: (data) => apiClient.post('/llaves/entregar', data),
  devolver: (payload) => {
    const documento = typeof payload === 'string' ? payload : payload.documento;
    const body = typeof payload === 'string' ? {} : { ubicacion: payload.ubicacion };
    if (payload.novedad) body.novedad = payload.novedad;
    return apiClient.post(`/llaves/devolver/${documento}`, body);
  },
  procesarNFC: (payload) => {
    if (typeof payload === 'string') {
      return apiClient.post('/llaves/procesar-nfc', { id_carnet: payload });
    }
    return apiClient.post('/llaves/procesar-nfc', payload);
  },
  confirmarAnticipado: (data) => apiClient.post('/llaves/confirmar-anticipado', data),
  devolverPorId: (id, ubicacion) => apiClient.post(`/llaves/devolver-registro/${id}`, { ubicacion }),
  exportarHistorial: (params) =>
    apiClient.get('/llaves/historial/exportar', { params, responseType: 'blob' }),
};

export function useLlavesPendientes() {
  return useQuery({
    queryKey: ['llaves', 'pendientes'],
    queryFn: () => llavesApi.pendientes().then((r) => r.data.data.llaves),
    refetchInterval: 30000,
  });
}

export function useTodosPendientes() {
  return useQuery({
    queryKey: ['llaves', 'pendientes', 'todos'],
    queryFn: () => llavesApi.todosPendientes().then((r) => r.data.data.llaves),
    refetchInterval: 30000,
  });
}

export function useLlavesHoy() {
  return useQuery({
    queryKey: ['llaves', 'hoy'],
    queryFn: () => llavesApi.hoy().then((r) => r.data.data.llaves),
    refetchInterval: 30000,
  });
}

export function useHistorialLlaves(params) {
  return useQuery({
    queryKey: ['llaves', 'historial', params],
    queryFn: () => llavesApi.historial(params).then((r) => r.data.data.registros),
  });
}

export function useEntregarLlave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: llavesApi.entregar,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llaves'] });
      qc.invalidateQueries({ queryKey: ['programacion'] });
    },
  });
}

export function useDevolverLlave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: llavesApi.devolver,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llaves'] });
      qc.invalidateQueries({ queryKey: ['novedades'] });
    },
  });
}
