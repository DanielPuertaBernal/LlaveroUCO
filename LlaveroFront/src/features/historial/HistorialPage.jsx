import { useState } from 'react';
import DataTable from '@/shared/components/DataTable';
import { useHistorialLlaves, useDevolverLlave } from '@/features/llaves/llavesApi';
import { useUbicacionesOperativas } from '@/shared/hooks/useUbicacionesOperativas';
import { UBICACIONES } from '@/shared/constants';
import Swal from '@/shared/lib/swal';
import { BarChart3, FileDown, Trash2 } from 'lucide-react';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import dayjs from 'dayjs';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';

export default function HistorialPage() {
  const [filters, setFilters] = useState({ fecha: new Date().toISOString().slice(0, 10), estado: '' });
  const { data: registros = [], isLoading, refetch } = useHistorialLlaves(filters);
  const { getUbicacionLabel } = useUbicacionesOperativas();
  const devolverLlave = useDevolverLlave();

  function textoReclamoATiempo(v) {
    return v ? 'Si' : 'No';
  }

  function textoTipoEntrega(v) {
    if (v === 'manual') return 'Manual';
    if (v === 'carnet') return 'Carnet NFC';
    return '—';
  }

  function abrirDetalles(row) {
    const quienLabel = row.quienReclama === 'monitor' ? 'Monitor' : row.quienReclama === 'docente' ? 'Docente' : row.quienReclama === 'otra_persona' ? 'Otra persona' : '';
    const reclamaInfo = [quienLabel, row.nombreReclama].filter(Boolean).join(' — ') || '—';
    const correoReclama = row.correoReclama || '—';
    const contactoReclama = row.numeroContactoReclama || '—';

    Swal.fire({
      title: 'Detalles del registro',
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.9">
          <b>Materia / Motivo:</b> ${row.materia || '—'}<br/>
          <b>Docente:</b> ${row.docente || '—'}<br/>
          <b>Documento:</b> ${row.documento || '—'}<br/>
          <b>Ubic. Préstamo:</b> ${getUbicacionLabel(row.ubicacionPrestamo)}<br/>
          <b>Ubic. Devolución:</b> ${getUbicacionLabel(row.ubicacionDevolucion)}<br/>
          <b>Duración:</b> ${row.duracion || '—'}<br/>
          <b>Reclamo a tiempo:</b> ${textoReclamoATiempo(row.seReclamoATiempo)}<br/>
          <b>Tiempo Retraso:</b> ${row.tiempoRetraso || '—'}<br/>
          <b>Tipo Entrega:</b> ${textoTipoEntrega(row.tipoEntrega)}<br/>
          <hr style="margin:8px 0;border-color:hsl(var(--border))"/>
          <b>Reclamó:</b> ${reclamaInfo}<br/>
          <b>Correo:</b> ${correoReclama}<br/>
          <b>Contacto:</b> ${contactoReclama}
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'Cerrar',
    });
  }

  async function handleDevolucion(row) {
    const result = await Swal.fire({
      title: 'Registrar devolución',
      html: `
        <div style="text-align:left;font-size:14px;line-height:2">
          <b>Docente:</b> ${row.docente ?? '—'}<br/>
          <b>Documento:</b> ${row.documento ?? '—'}<br/>
          <b>Aula:</b> ${row.aula ?? '—'}<br/>
          <b>Horario:</b> ${row.horario ?? '—'}<br/>
          <b>Materia:</b> ${row.materia ?? '—'}<br/>
          <b>Ubicación devolución:</b> ${getUbicacionLabel(UBICACIONES.OFICINA)}<br/>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, devolver',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;
    try {
      await devolverLlave.mutateAsync({ documento: row.documento, ubicacion: UBICACIONES.OFICINA });
      Swal.fire({ icon: 'success', title: 'Devolución registrada', timer: 1800, showConfirmButton: false });
      refetch();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo registrar la devolución' });
    }
  }

  const COLS = [
    { key: 'materia', label: 'Materia / Motivo' },
    { key: 'docente', label: 'Docente' },
    { key: 'aula', label: 'Aula' },
    { key: 'horario', label: 'Horario' },
    { key: 'fechaEntrega', label: 'F. Entrega' },
    { key: 'horaEntrega', label: 'H. Entrega' },
    { key: 'fechaDevolucion', label: 'F. Devolución' },
    { key: 'horaDevolucion', label: 'H. Devolución' },
    {
      key: 'estado',
      label: 'Estado',
      render: (v, row) => {
        const badge = (
          <StatusBadge variant={
            v === 'en_prestamo' ? 'warning'
            : v === 'en_mora' ? 'orange'
            : v === 'demora_entrega' ? 'danger'
            : 'success'
          }>
            {v === 'en_prestamo' ? 'En Préstamo' : v === 'en_mora' ? 'En Mora' : v === 'demora_entrega' ? 'Entrega en mora' : 'Entregado'}
          </StatusBadge>
        );
        if (v === 'en_prestamo' || v === 'en_mora' || v === 'demora_entrega') {
          return (
            <button
              title="Registrar devolución"
              onClick={(e) => { e.stopPropagation(); handleDevolucion(row); }}
              className="cursor-pointer hover:opacity-75 transition-opacity"
            >
              {badge}
            </button>
          );
        }
        return badge;
      },
    },
  ];

  async function handleExport() {
    const XLSX = await import('xlsx');
    const quienLabel = (v) => v === 'docente' ? 'Docente' : v === 'monitor' ? 'Monitor' : v === 'otra_persona' ? 'Otra persona' : '';
    const reclamaAtLabel = (v) => (v ? 'Sí' : 'No');
    const tipoEntregaLabel = (v) => (v === 'manual' ? 'Manual' : v === 'carnet' ? 'Carnet NFC' : '');

    const data = registros.map((r) => ({
      'Materia / Motivo': r.materia || '',
      'Docente': r.docente || '',
      'Documento': r.documento || '',
      'Aula': r.aula || '',
      'Horario': r.horario || '',
      'Fecha Entrega': r.fechaEntrega || '',
      'Hora Entrega': r.horaEntrega || '',
      'Fecha Devolución': r.fechaDevolucion || '',
      'Hora Devolución': r.horaDevolucion || '',
      'Duración': r.duracion || '',
      'Ubic. Préstamo': getUbicacionLabel(r.ubicacionPrestamo),
      'Ubic. Devolución': getUbicacionLabel(r.ubicacionDevolucion),
      'Reclamo a tiempo': reclamaAtLabel(r.seReclamoATiempo),
      'Tiempo Retraso': r.tiempoRetraso || '',
      'Tipo Entrega': tipoEntregaLabel(r.tipoEntrega),
      'Quién Reclamó': quienLabel(r.quienReclama),
      'Nombre Reclamó': r.nombreReclama || '',
      'Correo Reclamó': r.correoReclama || '',
      'Contacto Reclamó': r.numeroContactoReclama || '',
      'Estado': r.estado || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    XLSX.writeFile(wb, 'historial_llaves.xlsx');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Registro Entrega de Llaves
          </h1>
          <p className="text-muted-foreground text-sm">{registros.length} registros</p>
        </div>
        <Button variant="success" onClick={handleExport}>
          <FileDown className="h-4 w-4 mr-1" />Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-4 flex gap-4 flex-wrap">
        <FormField label="Fecha">
          <MobileDatePicker
            value={filters.fecha ? dayjs(filters.fecha) : null}
            onChange={(v) => setFilters((f) => ({ ...f, fecha: v ? v.format('YYYY-MM-DD') : '' }))}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </FormField>
        <FormField label="Estado">
          <Select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="en_prestamo">En Préstamo</option>
            <option value="en_mora">En Mora</option>
            <option value="entregado">Entregado</option>
            <option value="demora_entrega">Entrega en mora</option>
          </Select>
        </FormField>
        <div className="flex items-end">
          <button
            onClick={() => { setFilters({ fecha: '', estado: '' }); }}
            title="Limpiar filtros"
            className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <DataTable columns={COLS} data={registros} loading={isLoading} searchable exportable exportFileName="historial" onRowClick={abrirDetalles} extraSearchKeys={['documento']} />
      <p className="text-xs text-muted-foreground text-center">Clic en una fila para ver detalles completos</p>
    </div>
  );
}
