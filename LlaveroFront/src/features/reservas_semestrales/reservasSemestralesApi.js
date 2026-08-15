import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const reservasSemestralesApi = {
  disponibilidad: (nombre_salon, dia) =>
    apiClient.get('/programacion/reservas-semestrales/disponibilidad', {
      params: { nombre_salon, dia },
    }),
  validar: (data) =>
    apiClient.post('/programacion/reservas-semestrales/validar', data),
  crear: (data) =>
    apiClient.post('/programacion/reservas-semestrales', data),
  todas: () =>
    apiClient.get('/programacion/reservas-semestrales/todas'),
  cancelarGrupo: (grupo_id) =>
    apiClient.delete(`/programacion/reservas-semestrales/grupo/${encodeURIComponent(grupo_id)}`),
  salonesDisponibles: (dia, hora_inicio, hora_fin, semestre, fecha_inicio_vigencia, fecha_fin_vigencia, excluir_grupo_id, excluir_id) =>
    apiClient.get('/programacion/reservas-semestrales/salones-disponibles', {
      params: {
        dia, hora_inicio, hora_fin,
        ...(semestre ? { semestre } : {}),
        ...(fecha_inicio_vigencia ? { fecha_inicio_vigencia } : {}),
        ...(fecha_fin_vigencia ? { fecha_fin_vigencia } : {}),
        ...(excluir_grupo_id ? { excluir_grupo_id } : {}),
        ...(excluir_id ? { excluir_id } : {}),
      },
    }),
  actualizar: (id, data) =>
    apiClient.put(`/programacion/reservas-semestrales/${encodeURIComponent(id)}`, data),
};

export function useDisponibilidadSemestral(nombre_salon, dia) {
  return useQuery({
    queryKey: ['reservas-semestrales', 'disponibilidad', nombre_salon, dia],
    queryFn: () =>
      reservasSemestralesApi.disponibilidad(nombre_salon, dia).then((r) => r.data.data),
    enabled: !!nombre_salon && !!dia,
    staleTime: 30 * 1000,
  });
}

export function useTodasReservasSemestrales() {
  return useQuery({
    queryKey: ['reservas-semestrales', 'todas'],
    queryFn: () =>
      reservasSemestralesApi.todas().then((r) => r.data.data.reservas),
  });
}

export function useCrearReservaSemestral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reservasSemestralesApi.crear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas-semestrales'] });
    },
  });
}

export function useCancelarGrupoSemestral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reservasSemestralesApi.cancelarGrupo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas-semestrales'] });
    },
  });
}

export function useValidarConflictosSemestral() {
  return useMutation({
    mutationFn: reservasSemestralesApi.validar,
  });
}

export function useSalonesDisponiblesSemestral(params) {
  return useQuery({
    queryKey: ['reservas-semestrales', 'salones-disponibles', params],
    queryFn: () =>
      reservasSemestralesApi
        .salonesDisponibles(params.dia, params.hora_inicio, params.hora_fin, params.semestre, params.fecha_inicio_vigencia, params.fecha_fin_vigencia)
        .then((r) => r.data.data.salones || []),
    enabled: !!(params?.dia && params?.hora_inicio && params?.hora_fin),
  });
}

export function useSalonesDisponiblesFranja(dia, hora_inicio, hora_fin, semestre, fecha_inicio_vigencia, fecha_fin_vigencia, excluir_grupo_id) {
  return useQuery({
    queryKey: ['reservas-semestrales', 'salones-disponibles', dia, hora_inicio, hora_fin, semestre, fecha_inicio_vigencia, fecha_fin_vigencia, excluir_grupo_id],
    queryFn: () =>
      reservasSemestralesApi
        .salonesDisponibles(dia, hora_inicio, hora_fin, semestre, fecha_inicio_vigencia, fecha_fin_vigencia, excluir_grupo_id)
        .then((r) => r.data.data.salones || []),
    enabled: !!(dia && hora_inicio && hora_fin),
    staleTime: 30 * 1000,
  });
}

export function useActualizarReservaSemestral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => reservasSemestralesApi.actualizar(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas-semestrales'] });
    },
  });
}
