import axios from 'axios';
import { useAuthStore } from '@/features/auth/authStore';

const BASE = import.meta.env.VITE_API_URL ?? '';

const apiClient = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 15000,
});

let refreshPromise = null;

// Adjunta JWT en cada request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Maneja 401 → intenta refresh una vez y, si falla, cierra la sesión
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config || {};
    const isAuthRoute = originalRequest.url?.startsWith('/auth/');

    if (error.response?.status === 401 && !isAuthRoute) {
      const { refreshToken, usuario, login, logout } = useAuthStore.getState();

      if (refreshToken && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          refreshPromise = refreshPromise || axios.post(`${BASE}/api/auth/refresh`, { refreshToken }, { timeout: 15000 });
          const response = await refreshPromise;
          refreshPromise = null;

          const nextToken = response.data?.data?.token;
          const nextRefreshToken = response.data?.data?.refreshToken || refreshToken;

          if (nextToken) {
            login({ token: nextToken, refreshToken: nextRefreshToken, usuario });
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${nextToken}`;
            return apiClient(originalRequest);
          }
        } catch (refreshError) {
          refreshPromise = null;
          logout();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }

      logout();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default apiClient;
