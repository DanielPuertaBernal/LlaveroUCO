import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Restaura la sesión usando la cookie httpOnly `refreshToken` que el
 * navegador ya envía automáticamente (con `credentials: 'include'`). No hay
 * ningún refresh token que leer o enviar manualmente desde JS — vive solo en
 * la cookie, invisible para el frontend. Usa `fetch` directo (en vez de
 * `apiClient`) a propósito, para no crear un import circular con
 * `axios.client.js` (que a su vez importa este store).
 */
async function restoreAuthSession() {
  const BASE = import.meta.env.VITE_API_URL ?? '';

  const refreshResponse = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!refreshResponse.ok) {
    throw new Error('No se pudo refrescar la sesión');
  }

  const refreshPayload = await refreshResponse.json();
  const nextToken = refreshPayload?.data?.token;

  if (!nextToken) {
    throw new Error('No se pudo refrescar la sesión');
  }

  const meResponse = await fetch(`${BASE}/api/auth/me`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${nextToken}` },
  });

  if (!meResponse.ok) {
    throw new Error('No se pudo restaurar el usuario autenticado');
  }

  const mePayload = await meResponse.json();
  return {
    token: nextToken,
    usuario: mePayload?.data?.usuario || null,
  };
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      usuario: null,
      isAuthenticated: false,
      isHydrating: true,
      hasHydrated: false,

      setHydrated: (keepHydrating = false) => set({ hasHydrated: true, isHydrating: keepHydrating }),

      login: ({ token, usuario }) =>
        set((state) => ({
          token: token || null,
          usuario: usuario || state.usuario,
          isAuthenticated: Boolean((token || state.token) && (usuario || state.usuario)),
          isHydrating: false,
          hasHydrated: true,
        })),

      logout: () =>
        set({ token: null, usuario: null, isAuthenticated: false, isHydrating: false, hasHydrated: true }),

      updateUsuario: (usuario) => set({ usuario }),

      /**
       * Intenta restaurar la sesión llamando a `/auth/refresh` (cookie
       * httpOnly). Ya no depende de ningún `refreshToken` en el estado del
       * cliente: se intenta siempre que no haya un access token en memoria
       * (por ejemplo, tras recargar la página), y el backend decide si la
       * cookie es válida.
       */
      restoreSession: async () => {
        const state = get();
        if (state.token && state.isAuthenticated) {
          set({ isHydrating: false, hasHydrated: true });
          return true;
        }

        set({ isHydrating: true });
        try {
          const restored = await restoreAuthSession();
          set({
            token: restored.token,
            usuario: restored.usuario,
            isAuthenticated: Boolean(restored.token && restored.usuario),
            isHydrating: false,
            hasHydrated: true,
          });
          return true;
        } catch (_) {
          set({ token: null, usuario: null, isAuthenticated: false, isHydrating: false, hasHydrated: true });
          return false;
        }
      },
    }),
    {
      name: 'auth-storage-v2',
      // El refresh token ya no se persiste en localStorage (ni ningún otro
      // dato de sesión): ahora vive solo en una cookie httpOnly que el
      // navegador administra, fuera del alcance de JS.
      partialize: () => ({}),
      onRehydrateStorage: () => (state) => {
        // No hay nada persistido que indique si hay sesión o no; se marca
        // como hidratado pero manteniendo `isHydrating: true` para que
        // `ProtectedRoute`/`LoginPage` disparen `restoreSession()` (que
        // consulta la cookie vía `/auth/refresh`) antes de decidir si hay
        // sesión activa.
        state?.setHydrated(true);
      },
    }
  )
);
