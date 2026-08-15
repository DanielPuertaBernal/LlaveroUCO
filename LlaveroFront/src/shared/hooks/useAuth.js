import { useAuthStore } from '@/features/auth/authStore';

export function useAuth() {
  const { usuario, token, isAuthenticated, login, logout } = useAuthStore();
  return { usuario, token, isAuthenticated, login, logout };
}
