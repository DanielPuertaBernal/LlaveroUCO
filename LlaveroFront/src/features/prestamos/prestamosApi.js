import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const prestamosApi = {
  listar: () => apiClient.get('/prestamos'),
  activos: () => apiClient.get('/prestamos/activos'),
  porDocente: (nfc) => apiClient.get(`/prestamos/docente/${nfc}`),
  crear: (data) => apiClient.post('/prestamos', data),
  agregarEquipo: (id, equipoId) => apiClient.post(`/prestamos/${id}/equipos`, { equipoId }),
  devolucion: (data) => apiClient.post('/prestamos/devolucion', data),
};

export function usePrestamosActivos() {
  return useQuery({
    queryKey: ['prestamos', 'activos'],
    queryFn: () => prestamosApi.activos().then((r) => r.data.data.prestamos),
    refetchInterval: 30000,
  });
}

export function usePrestamosAbiertos() {
  return useQuery({
    queryKey: ['prestamos', 'abiertos'],
    queryFn: () => prestamosApi.listar().then((r) => r.data.data.prestamos || []),
    select: (prestamos) =>
      prestamos.filter((p) => ['activo', 'parcialmente_devuelto'].includes(p.estado)),
    refetchInterval: 30000,
  });
}

export function usePrestamosHistorial() {
  return useQuery({
    queryKey: ['prestamos', 'historial'],
    queryFn: () => prestamosApi.listar().then((r) => r.data.data.prestamos || []),
    select: (prestamos) =>
      prestamos
        .filter((p) => p.estado === 'completamente_devuelto')
        .sort((a, b) => new Date(b.fecha_prestamo) - new Date(a.fecha_prestamo)),
    refetchInterval: 60000,
  });
}

export function useCrearPrestamo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: prestamosApi.crear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamos'] });
      qc.invalidateQueries({ queryKey: ['equipos'] });
    },
  });
}

export function useRegistrarDevolucion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: prestamosApi.devolucion,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamos'] });
      qc.invalidateQueries({ queryKey: ['equipos'] });
      qc.invalidateQueries({ queryKey: ['novedades'] });
    },
  });
}
