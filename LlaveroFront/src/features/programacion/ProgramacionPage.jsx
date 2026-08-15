import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '@/shared/components/DataTable';
import FileUploader from '@/shared/components/FileUploader';
import { useAuthStore } from '@/features/auth/authStore';
import { ROLES } from '@/shared/constants';
import {
  useProgramacion,
  useProgramacionDia,
  useImportarProgramacion,
  useSemestres,
  useSemestreVigente,
  useEliminarSemestre,
  useActualizarFechasSemestre,
  useReservasSemestrales,
  useImportarReservasSemestrales,
  useEliminarReservasSemestrales,
  useEliminarReservaIndividual,
  programacionApi,
} from './programacionApi';
import { useEntregarLlave } from '@/features/llaves/llavesApi';
import { abrirBuscadorPersonaPorNombre } from '@/shared/utils/personaSearchHotkey';
import EditarClaseDialog from './EditarClaseDialog';
import Swal from '@/shared/lib/swal';
import { showSuccess, showError } from '@/shared/utils/alert';
import { CalendarDays, Key, ChevronLeft, BookOpen, Trash2, Pencil, Upload, FileDown, PenSquare } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { FormField, Input } from '@/shared/components/ui/FormField';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/shared/components/ui/Dialog';
import { cn } from '@/shared/lib/utils';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const COLUMNAS_BASE = [
  { key: 'grupo', label: 'Grupo' },
  { key: 'codigo_materia', label: 'Código' },
  { key: 'docente', label: 'Docente' },
  { key: 'dia', label: 'Día' },
  { key: 'horario', label: 'Horario' },
  { key: 'aula', label: 'Aula' },
  { key: 'materia', label: 'Materia', className: 'whitespace-normal max-w-[200px]' },
];

