import apiClient from '@/shared/api/axios.client';

export const authApi = {
  logout: (refreshToken = '') => apiClient.post('/auth/logout', { refreshToken }),
  me: () => apiClient.get('/auth/me'),
  refresh: (refreshToken) => apiClient.post('/auth/refresh', { refreshToken }),
};
