import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const programacionApi = {
  listar: (semestre = null) =>
    apiClient.get('/programacion', semestre ? { params: { semestre } } : {}),
  listarPorDia: (dia, clasesConLlave = [], semestre = null) =>
    apiClient.get(`/programacion/dia/${dia}`, {
      params: {
        clasesConLlave: JSON.stringify(clasesConLlave),
        ...(semestre ? { semestre } : {}),
      },
    }),
  listarSemestres: () => apiClient.get('/programacion/semestres'),
  listarSemestreVigente: () => apiClient.get('/programacion/semestres/vigente'),
  eliminarSemestre: (codigo) => apiClient.delete(`/programacion/semestres/${encodeURIComponent(codigo)}`),
  actualizarFechasSemestre: (codigo, data) =>
    apiClient.patch(`/programacion/semestres/${encodeURIComponent(codigo)}/fechas`, data),
  importar: (file) => {
    const fd = new FormData();
    fd.append('archivo', file);
    return apiClient.post('/programacion/importar', fd);
  },
  exportar: (semestre = null) =>
    apiClient.get('/programacion/exportar', {
      responseType: 'blob',
      ...(semestre ? { params: { semestre } } : {}),
    }),
  // Reservas semestrales
  listarReservasSemestrales: (codigo) =>
    apiClient.get(`/programacion/semestres/${encodeURIComponent(codigo)}/reservas-semestrales`),
  importarReservasSemestrales: (codigo, formData) =>
    apiClient.post(`/programacion/semestres/${encodeURIComponent(codigo)}/reservas-semestrales/importar`, formData),
  eliminarReservasSemestrales: (codigo) =>
    apiClient.delete(`/programacion/semestres/${encodeURIComponent(codigo)}/reservas-semestrales`),
  exportarSemestrales: (codigo) =>
    apiClient.get(`/programacion/semestres/${encodeURIComponent(codigo)}/reservas-semestrales/exportar`, {
      responseType: 'blob',
    }),
  eliminarReservaIndividual: (id) =>
    apiClient.delete(`/programacion/reservas-semestrales/${encodeURIComponent(id)}`),
  actualizar: (id, data) =>
    apiClient.patch(`/programacion/${encodeURIComponent(id)}`, data),
  validarFantasma: (semestre, codigo_materia) =>
    apiClient.get('/programacion/validar-fantasma', { params: { semestre, codigo_materia } }),
  vincularFantasma: (id, codigo_materia_fantasma, grupo_fantasma) =>
    apiClient.post(`/programacion/${encodeURIComponent(id)}/vincular-fantasma`, { codigo_materia_fantasma, grupo_fantasma }),
  desvincularFantasma: (id, codigo_materia_fantasma, grupo_fantasma) =>
    apiClient.delete(`/programacion/${encodeURIComponent(id)}/desvincular-fantasma`, { data: { codigo_materia_fantasma, grupo_fantasma } }),
};

export function useProgramacion(semestre = null) {
  return useQuery({
    queryKey: ['programacion', semestre],
    queryFn: () => programacionApi.listar(semestre).then((r) => r.data.data.registros),
  });
}

export function useProgramacionDia(dia, semestre = null) {
  return useQuery({
    queryKey: ['programacion', 'dia', dia, semestre],
    queryFn: () =>
      programacionApi.listarPorDia(dia, [], semestre).then((r) => ({
        clases: r.data.data.clases ?? [],
        reservasSemestrales: r.data.data.reservasSemestrales ?? [],
      })),
    enabled: !!dia,
  });
}

export function useSemestres() {
  return useQuery({
    queryKey: ['programacion', 'semestres'],
    queryFn: () => programacionApi.listarSemestres().then((r) => r.data.data.semestres),
  });
}

export function useSemestreVigente() {
  return useQuery({
    queryKey: ['programacion', 'semestres', 'vigente'],
    queryFn: () => programacionApi.listarSemestreVigente().then((r) => r.data.data.semestre),
  });
}

export function useImportarProgramacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: programacionApi.importar,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programacion'] });
    },
  });
}

export function useEliminarSemestre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (codigo) => programacionApi.eliminarSemestre(codigo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programacion'] });
    },
  });
}

export function useActualizarFechasSemestre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ codigo, fecha_inicio, fecha_fin }) =>
      programacionApi.actualizarFechasSemestre(codigo, { fecha_inicio, fecha_fin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programacion', 'semestres'] });
      qc.invalidateQueries({ queryKey: ['reservas-semestrales'] });
    },
  });
}

export function useReservasSemestrales(codigo) {
  return useQuery({
    queryKey: ['reservas-semestrales', codigo],
    queryFn: () =>
      programacionApi.listarReservasSemestrales(codigo).then((r) => r.data.data.reservas ?? []),
    enabled: !!codigo,
  });
}

export function useImportarReservasSemestrales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ codigo, file }) => {
      const fd = new FormData();
      fd.append('file', file);
      return programacionApi.importarReservasSemestrales(codigo, fd);
    },
    onSuccess: (_data, { codigo }) => {
      qc.invalidateQueries({ queryKey: ['reservas-semestrales', codigo] });
    },
  });
}

export function useEliminarReservasSemestrales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (codigo) => programacionApi.eliminarReservasSemestrales(codigo),
    onSuccess: (_data, codigo) => {
      qc.invalidateQueries({ queryKey: ['reservas-semestrales', codigo] });
    },
  });
}

export function useActualizarClase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => programacionApi.actualizar(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programacion'] }),
  });
}

export function useEliminarReservaIndividual(codigoSemestre) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => programacionApi.eliminarReservaIndividual(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas-semestrales', codigoSemestre] });
    },
  });
}

export function useVincularFantasma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, codigo_materia_fantasma, grupo_fantasma }) =>
      programacionApi.vincularFantasma(id, codigo_materia_fantasma, grupo_fantasma),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programacion'] }),
  });
}

export function useDesvincularFantasma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, codigo_materia_fantasma, grupo_fantasma }) =>
      programacionApi.desvincularFantasma(id, codigo_materia_fantasma, grupo_fantasma),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programacion'] }),
  });
}