/** Formatea una fecha ISO a "dd/mm/yyyy" */
function formatFecha(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Convierte una fecha ISO a "YYYY-MM-DD" para inputs type=date */
function fechaToInput(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Vista de tabla para un semestre específico (admin drilldown o aux vigente)
// ---------------------------------------------------------------------------
function VistaSemestre({ semestre, onVolver, isAdmin }) {
  const navigate = useNavigate();
  const DAY_TO_DIA = { 0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };
  const today = DAY_TO_DIA[new Date().getDay()] || 'Lunes';
  const [vistaCompleta, setVistaCompleta] = useState(false);
  const [diaSeleccionado, setDiaSeleccionado] = useState(today);
  const [activeTab, setActiveTab] = useState('clases');
  const [detailRow, setDetailRow] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const fileInputReservasRef = useRef(null);

  const { data: completa = [], isLoading: loadingCompleta } = useProgramacion(semestre.codigo);
  const { data: porDiaData, isLoading: loadingDia } = useProgramacionDia(
    vistaCompleta ? null : diaSeleccionado,
    semestre.codigo
  );
  const clasesPorDia = porDiaData?.clases ?? [];
  const reservasSemestralesDelDia = porDiaData?.reservasSemestrales ?? [];

  // Reservas semestrales del semestre (para pestaña admin)
  const { data: todasReservas = [], isLoading: loadingReservas } = useReservasSemestrales(
    semestre.codigo
  );
  const importarReservas = useImportarReservasSemestrales();
  const eliminarReservas = useEliminarReservasSemestrales();
  const eliminarReservaIndividual = useEliminarReservaIndividual(semestre.codigo);

  const entregarLlave = useEntregarLlave();

  const registros = vistaCompleta ? completa : clasesPorDia;
  const loading = vistaCompleta ? loadingCompleta : loadingDia;

  // Reservas filtradas por día en la vista admin
  const reservasFiltradas = vistaCompleta
    ? todasReservas
    : todasReservas.filter((r) => r.dia === diaSeleccionado);

  async function handleEntregarDesdeTabla(clase) {
    // Paso 1: ¿quién recibe?
    const { isConfirmed: esDocente, isDenied: esOtra } = await Swal.fire({
      title: 'Entregar llave',
      html: `<div style="text-align:left;font-size:14px;line-height:2">
          <b>Docente:</b> ${clase.docente || '—'}<br/>
          <b>Materia:</b> ${clase.materia || '—'}<br/>
          <b>Aula:</b> ${clase.aula || '—'}
        </div>
        <p style="margin-top:12px;font-weight:600">¿Quién recibe la llave?</p>`,
      icon: 'question',
      showConfirmButton: true,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'El docente',
      denyButtonText: 'Otra persona',
      cancelButtonText: 'Cancelar',
      customClass: { popup: 'aulosync-f1' },
    });

    if (!esDocente && !esOtra) return;

    let receptor = null;
    let numeroContacto = '';

    if (esOtra) {
      // Paso 2: F1 buscador
      receptor = await abrirBuscadorPersonaPorNombre({
        titulo: 'Seleccionar quien recibe la llave',
        placeholder: 'Escribe nombre de quien recibe',
      });
      if (!receptor) return;

      // Paso 3: número de contacto — omitir si el receptor ya tiene uno registrado
      if (receptor.numero_contacto) {
        numeroContacto = receptor.numero_contacto;
      } else {
        const { value: contacto, isConfirmed } = await Swal.fire({
          title: 'Número de contacto',
          html: `<p style="font-size:13px;margin-bottom:8px">Receptor: <b>${receptor.nombre}</b></p>
                 <input id="swal-contacto" type="tel" inputmode="numeric" class="swal2-input" placeholder="Número de contacto (opcional)" style="width:80%">`,
          showCancelButton: true,
          confirmButtonText: 'Registrar entrega',
          cancelButtonText: 'Cancelar',
          customClass: { popup: 'aulosync-f1' },
          didOpen: () => document.getElementById('swal-contacto')?.focus(),
          preConfirm: () => document.getElementById('swal-contacto')?.value?.trim() || '',
        });
        if (!isConfirmed) return;
        numeroContacto = contacto || '';
      }
    }

    // Paso 4: registrar entrega
    try {
      await entregarLlave.mutateAsync({
        nroidenti: clase.numero_documento,
        profesor: clase.docente,
        aula: clase.aula,
        facultad: clase.facultad || '',
        hora_inicio: clase.hora_inicio || '',
        hora_fin: clase.hora_fin || '',
        motivo: clase.materia || '',
        origen: clase.tipo === 'semestral' ? 'reserva_semestral' : 'programacion',
        quien_reclama: esDocente ? 'docente' : 'otra_persona',
        ...(receptor && {
          numero_documento_reclama: receptor.numero_documento || '',
          nombre_reclama: receptor.nombre || '',
        }),
        numero_contacto: numeroContacto,
      });
      showSuccess(`Llave entregada a ${receptor ? receptor.nombre : clase.docente}`);
    } catch (err) {
      showError(err.response?.data?.message || 'Error al entregar la llave');
    }
  }

  async function handleEliminarReserva(row) {
    const confirm = await Swal.fire({
      title: '¿Eliminar esta franja?',
      html: `<div style="text-align:left;font-size:14px;line-height:2">
          <b>Responsable:</b> ${row.docente || '—'}<br/>
          <b>Materia:</b> ${row.materia || '—'}<br/>
          <b>Día:</b> ${row.dia || '—'}<br/>
          <b>Horario:</b> ${row.horario || '—'}<br/>
          <b>Aula:</b> ${row.aula || '—'}
        </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirm.isConfirmed) return;
    try {
      const id = row._id ?? row.id;
      await eliminarReservaIndividual.mutateAsync(id);
      showSuccess('Franja eliminada');
    } catch (err) {
      showError(err.response?.data?.message || 'Error al eliminar la franja');
    }
  }

  function handleEditarReserva(row) {
    // Reunir todas las franjas del grupo desde todasReservas
    const franjas = row.grupo_id
      ? todasReservas.filter((r) => r.grupo_id === row.grupo_id)
      : [row];
    // Usar la primera franja como referencia de los datos del encabezado
    const primera = franjas[0] || row;
    navigate('/reservas-semestrales', {
      state: {
        editData: {
          _id: primera._id,
          grupo_id: primera.grupo_id,
          semestre: primera.semestre,
          numero_documento: primera.numero_documento,
          docente: primera.docente,
          tipo_solicitante: primera.tipo_solicitante || 'docente',
          responsable_documento: primera.responsable_documento || '',
          responsable_nombre: primera.responsable_nombre || '',
          materia: primera.materia,
          franjas,
        },
      },
    });
  }

  function handleImportarReservas(file) {
    importarReservas.mutate({ codigo: semestre.codigo, file }, {
      onSuccess: (res) => showSuccess(res.data?.message || 'Reservas importadas'),
      onError: (err) => showError(err.response?.data?.message || 'Error al importar'),
    });
  }

  async function handleExportarSemestre() {
    try {
      const res = await programacionApi.exportar(semestre.codigo);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `programacion_${semestre.codigo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showError('Error al exportar la programación');
    }
  }

  async function handleExportarReservasSemestrales() {
    try {
      const res = await programacionApi.exportarSemestrales(semestre.codigo);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reservas_semestrales_${semestre.codigo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showError('Error al exportar las reservas semestrales');
    }
  }

  const COLUMNAS_RESERVAS = [
    { key: 'numero_documento', label: 'Documento' },
    { key: 'docente', label: 'Responsable' },
    { key: 'dia', label: 'Día', render: (v) => String(v || '').toUpperCase() },
    { key: 'horario', label: 'Horario' },
    { key: 'aula', label: 'Aula' },
    { key: 'materia', label: 'Materia', className: 'whitespace-normal max-w-[200px]' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={onVolver} className="gap-1">
              <ChevronLeft className="h-4 w-4" />Semestres
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="h-6 w-6" />
              Programación — Semestre {semestre.codigo}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatFecha(semestre.fecha_inicio)} al {formatFecha(semestre.fecha_fin)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'clases' && (
            <Button variant="outline" onClick={handleExportarSemestre}>
              <FileDown className="h-4 w-4 mr-1" />Exportar clases
            </Button>
          )}
          {activeTab === 'reservas-semestrales' && (
            <>
              <Button variant="outline" onClick={handleExportarReservasSemestrales}>
                <FileDown className="h-4 w-4 mr-1" />Exportar semestrales
              </Button>
              {isAdmin && (
                <>
                  <input
                    ref={fileInputReservasRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { handleImportarReservas(f); e.target.value = ''; }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputReservasRef.current?.click()}
                    disabled={importarReservas.isPending}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {importarReservas.isPending ? 'Importando…' : 'Importar Excel'}
                  </Button>
                </>
              )}
            </>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => setVistaCompleta((v) => !v)}>
              {vistaCompleta ? 'Ver por día' : 'Ver completa'}
            </Button>
          )}
        </div>
      </div>

      {/* Filtro por día */}
      {!vistaCompleta && (
        <div className="flex gap-2 flex-wrap">
          {DIAS.map((dia) => (
            <button
              key={dia}
              onClick={() => setDiaSeleccionado(dia)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                diaSeleccionado === dia
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-foreground hover:bg-muted'
              )}
            >
              {dia}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {['clases', 'reservas-semestrales'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'clases' ? `Clases (${registros.length + reservasFiltradas.length})` : `Reservas Semestrales (${reservasFiltradas.length})`}
          </button>
        ))}
      </div>

      {/* Tabla de clases (unificada: programacion + semestral) */}
      {activeTab === 'clases' && (
        <DataTable
          columns={[
            {
              key: 'tipo',
              label: 'Tipo',
              render: (v) => v === 'semestral'
                ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium dark:bg-amber-900/30 dark:text-amber-300">Semestral</span>
                : v === 'fantasma'
                  ? <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium dark:bg-purple-900/30 dark:text-purple-300">Fantasma</span>
                  : <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium dark:bg-slate-800 dark:text-slate-300">Clase</span>,
            },
            ...COLUMNAS_BASE,
            {
              key: '_entregar',
              label: 'Llave',
              render: (_v, row) => (
                <Button variant="outline" size="sm" onClick={() => handleEntregarDesdeTabla(row)} disabled={entregarLlave.isPending}>
                  <Key className="h-3.5 w-3.5 mr-1" />Entregar
                </Button>
              ),
            },
          ]}
          data={isAdmin ? [...registros, ...reservasFiltradas] : [...registros, ...reservasSemestralesDelDia]}
          loading={loading}
          searchable
          exportable
          exportFileName={`programacion_${semestre.codigo}`}
          onRowDoubleClick={(row) => setDetailRow(row)}
        />
      )}

      {/* Tabla de reservas semestrales */}
      {activeTab === 'reservas-semestrales' && (
        <DataTable
          columns={[
            ...COLUMNAS_RESERVAS,
            ...(isAdmin ? [{
              key: '_acciones',
              label: 'Acciones',
              render: (_v, row) => (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleEditarReserva(row); }}
                    title="Editar reserva"
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                  >
                    <PenSquare className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleEliminarReserva(row); }}
                    disabled={eliminarReservaIndividual.isPending}
                    title="Eliminar reserva"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            }] : []),
          ]}
          data={reservasFiltradas}
          loading={loadingReservas}
          searchable
          exportable
          exportFileName={`reservas_semestrales_${semestre.codigo}`}
          onRowDoubleClick={(row) => setDetailRow(row)}
        />
      )}

      {/* Sección de reservas semestrales del día (auxiliar) — integrada en la tabla principal */}

      {/* Detail Modal */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del registro</DialogTitle>
          </DialogHeader>
          {detailRow && (() => {
            const fantasmasDeEste = completa
              .filter((r) => r.fantasma_de === detailRow.codigo_materia && r.tipo === 'fantasma' && r.semestre === detailRow.semestre)
              .reduce((acc, r) => {
                const key = `${r.codigo_materia}|${r.grupo}`;
                if (!acc.find((x) => x.key === key)) acc.push({ key, codigo_materia: r.codigo_materia, grupo: r.grupo, materia: r.materia });
                return acc;
              }, []);
            const tipoBadge = detailRow.tipo === 'semestral'
              ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Semestral</span>
              : detailRow.tipo === 'fantasma'
                ? <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Fantasma</span>
                : <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">Clase</span>;
            const F = ({ label, children, span = 1 }) => (
              <div className={span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : ''}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
                <div className="text-sm font-semibold text-foreground">{children}</div>
              </div>
            );
            return (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  <F label="Tipo">{tipoBadge}</F>
                  <F label="Código materia"><span className="font-mono font-semibold">{detailRow.codigo_materia || '—'}</span></F>
                  <F label="Total estudiantes">{detailRow.total_estudiantes ?? detailRow.estudiantes_matriculados ?? '—'}</F>

                  <F label="Documento">{detailRow.numero_documento || '—'}</F>
                  <F label="Docente / Responsable" span={2}>{detailRow.docente || '—'}</F>

                  <F label="Día">{detailRow.dia || '—'}</F>
                  <F label="Horario">{detailRow.horario || '—'}</F>
                  <F label="Aula">{detailRow.aula || '—'}</F>

                  <F label="Materia">{detailRow.materia || '—'}</F>
                  <F label="Facultad">{detailRow.facultad || '—'}</F>

                  {detailRow.observaciones && <F label="Observaciones" span={3}>{detailRow.observaciones}</F>}
                  {detailRow.fantasma_de && <F label="Es fantasma de" span={3}><span className="font-mono font-semibold text-purple-700 dark:text-purple-300">{detailRow.fantasma_de}</span></F>}
                  {detailRow.consecutivo && <F label="Consecutivo">{detailRow.consecutivo}</F>}
                  {detailRow.nombre_bloque && <F label="Bloque">{detailRow.nombre_bloque}</F>}
                  {detailRow.motivo_cancelacion && <F label="Motivo cancelación" span={2}>{detailRow.motivo_cancelacion}</F>}
                </div>

                {fantasmasDeEste.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fantasmas asociados</span>
                      <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full">{fantasmasDeEste.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3">
                      {fantasmasDeEste.map(({ key, codigo_materia, grupo, materia }) => (
                        <div key={key} className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300">{codigo_materia}</span>
                            <span className="text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">Grupo {grupo}</span>
                          </div>
                          {materia && <p className="text-xs font-semibold text-foreground/80 truncate">{materia}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            {isAdmin && ['programacion', 'fantasma'].includes(detailRow?.tipo) && (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditarClaseDialog
        open={editOpen}
        onOpenChange={(v) => { setEditOpen(v); if (!v) setDetailRow(null); }}
        clase={detailRow}
        semestre={semestre?.codigo}
        facultades={[...new Set((completa.length ? completa : clasesPorDia).map((r) => r.facultad).filter(Boolean))].sort()}
        todosRegistros={completa}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal para editar fechas de un semestre
// ---------------------------------------------------------------------------
function ModalEditarFechas({ semestre, onClose }) {
  const editarFechas = useActualizarFechasSemestre();
  const [inicio, setInicio] = useState(fechaToInput(semestre?.fecha_inicio));
  const [fin, setFin] = useState(fechaToInput(semestre?.fecha_fin));
  const [error, setError] = useState('');

  async function handleGuardar(e) {
    e.preventDefault();
    setError('');
    if (!inicio || !fin) { setError('Completa ambas fechas'); return; }
    if (inicio >= fin) { setError('La fecha de inicio debe ser anterior a la fecha de fin'); return; }
    try {
      await editarFechas.mutateAsync({ codigo: semestre.codigo, fecha_inicio: inicio, fecha_fin: fin });
      showSuccess('Fechas actualizadas correctamente');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al actualizar las fechas');
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Editar fechas — Semestre {semestre?.codigo}
        </DialogTitle>
        <DialogDescription>
          Ajusta el rango de fechas del semestre. Este rango determina cuándo se considera vigente.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleGuardar} className="space-y-4">
        <FormField label="Fecha de inicio" htmlFor="edit-fecha-inicio" required>
          <Input
            id="edit-fecha-inicio"
            type="date"
            value={inicio}
            onChange={(e) => { setInicio(e.target.value); setError(''); }}
          />
        </FormField>

        <FormField label="Fecha de fin" htmlFor="edit-fecha-fin" required>
          <Input
            id="edit-fecha-fin"
            type="date"
            value={fin}
            onChange={(e) => { setFin(e.target.value); setError(''); }}
          />
        </FormField>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">Cancelar</Button>
          </DialogClose>
          <Button type="submit" size="sm" disabled={editarFechas.isPending}>
            {editarFechas.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Tarjetas de semestres (solo admin)
// ---------------------------------------------------------------------------
function TarjetasSemestres({ semestres, loading, onSeleccionar, importar, onImportar }) {
  const eliminar = useEliminarSemestre();
  const [semestreEditando, setSemestreEditando] = useState(null);

  async function handleEliminar(sem, e) {
    e.stopPropagation();
    const confirm = await Swal.fire({
      title: `¿Eliminar semestre ${sem.codigo}?`,
      text: `Se eliminarán ${sem.total_registros} registros de programación. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirm.isConfirmed) return;
    try {
      await eliminar.mutateAsync(sem.codigo);
      showSuccess(`Semestre ${sem.codigo} eliminado`);
    } catch (err) {
      showError(err.response?.data?.message || 'Error al eliminar el semestre');
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Modal editar fechas */}
      <Dialog open={!!semestreEditando} onOpenChange={(open) => !open && setSemestreEditando(null)}>
        {semestreEditando && (
          <ModalEditarFechas
            semestre={semestreEditando}
            onClose={() => setSemestreEditando(null)}
          />
        )}
      </Dialog>

      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="h-6 w-6" />
              Programación Académica
            </h1>
            <p className="text-muted-foreground text-sm">{semestres.length} semestres cargados</p>
          </div>
          <FileUploader
            onFile={onImportar}
            loading={importar.isPending}
            label="Importar Excel"
          />
        </div>

        {semestres.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <BookOpen className="h-12 w-12 opacity-30" />
            <p className="text-sm">No hay semestres cargados. Importa un archivo Excel para comenzar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {semestres.map((sem) => (
              <div
                key={sem.codigo}
                onClick={() => onSeleccionar(sem)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSeleccionar(sem)}
                className="group text-left p-5 bg-card border border-border rounded-xl hover:border-primary hover:shadow-md transition-all space-y-3 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                    {sem.codigo}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      {sem.total_registros} registros
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSemestreEditando(sem); }}
                      title="Editar fechas"
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleEliminar(sem, e)}
                      title="Eliminar semestre"
                      disabled={eliminar.isPending}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground/70">Inicio:</span>{' '}
                    {formatFecha(sem.fecha_inicio)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground/70">Fin:</span>{' '}
                    {formatFecha(sem.fecha_fin)}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  Cargado: {formatFecha(sem.fecha_carga)}
                  {sem.cargado_por ? ` · ${sem.cargado_por}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function ProgramacionPage() {
  const { usuario } = useAuthStore();
  const isAdmin = usuario?.rol === ROLES.ADMIN;

  // Admin: navega entre semestres
  const [semestreSeleccionado, setSemestreSeleccionado] = useState(null);
  const { data: semestres = [], isLoading: loadingSemestres } = useSemestres();

  // Aux: obtiene el semestre vigente automáticamente
  const { data: vigente } = useSemestreVigente();

  const importar = useImportarProgramacion();

  function handleImportar(file) {
    importar.mutate(file, {
      onSuccess: (res) => showSuccess(res.data?.message || 'Importación exitosa'),
      onError: (err) => showError(err.response?.data?.message || 'Error al importar'),
    });
  }

  // Auxiliar: siempre ve el semestre vigente
  if (!isAdmin) {
    if (!vigente) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <CalendarDays className="h-12 w-12 opacity-30" />
          <p className="text-sm">No hay semestre vigente disponible.</p>
        </div>
      );
    }
    return <VistaSemestre semestre={vigente} onVolver={null} isAdmin={false} />;
  }

  // Admin: drilldown en semestre seleccionado
  if (semestreSeleccionado) {
    return (
      <VistaSemestre
        semestre={semestreSeleccionado}
        onVolver={() => setSemestreSeleccionado(null)}
        isAdmin
      />
    );
  }

  // Admin: vista de tarjetas de semestres
  return (
    <TarjetasSemestres
      semestres={semestres}
      loading={loadingSemestres}
      onSeleccionar={setSemestreSeleccionado}
      importar={importar}
      onImportar={handleImportar}
    />
  );
}
