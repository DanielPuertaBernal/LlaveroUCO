import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { authApi } from './authApi';
import Button from '@/shared/components/ui/Button';

const ERROR_MESSAGES = {
  invalid_state: 'La sesión de inicio de sesión expiró o no es válida. Intenta de nuevo.',
  usuario_no_registrado: 'Tu correo no está registrado en el sistema. Contacta a un administrador.',
  azure_error: 'No se pudo completar la autenticación con Microsoft. Intenta de nuevo.',
  token_error: 'Ocurrió un error generando la sesión. Intenta de nuevo.',
};

function getErrorMessage(code) {
  return ERROR_MESSAGES[code] || 'Ocurrió un error al iniciar sesión. Intenta de nuevo.';
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [error, setError] = useState('');
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const refreshToken = params.get('refreshToken');
    const errorCode = params.get('error');

    // Limpia los query params del historial para no dejar el token expuesto/reutilizable
    window.history.replaceState({}, '', window.location.pathname);

    if (errorCode) {
      setError(getErrorMessage(errorCode));
      return;
    }

    if (!token || !refreshToken) {
      setError(getErrorMessage());
      return;
    }

    (async () => {
      try {
        login({ token, refreshToken, usuario: null });
        const res = await authApi.me();
        login({ token, refreshToken, usuario: res.data.data.usuario });
        navigate('/programacion', { replace: true });
      } catch (_err) {
        setError('No se pudo obtener la información del usuario autenticado. Intenta de nuevo.');
      }
    })();
  }, [login, navigate]);

  if (!error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary/10">
        <p className="text-sm text-muted-foreground">Iniciando sesión...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary/10 p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <h2 className="text-xl font-bold text-foreground">No se pudo iniciar sesión</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
          Volver al inicio de sesión
        </Button>
      </div>
    </div>
  );
}
