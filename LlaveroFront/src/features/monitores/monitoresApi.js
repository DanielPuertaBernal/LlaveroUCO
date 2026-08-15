import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const monitoresApi = {
  listar: (params) => apiClient.get('/monitores', { params }),
  clasesDocente: (documento) => apiClient.get(`/monitores/clases/${documento}`),
  registrar: (data) => apiClient.post('/monitores', data),
  eliminar: (id) => apiClient.delete(`/monitores/${id}`),
};

export function useMonitores(documentoDocente) {
  return useQuery({
    queryKey: ['monitores', documentoDocente],
    queryFn: () =>
      monitoresApi
        .listar(documentoDocente ? { documento_docente: documentoDocente } : {})
        .then((r) => r.data.data.monitores),
    enabled: !!documentoDocente,
  });
}

export function useClasesDocente(documento) {
  return useQuery({
    queryKey: ['monitores', 'clases', documento],
    queryFn: () => monitoresApi.clasesDocente(documento).then((r) => r.data.data.clases),
    enabled: !!documento,
  });
}

export function useRegistrarMonitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: monitoresApi.registrar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitores'] }),
  });
}

export function useEliminarMonitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: monitoresApi.eliminar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitores'] }),
  });
}
