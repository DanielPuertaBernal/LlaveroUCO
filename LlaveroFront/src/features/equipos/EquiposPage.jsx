import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import Swal from '@/shared/lib/swal';
import DataTable from '@/shared/components/DataTable';
import {
  useEquipos,
  useCrearEquipo,
  useActualizarEquipo,
  useEliminarEquipo,
} from './equiposApi';
import { usePrestamosAbiertos } from '@/features/prestamos/prestamosApi';
import { showSuccess, showError, showConfirm } from '@/shared/utils/alert';
import { Monitor, Pencil, Trash2, Download } from 'lucide-react';
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

function sanitizeFileName(name) {
  return String(name || 'barcode').replace(/[^a-zA-Z0-9-_]/g, '_');
}

function buildBarcodeCanvas(codigo) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, codigo, {
    format: 'CODE128',
    displayValue: true,
    fontSize: 16,
    height: 70,
    width: 2,
    margin: 10,
  });
  return canvas;
}

export default function EquiposPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [equipoEditando, setEquipoEditando] = useState(null);

  const { data: equipos = [], isLoading } = useEquipos();
  const { data: prestamosAbiertos = [] } = usePrestamosAbiertos();
  const crear = useCrearEquipo();
  const actualizar = useActualizarEquipo();
  const eliminar = useEliminarEquipo();

  const equiposConEstado = useMemo(() => {
    const prestadoPorEquipo = new Map();

    for (const prestamo of prestamosAbiertos) {
      for (const eq of prestamo.equipos || []) {
        if (eq.estado_equipo !== 'entregado') continue;
        const id = String(eq.equipo_id || '');
        if (!id) continue;
        if (!prestadoPorEquipo.has(id)) {
          prestadoPorEquipo.set(id, prestamo.docente_nombre || 'Docente');
        }
      }
    }

    return equipos.map((eq) => {
      const docentePrestamo = prestadoPorEquipo.get(String(eq._id));
      return {
        ...eq,
        estado_operativo: docentePrestamo ? 'en_prestamo' : 'activo',
        docente_prestamo: docentePrestamo || '',
      };
    });
  }, [equipos, prestamosAbiertos]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      nombre: '',
      marca: '',
      consecutivo: '',
      codigo_inventario: '',
      descripcion: '',
      estado: 'activo',
    },
  });

  function abrirNuevo() {
    setEquipoEditando(null);
    reset({
      nombre: '',
      marca: '',
      consecutivo: '',
      codigo_inventario: '',
      descripcion: '',
      estado: 'activo',
    });
    setSheetOpen(true);
  }

  function abrirEdicion(equipo) {
    setEquipoEditando(equipo);
    reset({
      nombre: equipo.nombre || '',
      marca: equipo.marca || '',
      consecutivo: equipo.consecutivo ?? '',
      codigo_inventario: equipo.codigo_inventario || '',
      descripcion: equipo.descripcion || '',
      estado: equipo.estado || 'activo',
    });
    setSheetOpen(true);
  }

  function cerrarSheet() {
    setSheetOpen(false);
    setEquipoEditando(null);
    reset({
      nombre: '',
      marca: '',
      consecutivo: '',
      codigo_inventario: '',
      descripcion: '',
      estado: 'activo',
    });
  }

  async function onGuardar(data) {
    try {
      const payload = {
        nombre: data.nombre,
        marca: data.marca || '',
        consecutivo: data.consecutivo,
        codigo_inventario: data.codigo_inventario,
        descripcion: data.descripcion || '',
      };

      if (equipoEditando) {
        await actualizar.mutateAsync({
          id: equipoEditando._id,
          ...payload,
          estado: data.estado,
        });
        showSuccess('Equipo actualizado correctamente');
      } else {
        await crear.mutateAsync(payload);
        showSuccess('Equipo registrado correctamente');
      }

      cerrarSheet();
    } catch (err) {
      showError(err.response?.data?.message || 'No se pudo guardar el equipo');
    }
  }

  async function onEliminar(equipo) {
    const confirm = await showConfirm(
      'Eliminar equipo',
      `¿Seguro que desea eliminar el equipo ${equipo.nombre}?`
    );
    if (!confirm.isConfirmed) return;

    try {
      await eliminar.mutateAsync(equipo._id);
      showSuccess('Equipo eliminado correctamente');
      if (equipoEditando?._id === equipo._id) {
        cerrarSheet();
      }
    } catch (err) {
      showError(err.response?.data?.message || 'No se pudo eliminar el equipo');
    }
  }

  function onDescargarPng(equipo) {
    try {
      const canvas = buildBarcodeCanvas(equipo.codigo_barras);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${sanitizeFileName(equipo.codigo_barras)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      showError('No se pudo generar el PNG del código de barras');
    }
  }

  function onDescargarPdf(equipo) {
    try {
      const canvas = buildBarcodeCanvas(equipo.codigo_barras);
      const imgData = canvas.toDataURL('image/png');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text(`Equipo: ${equipo.nombre}`, 20, 20);
      doc.setFontSize(11);
      doc.text(`Codigo de barras: ${equipo.codigo_barras}`, 20, 28);

      const maxWidth = 170;
      const imgHeight = (canvas.height * maxWidth) / canvas.width;
      doc.addImage(imgData, 'PNG', 20, 34, maxWidth, imgHeight);
      doc.save(`${sanitizeFileName(equipo.codigo_barras)}.pdf`);
    } catch {
      showError('No se pudo generar el PDF del código de barras');
    }
  }

  async function onExportarBarcode(equipo) {
    const result = await Swal.fire({
      title: 'Exportar código de barras',
      text: `Seleccione el formato para ${equipo.nombre}`,
      icon: 'question',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'PNG',
      denyButtonText: 'PDF',
      cancelButtonText: 'Cancelar',
      denyButtonColor: '#7c3aed',
    });

    if (result.isConfirmed) {
      onDescargarPng(equipo);
      return;
    }

    if (result.isDenied) {
      onDescargarPdf(equipo);
    }
  }

  const columns = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'marca', label: 'Marca' },
    { key: 'codigo_inventario', label: 'Código Inventario' },
    { key: 'codigo_barras', label: 'Código Barras' },
    { key: 'consecutivo', label: 'Consecutivo' },
    {
      key: 'estado',
      label: 'Estado',
      render: (_v, row) => (
        <div className="flex flex-col items-center gap-1">
          <StatusBadge variant={row.estado_operativo === 'en_prestamo' ? 'orange' : 'success'}>
            {row.estado_operativo === 'en_prestamo' ? 'en préstamo' : 'activo'}
          </StatusBadge>
          {row.docente_prestamo && (
            <span className="text-xs text-muted-foreground leading-tight">
              {row.docente_prestamo}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'acciones',
      label: 'Acciones',
      className: 'whitespace-nowrap',
      render: (_v, row) => (
        <div className="inline-flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => abrirEdicion(row)} title="Editar equipo">
            <Pencil className="h-3.5 w-3.5 mr-1" />Editar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onEliminar(row)} title="Eliminar equipo">
            <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onExportarBarcode(row)} title="Exportar código de barras">
            <Download className="h-3.5 w-3.5 mr-1" />Exportar
          </Button>
        </div>
      ),
    },
  ];

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Monitor className="h-6 w-6" />
            Inventario
          </h1>
          <p className="text-muted-foreground text-sm">{equipos.length} equipos en inventario</p>
        </div>
        <Button onClick={abrirNuevo}>
          + Nuevo Equipo
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={equiposConEstado}
        loading={isLoading}
        searchable
        exportable
        exportFileName="equipos"
      />

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) cerrarSheet(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{equipoEditando ? 'Editar equipo' : 'Registrar nuevo equipo'}</SheetTitle>
            <SheetDescription>
              {equipoEditando ? 'Modifica los datos del equipo.' : 'Completa los datos para registrar un nuevo equipo en inventario.'}
            </SheetDescription>
          </SheetHeader>

          <div className="overflow-y-auto flex-1 pr-1">
            <form id="equipo-form" onSubmit={handleSubmit(onGuardar)} className="space-y-3 pt-2">
              <FormField label="Nombre del equipo" required error={errors.nombre?.message}>
                <Input {...register('nombre', { required: 'Nombre del equipo es requerido' })} />
              </FormField>

              <FormField label="Marca">
                <Input {...register('marca')} />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Consecutivo" required error={errors.consecutivo?.message}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    {...register('consecutivo', { required: 'Consecutivo es requerido' })}
                  />
                </FormField>
                <FormField label="Código de inventario" error={errors.codigo_inventario?.message}>
                  <Input {...register('codigo_inventario')} />
                </FormField>
              </div>

              {equipoEditando && (
                <FormField label="Estado">
                  <Select {...register('estado')}>
                    <option value="activo">activo</option>
                    <option value="inactivo">inactivo</option>
                    <option value="mantenimiento">mantenimiento</option>
                  </Select>
                </FormField>
              )}

              <FormField label="Descripción">
                <Input {...register('descripcion')} />
              </FormField>
            </form>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={cerrarSheet}>
              Cancelar
            </Button>
            <Button type="submit" form="equipo-form" disabled={guardando}>
              {guardando ? 'Guardando...' : equipoEditando ? 'Guardar cambios' : 'Registrar equipo'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
