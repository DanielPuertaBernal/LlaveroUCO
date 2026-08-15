import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '@/features/auth/authApi';
import { useAuthStore } from '@/features/auth/authStore';
import Sidebar from '@/shared/components/Sidebar';
import TopBar from '@/shared/components/TopBar';

export default function Layout() {
  const { usuario, refreshToken, logout } = useAuthStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    try {
      await authApi.logout(refreshToken);
    } catch (_) {
      // Si el backend no responde, igual limpiamos la sesión local.
    } finally {
      logout();
      navigate('/login');
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        usuario={usuario}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
