import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/features/auth/authStore';
import { usuariosApi } from '@/features/usuarios/usuariosApi';
import { showSuccess, showError } from '@/shared/utils/alert';
import { User, Pencil, Mail, Phone } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input } from '@/shared/components/ui/FormField';
import { soloNombre, soloNumerosConTope, LONGITUD_MAXIMA, esCorreoValido } from '@/shared/utils/inputValidation';

export default function PerfilPage() {
  const { usuario, updateUsuario } = useAuthStore();

  const perfilForm = useForm({
    defaultValues: { nombre: usuario?.nombre, email: usuario?.email, contacto: usuario?.contacto },
  });

  const registroNombre = perfilForm.register('nombre');
  const registroContacto = perfilForm.register('contacto');

  async function onEditarPerfil(data) {
    if (data.email && !esCorreoValido(data.email)) {
      showError('Correo no válido (ej: usuario@dominio.com)');
      return;
    }
    try {
      const res = await usuariosApi.editarPerfil(data);
      updateUsuario(res.data.data.usuario);
      showSuccess('Perfil actualizado correctamente');
    } catch (e) {
      showError(e.response?.data?.message || 'Error al actualizar perfil');
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

      {/* Editar perfil */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4 max-w-lg">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <Pencil className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Editar información</h2>
        </div>
        <form onSubmit={perfilForm.handleSubmit(onEditarPerfil)} className="space-y-3">
          <FormField label="Nombre completo">
            <Input
              {...registroNombre}
              onChange={(e) => { e.target.value = soloNombre(e.target.value); registroNombre.onChange(e); }}
            />
          </FormField>
          <FormField label="Email">
            <Input {...perfilForm.register('email')} type="email" maxLength={100} />
          </FormField>
          <FormField label="Teléfono">
            <Input
              {...registroContacto}
              type="tel"
              inputMode="numeric"
              maxLength={LONGITUD_MAXIMA.contacto}
              onChange={(e) => { e.target.value = soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.contacto); registroContacto.onChange(e); }}
            />
          </FormField>
          <Button type="submit" className="w-full mt-1">Guardar cambios</Button>
        </form>
      </div>
    </div>
  );
}
