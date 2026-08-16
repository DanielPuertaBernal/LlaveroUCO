import apiClient from '@/shared/api/axios.client';

export const authApi = {
  // El refresh token viaja como cookie httpOnly; el backend la lee/limpia
  // directamente, no hace falta enviar nada en el body.
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
  refresh: () => apiClient.post('/auth/refresh'),
};
