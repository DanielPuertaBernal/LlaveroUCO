import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const llavesApi = {
  pendientes: () => apiClient.get('/llaves/pendientes'),
  todosPendientes: () => apiClient.get('/llaves/pendientes/todos'),
  hoy: () => apiClient.get('/llaves/dia'),
  clasesProcesadasHoy: () => apiClient.get('/llaves/clases-hoy'),
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

/** Pares {documento, aula} que ya tienen una llave registrada hoy (entregada o devuelta) — usado para no ofrecer "Entregar" dos veces. */
export function useClasesProcesadasHoy() {
  return useQuery({
    queryKey: ['llaves', 'clases-hoy'],
    queryFn: () => llavesApi.clasesProcesadasHoy().then((r) => r.data.data.clases),
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

/**
 * Procesa una lectura de carnet NFC/manual: el backend decide si es entrega
 * o devolución (o responde con un `tipo` de resultado distinto — selección
 * múltiple, sin clase, anticipado, error). Ver `llave.workflows.js` en el
 * backend para el contrato completo de `data.tipo`.
 */
export function useProcesarNFC() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: llavesApi.procesarNFC,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llaves'] });
      qc.invalidateQueries({ queryKey: ['programacion'] });
      // Una entrega/devolución por NFC puede corresponder a una reserva
      // individual (llave_entregada/estado en la tabla `reservas`) — sin
      // esto, la lista de Reservas Individuales quedaba mostrando el estado
      // previo a la entrega hasta que algo más disparara un refetch.
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}

export function useDevolverPorId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ubicacion }) => llavesApi.devolverPorId(id, ubicacion),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llaves'] });
      qc.invalidateQueries({ queryKey: ['novedades'] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}

export function useConfirmarAnticipado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: llavesApi.confirmarAnticipado,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llaves'] });
      qc.invalidateQueries({ queryKey: ['programacion'] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}
