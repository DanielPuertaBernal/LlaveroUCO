import apiClient from '@/shared/api/axios.client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const usuariosApi = {
  listar: () => apiClient.get('/usuarios'),
  crear: (data) => apiClient.post('/usuarios', data),
  cambiarEstado: (username, activo) => apiClient.patch(`/usuarios/${username}/estado`, { activo }),
  editarPerfil: (data) => apiClient.patch('/usuarios/perfil', data),
  cambiarContrasena: (data) => apiClient.patch('/usuarios/contrasena', data),
  vincularComunidad: (username, numero_documento) =>
    apiClient.patch(`/usuarios/${username}/vinculacion`, { numero_documento }),
};

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: () => usuariosApi.listar().then((r) => r.data.data.usuarios),
  });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usuariosApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function useCambiarEstadoUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, activo }) => usuariosApi.cambiarEstado(username, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function useVincularComunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, numero_documento }) =>
      usuariosApi.vincularComunidad(username, numero_documento),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}
