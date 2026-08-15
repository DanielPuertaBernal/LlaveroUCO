import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { Mail } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { FormField, Input } from '@/shared/components/ui/FormField';

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
  const { isAuthenticated, isHydrating, hasHydrated, token, refreshToken, restoreSession } = useAuthStore();

  useEffect(() => {
    if (hasHydrated && !token && refreshToken) {
      restoreSession();
    }
  }, [hasHydrated, token, refreshToken, restoreSession]);

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

  if (!hasHydrated || (isHydrating && refreshToken)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary/10">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary/10 p-6">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border overflow-hidden">
        {/* Banner diagonal de acento */}
        <div
          className="h-28 bg-accent"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 55%, 0 100%)' }}
        />

        <div className="px-8 pb-8 pt-2">
          <h2 className="text-center text-2xl font-bold text-foreground mb-8">
            Iniciar sesión
          </h2>

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
              className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
              size="lg"
            >
              {loading ? 'Redirigiendo...' : 'Iniciar sesión'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
