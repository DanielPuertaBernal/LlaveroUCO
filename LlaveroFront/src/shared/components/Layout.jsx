import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '@/features/auth/authApi';
import { useAuthStore } from '@/features/auth/authStore';
import Sidebar from '@/shared/components/Sidebar';
import TopBar from '@/shared/components/TopBar';

export default function Layout() {
  const { usuario, logout } = useAuthStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch (_) {
      // Si el backend no responde, igual limpiamos la sesión local.
    } finally {
      logout();
      navigate('/login');
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        usuario={usuario}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
