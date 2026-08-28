import { useState } from 'react';
import Swal from '@/shared/lib/swal';
import { Trash2, PlusCircle } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import { FormField, Input } from '@/shared/components/ui/FormField';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/Sheet';
import { sinHTML } from '@/shared/utils/inputValidation';
import {
  useElementosAfectados,
  useCrearElementoAfectado,
  useActualizarElementoAfectado,
  useEliminarElementoAfectado,
} from './elementosAfectadosApi';

/** Derives the stable catalog key from the display name, matching the backend's normalizeKey. */
function claveDesdeNombre(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function ElementosAfectadosSheet({ open, onOpenChange }) {
  const [nombre, setNombre] = useState('');
  const { data: elementos = [], isLoading } = useElementosAfectados({ incluirInactivos: true });
  const crear = useCrearElementoAfectado();
  const actualizar = useActualizarElementoAfectado();
  const eliminar = useEliminarElementoAfectado();

  async function handleCrear() {
    const limpio = sinHTML(nombre).trim();
    if (limpio.length < 2) {
      return Swal.fire({ icon: 'warning', title: 'El nombre es muy corto' });
    }
    const clave = claveDesdeNombre(limpio);
    if (!clave) {
      return Swal.fire({ icon: 'warning', title: 'El nombre debe tener al menos una letra o número' });
    }
    try {
      // Sits after every seeded element (orden 999 is "Otro") so new entries
      // do not push the common ones down the Select.
      await crear.mutateAsync({ clave, nombre: limpio, orden: 1000 });
      setNombre('');
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo crear' });
    }
  }

  async function handleToggleActivo(elemento) {
    try {
      await actualizar.mutateAsync({ id: elemento.id, activo: !elemento.activo });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo actualizar' });
    }
  }

  async function handleEliminar(elemento) {
    const { isConfirmed } = await Swal.fire({
      icon: 'warning',
      title: `¿Eliminar "${elemento.nombre}"?`,
      text: 'Si alguna novedad lo usa, no se podrá eliminar. En ese caso desactivalo para que deje de aparecer en el formulario sin romper el histórico.',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;
    try {
      await eliminar.mutateAsync(elemento.id);
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo eliminar',
        text: err.response?.data?.message ?? 'El elemento está en uso por una o más novedades',
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Elementos afectados</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Catálogo de lo que puede dañarse en un aula. Se usa para agrupar las novedades y
            contar cuántas unidades de cada elemento están afectadas.
          </p>

          <div className="flex gap-2 items-end">
            <FormField label="Nuevo elemento" className="flex-1">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCrear(); }}
                placeholder="Ej: Persiana, Ventilador..."
              />
            </FormField>
            <Button onClick={handleCrear} disabled={crear.isPending}>
              <PlusCircle className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          </div>

          <div className="border border-border rounded-lg divide-y divide-border max-h-[60vh] overflow-y-auto">
            {isLoading && <p className="p-3 text-sm text-muted-foreground">Cargando...</p>}
            {!isLoading && elementos.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No hay elementos registrados</p>
            )}
            {elementos.map((el) => (
              <div key={el.id} className="flex items-center gap-2 p-3">
                <span className="flex-1 text-sm text-foreground">{el.nombre}</span>
                <button type="button" onClick={() => handleToggleActivo(el)} title={el.activo ? 'Desactivar' : 'Activar'}>
                  <StatusBadge variant={el.activo ? 'success' : 'default'}>
                    {el.activo ? 'Activo' : 'Inactivo'}
                  </StatusBadge>
                </button>
                <button
                  type="button"
                  onClick={() => handleEliminar(el)}
                  title="Eliminar"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
