import { useState, useRef, useEffect } from 'react';
import DataTable from '@/shared/components/DataTable';
import { useComunidad, useCrearPersona, useActualizarPersona, useEliminarPersona } from './comunidadApi';
import { Users, Pencil, Trash2, UserPlus } from 'lucide-react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/shared/components/ui/Sheet';
import { showSuccess, showError, showConfirm } from '@/shared/utils/alert';

function AutocompleteInput({ value, onChange, options = [], placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-auto py-1">
          {filtered.map((o) => (
            <li
              key={o}
              onMouseDown={() => { onChange(o); setOpen(false); }}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-muted transition-colors"
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TIPO_VARIANTE = {
  docente: 'info',
  estudiante: 'success',
  empleado: 'warning',
};

const COLUMNAS = [
  { key: 'numero_documento', label: 'Documento' },
  { key: 'nombre', label: 'Nombre' },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (value) => (
      <StatusBadge variant={TIPO_VARIANTE[value] || 'neutral'}>
        {value}
      </StatusBadge>
    ),
  },
  { key: 'facultad', label: 'Facultad', className: 'whitespace-normal max-w-[200px]' },
  { key: 'correo', label: 'Correo' },
  { key: 'numero_contacto', label: 'Contacto' },
  { key: 'id_carnet', label: 'ID Carnet' },
];

export default function ComunidadPage() {
  const { data: personas = [], isLoading } = useComunidad();
  const crearPersona = useCrearPersona();
  const actualizarPersona = useActualizarPersona();
  const eliminarPersona = useEliminarPersona();

  const facultadesUnicas = [...new Set(
    personas.map((p) => p.facultad).filter(Boolean)
  )].sort();

  const [sheet, setSheet] = useState({ open: false, modo: 'editar', data: null });
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});

  function abrirEditar(persona) {
    setErrors({});
    setForm({
      numero_documento: persona.numero_documento || '',
      nombre: persona.nombre || '',
      tipo: persona.tipo || '',
      facultad: persona.facultad || '',
      correo: persona.correo || '',
      id_carnet: persona.id_carnet || '',
      numero_contacto: persona.numero_contacto || '',
    });
    setSheet({ open: true, modo: 'editar', data: persona });
  }

  function abrirRegistrar() {
    setErrors({});
    setForm({ numero_documento: '', nombre: '', tipo: '', facultad: '', correo: '', id_carnet: '', numero_contacto: '' });
    setSheet({ open: true, modo: 'crear', data: null });
  }

  function cerrarSheet() {
    setSheet({ open: false, modo: 'editar', data: null });
    setForm({});
    setErrors({});
  }

  async function guardarPersona() {
    const errs = {};
    if (sheet.modo === 'crear' && !form.numero_documento?.trim()) errs.numero_documento = 'El documento es requerido';
    if (sheet.modo === 'crear' && form.numero_documento?.trim() && !/^\d+$/.test(form.numero_documento.trim())) errs.numero_documento = 'Solo se permiten números';
    if (!form.nombre?.trim()) errs.nombre = 'El nombre es requerido';
    if (!form.tipo?.trim()) errs.tipo = 'Seleccione un tipo';
    if (form.numero_contacto?.trim() && !/^\d+$/.test(form.numero_contacto.trim())) errs.numero_contacto = 'Solo se permiten números';
    if (form.correo?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim())) errs.correo = 'Correo no válido (ej: usuario@dominio.com)';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    try {
      if (sheet.modo === 'crear') {
        await crearPersona.mutateAsync({
          numero_documento: form.numero_documento.trim(),
          nombre: form.nombre.trim(),
          tipo: form.tipo,
          facultad: form.facultad.trim(),
          correo: form.correo.trim(),
          id_carnet: form.id_carnet.trim(),
          numero_contacto: form.numero_contacto?.trim() || '',
        });
        showSuccess('Persona registrada correctamente');
      } else {
        await actualizarPersona.mutateAsync({
          id: sheet.data._id,
          nombre: form.nombre.trim(),
          tipo: form.tipo,
          facultad: form.facultad.trim(),
          correo: form.correo.trim(),
          id_carnet: form.id_carnet.trim(),
          numero_contacto: form.numero_contacto?.trim() || '',
        });
        showSuccess('Persona actualizada correctamente');
      }
      cerrarSheet();
    } catch (e) {
      showError(e.response?.data?.message || 'Error al guardar');
    }
  }

  async function onEliminar(persona) {
    const { isConfirmed } = await showConfirm(
      'Eliminar persona',
      `¿Desea eliminar a ${persona.nombre} (${persona.numero_documento})?`
    );
    if (!isConfirmed) return;
    try {
      await eliminarPersona.mutateAsync(persona._id);
      showSuccess('Persona eliminada correctamente');
    } catch (e) {
      showError(e.response?.data?.message || 'Error al eliminar');
    }
  }

  const COLUMNAS_CON_ACCIONES = [
    ...COLUMNAS,
    {
      key: '_acciones',
      label: 'Acciones',
      className: 'text-center',
      render: (_v, row) => (
        <div className="flex gap-1 justify-center">
          <button
            onClick={() => abrirEditar(row)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onEliminar(row)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6" />
            Comunidad
          </h1>
          <p className="text-muted-foreground text-sm">{personas.length} personas registradas</p>
        </div>
        <Button onClick={abrirRegistrar} className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Registrar persona
        </Button>
      </div>

      <DataTable
        columns={COLUMNAS_CON_ACCIONES}
        data={personas}
        loading={isLoading}
        searchable
        exportable
        exportFileName="comunidad"
      />

      <Sheet open={sheet.open} onOpenChange={(v) => !v && cerrarSheet()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{sheet.modo === 'crear' ? 'Registrar persona' : 'Editar persona'}</SheetTitle>
            {sheet.modo === 'editar' && (
              <SheetDescription>
                Documento: <strong>{sheet.data?.numero_documento}</strong>
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="grid grid-cols-2 gap-4">
            {sheet.modo === 'crear' && (
              <FormField label="Número de documento" required error={errors.numero_documento} className="col-span-2">
                <Input
                  placeholder="Solo dígitos"
                  inputMode="numeric"
                  value={form.numero_documento || ''}
                  onChange={(e) => setForm({ ...form, numero_documento: e.target.value.replace(/\D/g, '') })}
                />
              </FormField>
            )}

            <FormField label="Nombre" required error={errors.nombre} className="col-span-2">
              <Input
                placeholder="Nombre completo"
                value={form.nombre || ''}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </FormField>

            <FormField label="Tipo" required error={errors.tipo}>
              <Select
                value={form.tipo || ''}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                <option value="">Seleccione...</option>
                <option value="docente">Docente</option>
                <option value="estudiante">Estudiante</option>
                <option value="empleado">Empleado</option>
              </Select>
            </FormField>

            <FormField label="ID Carnet">
              <Input
                placeholder="ID NFC"
                value={form.id_carnet || ''}
                onChange={(e) => setForm({ ...form, id_carnet: e.target.value })}
              />
            </FormField>

            <FormField label="Facultad" className="col-span-2">
              <AutocompleteInput
                placeholder="Facultad o dependencia"
                value={form.facultad || ''}
                onChange={(val) => setForm({ ...form, facultad: val })}
                options={facultadesUnicas}
              />
            </FormField>

            <FormField label="Correo" className="col-span-2" error={errors.correo}>
              <Input
                type="email"
                placeholder="correo@ejemplo.com"
                value={form.correo || ''}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
              />
            </FormField>

            <FormField label="Número de contacto" className="col-span-2" error={errors.numero_contacto}>
              <Input
                inputMode="numeric"
                placeholder="Solo dígitos"
                value={form.numero_contacto || ''}
                onChange={(e) => setForm({ ...form, numero_contacto: e.target.value.replace(/\D/g, '') })}
              />
            </FormField>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={cerrarSheet}>Cancelar</Button>
            <Button onClick={guardarPersona} disabled={crearPersona.isPending || actualizarPersona.isPending}>
              {(crearPersona.isPending || actualizarPersona.isPending) ? 'Guardando...' : sheet.modo === 'crear' ? 'Registrar' : 'Actualizar'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
