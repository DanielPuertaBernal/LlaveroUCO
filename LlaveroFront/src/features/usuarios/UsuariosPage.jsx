import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DataTable from '@/shared/components/DataTable';
import { useUsuarios, useCrearUsuario, useCambiarEstadoUsuario } from './usuariosApi';
import { ROLES } from '@/shared/constants';
import { showSuccess, showError } from '@/shared/utils/alert';
import { soloNombre, soloNumerosConTope, LONGITUD_MAXIMA } from '@/shared/utils/inputValidation';
import { Users } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input } from '@/shared/components/ui/FormField';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/shared/components/ui/Sheet';

const crearUsuarioSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  contacto: z.string().optional().default(''),
});

function EstadoToggle({ activo, username }) {
  const cambiar = useCambiarEstadoUsuario();
  return (
    <button
      onClick={() => cambiar.mutate({ username, activo: !activo })}
      disabled={cambiar.isPending}
    >
      <StatusBadge variant={activo ? 'success' : 'danger'} className="cursor-pointer">
        {activo ? 'Activo' : 'Inactivo'}
      </StatusBadge>
    </button>
  );
}

const COLS = [
  { key: 'usuario', label: 'Usuario' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'contacto', label: 'Contacto' },
  {
    key: 'rol',
    label: 'Rol',
    render: (v) => {
      const variant = v === ROLES.ADMIN ? 'info' : v === ROLES.PORTERIA ? 'warning' : 'neutral';
      const label = v === ROLES.ADMIN ? 'Admin' : v === ROLES.PORTERIA ? 'Portería' : 'Auxiliar';
      return <StatusBadge variant={variant}>{label}</StatusBadge>;
    },
  },
  {
    key: 'activo',
    label: 'Estado',
    render: (v, row) => <EstadoToggle activo={v} username={row.usuario} />,
  },
];

const fields = [
  { name: 'nombre', label: 'Nombre completo', required: true, type: 'text', transformar: soloNombre },
  { name: 'email', label: 'Email', required: true, type: 'email', maxLength: 100 },
  {
    name: 'contacto',
    label: 'Teléfono',
    type: 'tel',
    inputMode: 'numeric',
    maxLength: LONGITUD_MAXIMA.contacto,
    transformar: (v) => soloNumerosConTope(v, LONGITUD_MAXIMA.contacto),
  },
];

export default function UsuariosPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: usuarios = [], isLoading } = useUsuarios();
  const crear = useCrearUsuario();
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(crearUsuarioSchema),
  });

  function abrirNuevo() {
    reset();
    setSheetOpen(true);
  }

  function cerrarSheet() {
    setSheetOpen(false);
    reset();
  }

  async function onCrear(data) {
    try {
      await crear.mutateAsync(data);
      cerrarSheet();
      showSuccess('Usuario creado correctamente');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message;
      if (status === 409) {
        showError(msg || 'El usuario o correo ya existe');
      } else if (status === 400) {
        showError(msg || 'Datos inválidos. Revise los campos del formulario.');
      } else if (!err.response) {
        showError('Sin conexión al servidor. Verifique su red.');
      } else {
        showError(msg || 'No se pudo crear el usuario. Intente nuevamente.');
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestión de Usuarios
          </h1>
          <p className="text-muted-foreground text-sm">{usuarios.length} usuarios</p>
        </div>
        <Button onClick={abrirNuevo}>+ Nuevo Usuario</Button>
      </div>

      <DataTable columns={COLS} data={usuarios} loading={isLoading} searchable exportable exportFileName="usuarios" />

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) cerrarSheet(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Crear usuario</SheetTitle>
            <SheetDescription>
              El acceso se hace con el correo institucional (Office 365); no se necesita usuario ni contraseña.
            </SheetDescription>
          </SheetHeader>

          <div className="overflow-y-auto flex-1 pr-1">
            <form id="usuario-form" onSubmit={handleSubmit(onCrear)} className="space-y-3 pt-2">
              {fields.map(({ name, label, required, type, inputMode, maxLength, transformar }) => {
                const registro = register(name);
                return (
                  <FormField key={name} label={label} required={required} error={errors[name]?.message}>
                    <Input
                      {...registro}
                      type={type}
                      inputMode={inputMode}
                      maxLength={maxLength}
                      onChange={transformar ? (e) => { e.target.value = transformar(e.target.value); registro.onChange(e); } : registro.onChange}
                    />
                  </FormField>
                );
              })}
            </form>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={cerrarSheet}>
              Cancelar
            </Button>
            <Button type="submit" form="usuario-form" disabled={crear.isPending}>
              {crear.isPending ? 'Creando...' : 'Crear Usuario'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
