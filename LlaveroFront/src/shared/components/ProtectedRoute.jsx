import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/authStore';

/**
 * Protege rutas: redirige a /login si no hay sesión.
 * Si se pasan `roles`, verifica que el usuario los tenga.
 */
export default function ProtectedRoute({ roles }) {
  const {
    isAuthenticated,
    usuario,
    token,
    refreshToken,
    isHydrating,
    hasHydrated,
    restoreSession,
  } = useAuthStore();

  useEffect(() => {
    if (hasHydrated && !token && refreshToken) {
      restoreSession();
    }
  }, [hasHydrated, token, refreshToken, restoreSession]);

  if (!hasHydrated || isHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Restaurando sesión...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && roles.length && !roles.includes(usuario?.rol)) {
    return <Navigate to="/programacion" replace />;
  }

  return <Outlet />;
}
