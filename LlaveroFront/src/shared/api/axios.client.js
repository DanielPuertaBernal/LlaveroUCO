import axios from 'axios';
import { useAuthStore } from '@/features/auth/authStore';

const BASE = import.meta.env.VITE_API_URL ?? '';

const apiClient = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 15000,
  // Necesario para que el navegador envíe/reciba la cookie httpOnly
  // `refreshToken` en requests cross-origin al backend.
  withCredentials: true,
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
      const { usuario, login, logout } = useAuthStore.getState();

      if (!originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // El refresh token viaja solo en la cookie httpOnly; el navegador
          // la envía automáticamente gracias a `withCredentials: true`, no
          // hay ningún valor que leer/mandar manualmente aquí.
          refreshPromise = refreshPromise || axios.post(`${BASE}/api/auth/refresh`, null, {
            timeout: 15000,
            withCredentials: true,
          });
          const response = await refreshPromise;
          refreshPromise = null;

          const nextToken = response.data?.data?.token;

          if (nextToken) {
            login({ token: nextToken, usuario });
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
