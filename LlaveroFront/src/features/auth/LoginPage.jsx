import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { Mail, Sun, Moon } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { FormField, Input } from '@/shared/components/ui/FormField';
import { useTheme } from '@/shared/components/ThemeProvider';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Correo requerido')
    .email('Ingresa un correo electrónico válido'),
});

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, isHydrating, hasHydrated, token, restoreSession } = useAuthStore();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (hasHydrated && !token) {
      restoreSession();
    }
  }, [hasHydrated, token, restoreSession]);

  useEffect(() => {
    if (isAuthenticated && !isHydrating) {
      navigate('/programacion', { replace: true });
    }
  }, [isAuthenticated, isHydrating, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });

  function onSubmit({ email }) {
    setLoading(true);
    window.location.href = `${API_BASE_URL}/api/auth/office365/login?email=${encodeURIComponent(email)}`;
  }

  if (!hasHydrated || isHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo-uco.svg"
            alt="Universidad Católica de Oriente"
            className="h-10 w-auto max-w-[60%] object-contain opacity-80"
          />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-muted/40 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="w-full max-w-md">
        <div className="rounded-xl bg-card shadow-xl border border-border border-t-4 border-t-primary overflow-hidden">
          <div className="px-6 sm:px-10 pt-10 pb-8">
            <div className="flex justify-center mb-6">
              <img
                src="/logo-uco.svg"
                alt="Universidad Católica de Oriente"
                className="h-16 w-auto max-w-[85%] object-contain"
              />
            </div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">
                Iniciar sesión
              </h2>
              <span className="mt-2 inline-block h-1 w-12 rounded-full bg-accent" />
              <p className="mt-3 text-sm text-muted-foreground">
                Accede con tu correo institucional Office 365
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <FormField error={errors.email?.message}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    {...register('email')}
                    type="email"
                    autoComplete="email"
                    placeholder="correo@uco.edu.co"
                    className="pl-9"
                  />
                </div>
              </FormField>

              <Button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                size="lg"
              >
                {loading ? 'Redirigiendo...' : 'Iniciar sesión'}
              </Button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Universidad Católica de Oriente &middot; Sistema de gestión de llaves
        </p>
      </div>
    </div>
  );
}
