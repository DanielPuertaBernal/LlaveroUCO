import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/features/auth/authStore';
import { usuariosApi } from '@/features/usuarios/usuariosApi';
import { showSuccess, showError } from '@/shared/utils/alert';
import { User, Pencil, Lock, Mail, Phone } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input } from '@/shared/components/ui/FormField';
import PasswordStrengthIndicator from '@/shared/components/ui/PasswordStrengthIndicator';

const passwordChangeSchema = z.object({
  passwordActual: z.string().min(1, 'Contraseña actual requerida'),
  passwordNueva: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[a-z]/, 'Debe contener una minúscula')
    .regex(/[0-9]/, 'Debe contener un número')
    .regex(/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\/~`]/, 'Debe contener un carácter especial'),
  confirmar: z.string().min(1, 'Confirme la nueva contraseña'),
}).refine((d) => d.passwordNueva === d.confirmar, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmar'],
});

export default function PerfilPage() {
  const { usuario, updateUsuario } = useAuthStore();

  const perfilForm = useForm({
    defaultValues: { nombre: usuario?.nombre, email: usuario?.email, contacto: usuario?.contacto },
  });
  const passForm = useForm({ resolver: zodResolver(passwordChangeSchema) });

  async function onEditarPerfil(data) {
    try {
      const res = await usuariosApi.editarPerfil(data);
      updateUsuario(res.data.data.usuario);
      showSuccess('Perfil actualizado correctamente');
    } catch (e) {
      showError(e.response?.data?.message || 'Error al actualizar perfil');
    }
  }

  async function onCambiarContrasena(data) {
    try {
      await usuariosApi.cambiarContrasena({ passwordActual: data.passwordActual, passwordNueva: data.passwordNueva });
      passForm.reset();
      showSuccess('Contraseña cambiada exitosamente');
    } catch (e) {
      showError(e.response?.data?.message || 'Error al cambiar contraseña');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <User className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mi Perfil</h1>
          <p className="text-sm text-muted-foreground">Gestiona tu información personal y acceso</p>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-primary/5 border border-primary/10 rounded-xl p-5 flex items-center gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-lg">
          {usuario?.nombre?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground text-lg leading-tight">{usuario?.nombre}</p>
          <p className="text-sm text-muted-foreground">@{usuario?.usuario}</p>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />{usuario?.email}
            </span>
            {usuario?.contacto && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />{usuario?.contacto}
              </span>
            )}
          </div>
        </div>
        <StatusBadge variant="info" className="shrink-0">{usuario?.rol}</StatusBadge>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Editar perfil */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Pencil className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">Editar información</h2>
          </div>
          <form onSubmit={perfilForm.handleSubmit(onEditarPerfil)} className="space-y-3">
            <FormField label="Nombre completo">
              <Input {...perfilForm.register('nombre')} />
            </FormField>
            <FormField label="Email">
              <Input {...perfilForm.register('email')} type="email" />
            </FormField>
            <FormField label="Teléfono">
              <Input {...perfilForm.register('contacto')} type="tel" inputMode="numeric" />
            </FormField>
            <Button type="submit" className="w-full mt-1">Guardar cambios</Button>
          </form>
        </div>

        {/* Cambiar contraseña */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Lock className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">Cambiar contraseña</h2>
          </div>
          <form onSubmit={passForm.handleSubmit(onCambiarContrasena)} className="space-y-3">
            <FormField label="Contraseña actual" error={passForm.formState.errors.passwordActual?.message}>
              <Input {...passForm.register('passwordActual')} type="password" />
            </FormField>
            <FormField label="Nueva contraseña">
              <Input {...passForm.register('passwordNueva')} type="password" />
              <PasswordStrengthIndicator password={passForm.watch('passwordNueva') || ''} />
            </FormField>
            <FormField label="Confirmar nueva contraseña" error={passForm.formState.errors.confirmar?.message}>
              <Input {...passForm.register('confirmar')} type="password" />
            </FormField>
            <Button type="submit" className="w-full mt-1">Cambiar contraseña</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
