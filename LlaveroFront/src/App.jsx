import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import Layout from '@/shared/components/Layout';
import LoginPage from '@/features/auth/LoginPage';
import AuthCallbackPage from '@/features/auth/AuthCallbackPage';
import ProgramacionPage from '@/features/programacion/ProgramacionPage';
import GestionSalonesPage from '@/features/gestion-salones/GestionSalonesPage';
import EquiposPage from '@/features/equipos/EquiposPage';
import PrestamosPage from '@/features/prestamos/PrestamosPage';
import HistorialPage from '@/features/historial/HistorialPage';
import UsuariosPage from '@/features/usuarios/UsuariosPage';
import ComunidadPage from '@/features/comunidad/ComunidadPage';
import MonitoresPage from '@/features/monitores/MonitoresPage';
import PerfilPage from '@/features/perfil/PerfilPage';
import SalonesPage from '@/features/salones/SalonesPage';
import PorterosPage from '@/features/porteros/PorterosPage';
import ConfiguracionPage from '@/features/configuracion/ConfiguracionPage';
import NotificacionesPage from '@/features/notificaciones/NotificacionesPage';
import NovedadesPage from '@/features/novedades/NovedadesPage';
import ReservasSemestralesPage from '@/features/reservas_semestrales/ReservasSemestralesPage';
import OcupacionPage from '@/features/ocupacion/OcupacionPage';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import { ROLES } from '@/shared/constants';

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth-callback" element={<AuthCallbackPage />} />

        {/* Rutas protegidas con layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/programacion" replace />} />
            <Route path="/programacion" element={<ProgramacionPage />} />
            <Route path="/gestion-salones" element={<GestionSalonesPage />} />
            <Route path="/llaves" element={<Navigate to="/gestion-salones" replace />} />
            <Route path="/reservas" element={<Navigate to="/gestion-salones" replace />} />
            <Route path="/equipos" element={<EquiposPage />} />
            <Route path="/prestamos" element={<PrestamosPage />} />
            <Route path="/historial" element={<HistorialPage />} />
            <Route path="/monitores" element={<MonitoresPage />} />
            <Route path="/notificaciones" element={<NotificacionesPage />} />
            <Route path="/novedades" element={<NovedadesPage />} />
            <Route path="/reservas-semestrales" element={<ReservasSemestralesPage />} />
            <Route path="/perfil" element={<PerfilPage />} />

            <Route path="/notificaciones-llaves" element={<Navigate to="/notificaciones" replace />} />

            {/* Solo ADMIN */}
            <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
              <Route path="/usuarios" element={<UsuariosPage />} />
              <Route path="/comunidad" element={<ComunidadPage />} />
              <Route path="/salones" element={<SalonesPage />} />
              <Route path="/porteros" element={<PorterosPage />} />
              <Route path="/configuracion" element={<ConfiguracionPage />} />
              <Route path="/ocupacion" element={<OcupacionPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
