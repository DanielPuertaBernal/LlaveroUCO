import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DataTable from '@/shared/components/DataTable';
import { useUsuarios, useCrearUsuario, useCambiarEstadoUsuario, useVincularComunidad } from './usuariosApi';
import { comunidadApi } from '@/features/comunidad/comunidadApi';
import { ROLES } from '@/shared/constants';
import { showSuccess, showError } from '@/shared/utils/alert';
import { Users, Link, Unlink } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input } from '@/shared/components/ui/FormField';
import PasswordStrengthIndicator from '@/shared/components/ui/PasswordStrengthIndicator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/shared/components/ui/Sheet';

const crearUsuarioSchema = z.object({
  usuario: z.string().min(3, 'Mínimo 3 caracteres'),
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  contacto: z.string().optional().default(''),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[a-z]/, 'Debe contener una minúscula')
    .regex(/[0-9]/, 'Debe contener un número')
    .regex(/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\/~`]/, 'Debe contener un carácter especial'),
  numero_documento: z.string().optional().default(''),
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

function ComunidadCell({ comunidad, username }) {
  const vincular = useVincularComunidad();
  const [docInput, setDocInput] = useState('');
  const [modo, setModo] = useState(null); // 'vincular' | null

  if (modo === 'vincular') {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={docInput}
          onChange={(e) => setDocInput(e.target.value)}
          placeholder="Nro. documento"
          className="border border-border rounded px-2 py-0.5 text-xs w-32 bg-background"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setModo(null); setDocInput(''); }
          }}
        />
        <button
          className="text-xs text-primary hover:underline"
          onClick={async () => {
            try {
              await vincular.mutateAsync({ username, numero_documento: docInput.trim() });
              showSuccess('Vinculación actualizada');
              setModo(null);
              setDocInput('');
            } catch (err) {
              showError(err.response?.data?.message || 'No se encontró la persona');
            }
          }}
        >
          OK
        </button>
        <button className="text-xs text-muted-foreground hover:underline" onClick={() => { setModo(null); setDocInput(''); }}>
          ✕
        </button>
      </div>
    );
  }

  if (comunidad) {
    return (
      <div className="flex items-center gap-2">
        <div>
          <p className="text-xs font-medium text-foreground leading-tight">{comunidad.nombre}</p>
          <p className="text-xs text-muted-foreground">{comunidad.tipo} · {comunidad.numero_documento}</p>
        </div>
        <button
          title="Desvincular"
          onClick={async () => {
            try {
              await vincular.mutateAsync({ username, numero_documento: '' });
              showSuccess('Desvinculado');
            } catch (err) {
              showError(err.response?.data?.message || 'Error al desvincular');
            }
          }}
        >
          <Unlink className="h-3.5 w-3.5 text-muted-foreground hover:text-danger" />
        </button>
      </div>
    );
  }

  return (
    <button
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      onClick={() => setModo('vincular')}
    >
      <Link className="h-3 w-3" /> Vincular
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
    render: (v) => (
      <StatusBadge variant={v === ROLES.ADMIN ? 'info' : 'neutral'}>
        {v === ROLES.ADMIN ? 'Admin' : 'Auxiliar'}
      </StatusBadge>
    ),
  },
  {
    key: 'comunidad',
    label: 'Comunidad',
    render: (v, row) => <ComunidadCell comunidad={v} username={row.usuario} />,
  },
  {
    key: 'activo',
    label: 'Estado',
    render: (v, row) => <EstadoToggle activo={v} username={row.usuario} />,
  },
];

const fields = [
  { name: 'usuario', label: 'Usuario', required: true, type: 'text' },
  { name: 'nombre', label: 'Nombre completo', required: true, type: 'text' },
  { name: 'email', label: 'Email', required: true, type: 'email' },
  { name: 'contacto', label: 'Teléfono', type: 'tel', inputMode: 'numeric' },
  { name: 'password', label: 'Contraseña', required: true, type: 'password' },
];

export default function UsuariosPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [docBusqueda, setDocBusqueda] = useState('');
  const [personaEncontrada, setPersonaEncontrada] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const { data: usuarios = [], isLoading } = useUsuarios();
  const crear = useCrearUsuario();
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(crearUsuarioSchema),
  });

  function abrirNuevo() {
    reset();
    setDocBusqueda('');
    setPersonaEncontrada(null);
    setSheetOpen(true);
  }

  function cerrarSheet() {
    setSheetOpen(false);
    reset();
    setDocBusqueda('');
    setPersonaEncontrada(null);
  }

  async function buscarPersona() {
    if (!docBusqueda.trim()) return;
    setBuscando(true);
    try {
      const res = await comunidadApi.buscarPorDocumento(docBusqueda.trim());
      const persona = res.data.data.persona;
      setPersonaEncontrada(persona);
      // Autocompletar nombre y documento en el formulario
      setValue('nombre', persona.nombre);
      setValue('numero_documento', persona.numero_documento);
      if (persona.correo) setValue('email', persona.correo);
    } catch {
      setPersonaEncontrada(null);
      showError('Persona no encontrada en Comunidad');
    } finally {
      setBuscando(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestión de Usuarios
          </h1>
          <p className="text-muted-foreground text-sm">{usuarios.length} usuarios</p>
        </div>
        <Button onClick={abrirNuevo}>+ Nuevo Usuario</Button>
      </div>

      <DataTable columns={COLS} data={usuarios} loading={isLoading} searchable />

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) cerrarSheet(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Crear usuario</SheetTitle>
            <SheetDescription>
              Opcionalmente vincula el usuario a una persona de Comunidad buscando por documento.
            </SheetDescription>
          </SheetHeader>

          <div className="overflow-y-auto flex-1 pr-1">
            <form id="usuario-form" onSubmit={handleSubmit(onCrear)} className="space-y-3 pt-2">
              {/* Vinculación a Comunidad */}
              <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vincular a Comunidad (opcional)</p>
                <div className="flex gap-2">
                  <input
                    value={docBusqueda}
                    onChange={(e) => setDocBusqueda(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPersona(); } }}
                    placeholder="Número de documento"
                    className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={buscarPersona} disabled={buscando}>
                    {buscando ? '...' : 'Buscar'}
                  </Button>
                </div>
                {personaEncontrada && (
                  <div className="text-xs bg-success/10 border border-success/20 rounded p-2 text-success">
                    ✓ {personaEncontrada.nombre} · {personaEncontrada.tipo}
                    {personaEncontrada.facultad ? ` · ${personaEncontrada.facultad}` : ''}
                  </div>
                )}
              </div>

              {fields.map(({ name, label, required, type, inputMode }) => (
                <FormField key={name} label={label} required={required} error={name === 'password' ? undefined : errors[name]?.message}>
                  <Input
                    {...register(name)}
                    type={type}
                    inputMode={inputMode}
                  />
                  {name === 'password' && <PasswordStrengthIndicator password={watch('password') || ''} />}
                </FormField>
              ))}
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
