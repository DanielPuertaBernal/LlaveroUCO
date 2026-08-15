import { create } from 'zustand';
import { persist } from 'zustand/middleware';

async function restoreAuthSession(refreshToken) {
  const BASE = import.meta.env.VITE_API_URL ?? '';

  const refreshResponse = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!refreshResponse.ok) {
    throw new Error('No se pudo refrescar la sesión');
  }

  const refreshPayload = await refreshResponse.json();
  const nextToken = refreshPayload?.data?.token;
  const nextRefreshToken = refreshPayload?.data?.refreshToken || refreshToken;

  const meResponse = await fetch(`${BASE}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${nextToken}`,
    },
  });

  if (!meResponse.ok) {
    throw new Error('No se pudo restaurar el usuario autenticado');
  }

  const mePayload = await meResponse.json();
  return {
    token: nextToken,
    refreshToken: nextRefreshToken,
    usuario: mePayload?.data?.usuario || null,
  };
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      usuario: null,
      isAuthenticated: false,
      isHydrating: true,
      hasHydrated: false,

      setHydrated: (keepHydrating = false) => set({ hasHydrated: true, isHydrating: keepHydrating }),

      login: ({ token, refreshToken, usuario }) =>
        set((state) => ({
          token: token || null,
          refreshToken: refreshToken || state.refreshToken,
          usuario: usuario || state.usuario,
          isAuthenticated: Boolean((token || state.token) && (usuario || state.usuario)),
          isHydrating: false,
          hasHydrated: true,
        })),

      logout: () =>
        set({ token: null, refreshToken: null, usuario: null, isAuthenticated: false, isHydrating: false, hasHydrated: true }),

      updateUsuario: (usuario) => set({ usuario }),

      restoreSession: async () => {
        const state = get();
        if (state.isHydrating && !state.hasHydrated) {
          return false;
        }
        if (!state.refreshToken) {
          set({ token: null, usuario: null, isAuthenticated: false, isHydrating: false, hasHydrated: true });
          return false;
        }
        if (state.token && state.isAuthenticated) {
          set({ isHydrating: false, hasHydrated: true });
          return true;
        }

        set({ isHydrating: true });
        try {
          const restored = await restoreAuthSession(state.refreshToken);
          set({
            token: restored.token,
            refreshToken: restored.refreshToken,
            usuario: restored.usuario,
            isAuthenticated: Boolean(restored.token && restored.usuario),
            isHydrating: false,
            hasHydrated: true,
          });
          return true;
        } catch (_) {
          set({ token: null, refreshToken: null, usuario: null, isAuthenticated: false, isHydrating: false, hasHydrated: true });
          return false;
        }
      },
    }),
    {
      name: 'auth-storage-v2',
      partialize: (state) => ({
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(Boolean(state?.refreshToken));
      },
    }
  )
);
