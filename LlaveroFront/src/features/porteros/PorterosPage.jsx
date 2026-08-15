import { useState } from 'react';
import DataTable from '@/shared/components/DataTable';
import {
  usePorteros,
  useCrearPortero,
  useActualizarBloquesPortero,
  useEliminarPortero,
} from './porterosApi';
import { useBloques } from '@/features/bloques/bloquesApi';
import { showError, showSuccess, showConfirm } from '@/shared/utils/alert';
import { ShieldCheck, Info } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Checkbox } from '@/shared/components/ui/FormField';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/shared/components/ui/Sheet';

const PERMISOS = [
  { key: 'permite_identificacion', label: 'Identificación' },
  { key: 'permite_prestamo_llaves', label: 'Préstamo llaves' },
  { key: 'permite_devolucion_llaves', label: 'Devolución llaves' },
  { key: 'permite_prestamo_equipos', label: 'Préstamo equipos' },
];

function BloquesCell({ bloques = [] }) {
  if (!bloques.length) {
    return <span className="text-xs text-muted-foreground">Sin bloques asignados</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {bloques.map((b) => {
        const permisos = PERMISOS.filter((p) => b[p.key]).map((p) => p.label);
        return (
          <div key={b.bloque_id} className="text-xs">
            <span className="font-medium text-foreground">{b.nombre_bloque}</span>
            {permisos.length > 0 ? (
              <span className="text-muted-foreground"> — {permisos.join(', ')}</span>
            ) : (
              <span className="text-muted-foreground italic"> — sin permisos</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function construirBloquesEdicion(catalogo, asignadosActuales) {
  const asignadosPorId = Object.fromEntries((asignadosActuales || []).map((b) => [b.bloque_id, b]));
  return catalogo.map((b) => {
    const actual = asignadosPorId[b.id];
    return {
      bloque_id: b.id,
      nombre_bloque: b.nombre_bloque,
      seleccionado: !!actual,
      permite_identificacion: actual?.permite_identificacion ?? false,
      permite_prestamo_llaves: actual?.permite_prestamo_llaves ?? false,
      permite_devolucion_llaves: actual?.permite_devolucion_llaves ?? false,
      permite_prestamo_equipos: actual?.permite_prestamo_equipos ?? false,
    };
  });
}

export default function PorterosPage() {
  const { data: porteros = [], isLoading } = usePorteros();
  const { data: catalogoBloques = [] } = useBloques();
  const crear = useCrearPortero();
  const actualizarBloques = useActualizarBloquesPortero();
  const eliminar = useEliminarPortero();

  const [sheetNuevoOpen, setSheetNuevoOpen] = useState(false);
  const [form, setForm] = useState({ email: '', nombre: '' });
  const [errors, setErrors] = useState({});

  const [sheetBloquesOpen, setSheetBloquesOpen] = useState(false);
  const [porteroEditando, setPorteroEditando] = useState(null);
  const [bloquesEdicion, setBloquesEdicion] = useState([]);

  function abrirNuevo() {
    setForm({ email: '', nombre: '' });
    setErrors({});
    setSheetNuevoOpen(true);
  }

  function cerrarNuevo() {
    setSheetNuevoOpen(false);
    setForm({ email: '', nombre: '' });
    setErrors({});
  }

  async function guardarNuevo() {
    const errs = {};
    if (!form.email?.trim()) errs.email = 'El email es requerido';
    if (!form.nombre?.trim()) errs.nombre = 'El nombre es requerido';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    try {
      await crear.mutateAsync({ email: form.email.trim(), nombre: form.nombre.trim() });
      showSuccess('Portero creado correctamente');
      cerrarNuevo();
    } catch (error) {
      showError(error.response?.data?.message || 'No se pudo crear el portero');
    }
  }

  function abrirBloques(portero) {
    setPorteroEditando(portero);
    setBloquesEdicion(construirBloquesEdicion(catalogoBloques, portero.bloques));
    setSheetBloquesOpen(true);
  }

  function cerrarBloques() {
    setSheetBloquesOpen(false);
    setPorteroEditando(null);
    setBloquesEdicion([]);
  }

  function toggleBloqueSeleccionado(bloqueId) {
    setBloquesEdicion((prev) => prev.map((b) => (
      b.bloque_id === bloqueId ? { ...b, seleccionado: !b.seleccionado } : b
    )));
  }

  function toggleBloquePermiso(bloqueId, permisoKey) {
    setBloquesEdicion((prev) => prev.map((b) => (
      b.bloque_id === bloqueId ? { ...b, [permisoKey]: !b[permisoKey] } : b
    )));
  }

  async function guardarBloques() {
    if (!porteroEditando) return;
    const bloques = bloquesEdicion
      .filter((b) => b.seleccionado)
      .map(({ bloque_id, permite_identificacion, permite_prestamo_llaves, permite_devolucion_llaves, permite_prestamo_equipos }) => ({
        bloque_id,
        permite_identificacion,
        permite_prestamo_llaves,
        permite_devolucion_llaves,
        permite_prestamo_equipos,
      }));

    try {
      await actualizarBloques.mutateAsync({ usuarioId: porteroEditando.id, bloques });
      showSuccess('Bloques actualizados correctamente');
      cerrarBloques();
    } catch (error) {
      showError(error.response?.data?.message || 'No se pudo actualizar la asignación de bloques');
    }
  }

  async function onEliminar(portero) {
    const { isConfirmed } = await showConfirm('Eliminar portero', `¿Desea eliminar al portero ${portero.nombre}?`);
    if (!isConfirmed) return;
    try {
      await eliminar.mutateAsync(portero.id);
      showSuccess('Portero eliminado correctamente');
    } catch (error) {
      showError(error.response?.data?.message || 'No se pudo eliminar el portero');
    }
  }

  const columns = [
    { key: 'email', label: 'Email' },
    { key: 'nombre', label: 'Nombre' },
    {
      key: '_bloques',
      label: 'Bloques asignados',
      render: (_value, row) => <BloquesCell bloques={row.bloques} />,
    },
    {
      key: 'activo',
      label: 'Estado',
      render: (value) => (
        <StatusBadge variant={value ? 'success' : 'neutral'}>
          {value ? 'Activo' : 'Inactivo'}
        </StatusBadge>
      ),
    },
    {
      key: '_acciones',
      label: 'Acciones',
      className: 'text-center',
      render: (_value, row) => (
        <div className="flex gap-2 justify-center">
          <Button variant="warning" size="sm" onClick={() => abrirBloques(row)}>Editar bloques</Button>
          <Button variant="destructive" size="sm" onClick={() => onEliminar(row)}>Borrar</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Porteros
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Administra los usuarios de portería y sus permisos por bloque.
          </p>
        </div>
        <Button onClick={abrirNuevo}>+ Nuevo portero</Button>
      </div>

      <div className="flex items-start gap-2 bg-primary/5 border border-primary/10 rounded-xl p-4 text-sm text-foreground">
        <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        Los porteros inician sesión con su cuenta Office365 institucional. Asigna los bloques y permisos que cada uno puede operar.
      </div>

      <DataTable columns={columns} data={porteros} loading={isLoading} searchable />

      {/* Sheet: crear portero */}
      <Sheet open={sheetNuevoOpen} onOpenChange={(open) => { if (!open) cerrarNuevo(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nuevo portero</SheetTitle>
            <SheetDescription>El portero iniciará sesión con este correo institucional vía Office365.</SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <FormField label="Email" required error={errors.email}>
              <Input
                type="email"
                placeholder="portero@uco.edu.co"
                value={form.email || ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </FormField>
            <FormField label="Nombre" required error={errors.nombre}>
              <Input
                placeholder="Nombre completo"
                value={form.nombre || ''}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </FormField>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={cerrarNuevo}>Cancelar</Button>
            <Button onClick={guardarNuevo} disabled={crear.isPending}>
              {crear.isPending ? 'Creando...' : 'Crear portero'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sheet: editar bloques */}
      <Sheet open={sheetBloquesOpen} onOpenChange={(open) => { if (!open) cerrarBloques(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Bloques de {porteroEditando?.nombre}</SheetTitle>
            <SheetDescription>Selecciona los bloques y los permisos que este portero puede operar en cada uno.</SheetDescription>
          </SheetHeader>

          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {bloquesEdicion.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay bloques disponibles en el catálogo.</p>
            )}
            {bloquesEdicion.map((b) => (
              <div
                key={b.bloque_id}
                className="border border-border rounded-lg p-3 space-y-2 bg-muted/30"
              >
                <Checkbox
                  label={<span className="font-medium text-foreground">{b.nombre_bloque}</span>}
                  checked={b.seleccionado}
                  onChange={() => toggleBloqueSeleccionado(b.bloque_id)}
                />
                {b.seleccionado && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    {PERMISOS.map((p) => (
                      <Checkbox
                        key={p.key}
                        label={p.label}
                        checked={b[p.key]}
                        onChange={() => toggleBloquePermiso(b.bloque_id, p.key)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={cerrarBloques}>Cancelar</Button>
            <Button onClick={guardarBloques} disabled={actualizarBloques.isPending}>
              {actualizarBloques.isPending ? 'Guardando...' : 'Guardar bloques'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
