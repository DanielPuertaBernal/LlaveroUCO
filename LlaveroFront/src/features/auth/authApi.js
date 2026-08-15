import apiClient from '@/shared/api/axios.client';

export const authApi = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  logout: (refreshToken = '') => apiClient.post('/auth/logout', { refreshToken }),
  me: () => apiClient.get('/auth/me'),
  refresh: (refreshToken) => apiClient.post('/auth/refresh', { refreshToken }),
};
