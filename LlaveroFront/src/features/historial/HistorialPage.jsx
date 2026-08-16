import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import DataTable from '@/shared/components/DataTable';
import {
  useHistorialLlaves,
  useDevolverLlave,
  useProcesarNFC,
  useDevolverPorId,
  useConfirmarAnticipado,
} from '@/features/llaves/llavesApi';
import { useUbicacionesOperativas } from '@/shared/hooks/useUbicacionesOperativas';
import { UBICACIONES } from '@/shared/constants';
import Swal from '@/shared/lib/swal';
import { BarChart3, Trash2, Key, CreditCard, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import dayjs from 'dayjs';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/shared/components/ui/Sheet';
import { soloNumerosConTope, LONGITUD_MAXIMA } from '@/shared/utils/inputValidation';

/**
 * Ubicación reportada al backend para el procesamiento NFC de esta página.
 * El schema Zod del backend exige un string no vacío, pero `normalizarUbicacion`
 * (llave.service.js) ya no valida contra los flags de la ubicación (solo
 * normaliza la clave) — el verdadero control de acceso es por bloque/rol
 * (`verificarPermisoLlave`), así que un valor neutro es suficiente aquí.
 */
const UBICACION_MODAL_ENTREGA = UBICACIONES.OFICINA;

export default function HistorialPage() {
  // 'en-CA' formatea como YYYY-MM-DD usando la hora LOCAL — a diferencia de
  // toISOString() (UTC), que en Colombia (UTC-5) ya muestra el día siguiente
  // entre las 7pm y medianoche, ocultando entregas recién hechas ese filtro.
  const [filters, setFilters] = useState({ fecha: new Date().toLocaleDateString('en-CA'), estado: '' });
  const { data: registros = [], isLoading, refetch } = useHistorialLlaves(filters);
  const { getUbicacionLabel } = useUbicacionesOperativas();
  const devolverLlave = useDevolverLlave();
  const qc = useQueryClient();
  const [entregaOpen, setEntregaOpen] = useState(false);

  function handleCerrarEntrega() {
    setEntregaOpen(false);
    qc.invalidateQueries({ queryKey: ['llaves'] });
    qc.invalidateQueries({ queryKey: ['programacion'] });
    refetch();
  }

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

    const campo = (label, valor) => `
      <div>
        <b>${label}:</b> ${valor}
      </div>
    `;

    Swal.fire({
      title: 'Detalles del registro',
      width: 640,
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.7">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">
            ${campo('Materia / Motivo', row.materia || '—')}
            ${campo('Docente', row.docente || '—')}
            ${campo('Documento', row.documento || '—')}
            ${campo('Aula', row.aula || '—')}
            ${campo('Horario', row.horario || '—')}
            ${campo('Tipo Entrega', textoTipoEntrega(row.tipoEntrega))}
            ${campo('F. Préstamo', row.fechaEntrega || '—')}
            ${campo('H. Préstamo', row.horaEntrega || '—')}
            ${campo('F. Devolución', row.fechaDevolucion || '—')}
            ${campo('H. Devolución', row.horaDevolucion || '—')}
            ${campo('Ubic. Préstamo', getUbicacionLabel(row.ubicacionPrestamo))}
            ${campo('Ubic. Devolución', getUbicacionLabel(row.ubicacionDevolucion))}
            ${campo('Duración', row.duracion || '—')}
            ${campo('Reclamo a tiempo', textoReclamoATiempo(row.seReclamoATiempo))}
            ${campo('Tiempo de demora', row.tiempoRetraso || '—')}
          </div>
          <hr style="margin:10px 0;border-color:hsl(var(--border))"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">
            ${campo('Reclamó', reclamaInfo)}
            ${campo('Correo', correoReclama)}
            ${campo('Contacto', contactoReclama)}
          </div>
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

  async function handleExport(filas) {
    const XLSX = await import('xlsx');
    const quienLabel = (v) => v === 'docente' ? 'Docente' : v === 'monitor' ? 'Monitor' : v === 'otra_persona' ? 'Otra persona' : '';
    const reclamaAtLabel = (v) => (v ? 'Sí' : 'No');
    const tipoEntregaLabel = (v) => (v === 'manual' ? 'Manual' : v === 'carnet' ? 'Carnet NFC' : '');

    const data = filas.map((r) => ({
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
      'Tiempo de demora': r.tiempoRetraso || '',
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
        <div className="flex items-center gap-2">
          <Button onClick={() => setEntregaOpen(true)}>
            <Key className="h-4 w-4 mr-1" />Entrega
          </Button>
        </div>
      </div>

      <Sheet open={entregaOpen} onOpenChange={(open) => (open ? setEntregaOpen(true) : handleCerrarEntrega())}>
        <SheetContent className="sm:max-w-lg">
          <EntregaCarnetModal onClose={handleCerrarEntrega} />
        </SheetContent>
      </Sheet>

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

      <DataTable columns={COLS} data={registros} loading={isLoading} searchable exportable exportFileName="historial_llaves" onExport={handleExport} onRowClick={abrirDetalles} extraSearchKeys={['documento']} />
      <p className="text-xs text-muted-foreground text-center">Clic en una fila para ver detalles completos</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal "Entrega" — captura de carnet (lector USB tipo teclado o digitación
// manual) y despacha al endpoint inteligente /llaves/procesar-nfc, que
// decide del lado del backend si corresponde una entrega o una devolución.
// Mismo patrón de captura que LlavesPage.jsx: Enter dispara inmediato, y un
// debounce de 400ms cubre lectores que no envían Enter tras el código.
// ---------------------------------------------------------------------------
function EntregaCarnetModal({ onClose }) {
  const [valor, setValor] = useState('');
  const [resultado, setResultado] = useState(null); // { tipo, mensaje, ... } último resultado mostrado
  const inputRef = useRef(null);

  const procesarNFC = useProcesarNFC();
  const devolverPorId = useDevolverPorId();
  const confirmarAnticipado = useConfirmarAnticipado();

  const procesando = procesarNFC.isPending || devolverPorId.isPending || confirmarAnticipado.isPending;
  // Mientras se muestra una selección múltiple de devolución, no se debe
  // reiniciar la lectura ni robar el foco del listado de opciones.
  const esperandoSeleccion = resultado?.tipo === 'seleccion_devolucion';

  // Foco permanente en el input mientras el modal está abierto, para que el
  // lector de carnet (que "escribe" como si fuera un teclado) siempre tenga
  // adonde enviar los caracteres.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (esperandoSeleccion) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [resultado, esperandoSeleccion]);

  // Fallback para lectores USB que no envían Enter: si el valor deja de
  // cambiar por un instante, se dispara el procesamiento automáticamente.
  useEffect(() => {
    if (!valor.trim() || procesando || esperandoSeleccion) return;
    const t = setTimeout(() => procesar(valor), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  async function procesar(idCarnet) {
    const idCarnetLimpio = String(idCarnet || '').trim();
    if (!idCarnetLimpio || procesando) return;
    try {
      const res = await procesarNFC.mutateAsync({ id_carnet: idCarnetLimpio, ubicacion: UBICACION_MODAL_ENTREGA });
      setResultado(res.data.data);
    } catch (err) {
      setResultado({ tipo: 'error', mensaje: err.response?.data?.message || 'No se pudo procesar el carnet' });
    } finally {
      setValor('');
    }
  }

  async function elegirDevolucion(prestamo) {
    try {
      const res = await devolverPorId.mutateAsync({ id: prestamo.id, ubicacion: UBICACION_MODAL_ENTREGA });
      setResultado({ tipo: 'devolucion', mensaje: res.data?.message || 'Devolución registrada', registro: res.data?.data?.registro });
    } catch (err) {
      setResultado({ tipo: 'error', mensaje: err.response?.data?.message || 'No se pudo registrar la devolución' });
    }
  }

  async function confirmarEntregaAnticipada() {
    if (!resultado) return;
    try {
      const res = await confirmarAnticipado.mutateAsync({
        id_carnet: resultado.persona?.numero_documento || resultado.docente?.numero_documento || '',
        horario: resultado.clase?.horario || '',
        aula: resultado.clase?.aula || '',
        reserva_id: resultado.reserva?.id || '',
        rol: resultado.rol === 'monitor' ? 'monitor' : 'docente',
        documento_persona: resultado.persona?.numero_documento || '',
        nombre_persona: resultado.persona?.nombre || '',
        ubicacion: UBICACION_MODAL_ENTREGA,
      });
      setResultado({ tipo: 'prestamo', mensaje: res.data?.message || 'Llave entregada', docente: res.data?.data?.docente });
    } catch (err) {
      setResultado({ tipo: 'error', mensaje: err.response?.data?.message || 'No se pudo confirmar la entrega anticipada' });
    }
  }

  function reintentar() {
    setResultado(null);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />Entrega / Devolución de llave
        </SheetTitle>
        <SheetDescription>
          Acerque el carnet al lector o escriba el documento y presione Enter. El sistema valida
          automáticamente si corresponde una entrega o una devolución.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4">
        <div className="relative">
          <input
            ref={inputRef}
            value={valor}
            disabled={procesando || esperandoSeleccion}
            placeholder="Acerque el carnet o escriba el documento"
            autoFocus
            maxLength={LONGITUD_MAXIMA.documento}
            className="w-full border border-border rounded-lg px-3 py-3 text-center text-lg font-mono tracking-wide bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            onChange={(e) => setValor(soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento))}
            onBlur={() => {
              if (!esperandoSeleccion) setTimeout(() => inputRef.current?.focus(), 0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                procesar(valor);
              }
            }}
          />
          {procesando && (
            <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>

        {resultado && (
          <ResultadoEntregaCarnet
            resultado={resultado}
            onElegirDevolucion={elegirDevolucion}
            onConfirmarAnticipado={confirmarEntregaAnticipada}
            onReintentar={reintentar}
            procesando={procesando}
          />
        )}
      </div>
    </>
  );
}

function ResultadoEntregaCarnet({ resultado, onElegirDevolucion, onConfirmarAnticipado, onReintentar, procesando }) {
  const nombrePersona = resultado.persona?.nombre || resultado.docente?.nombre || '';

  if (resultado.tipo === 'prestamo') {
    return (
      <div className="flex items-start gap-2 bg-success/10 border border-success/20 text-success rounded-lg px-3 py-3 text-sm">
        <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Llave entregada{nombrePersona ? ` a ${nombrePersona}` : ''}</p>
          {resultado.clase?.aula && <p>Aula: {resultado.clase.aula}</p>}
          {resultado.clase?.materia && <p>Materia: {resultado.clase.materia}</p>}
        </div>
      </div>
    );
  }

  if (resultado.tipo === 'devolucion') {
    return (
      <div className="flex items-start gap-2 bg-success/10 border border-success/20 text-success rounded-lg px-3 py-3 text-sm">
        <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">{resultado.mensaje || `Devolución registrada${nombrePersona ? ` — ${nombrePersona}` : ''}`}</p>
          {resultado.registro?.aula && <p>Aula: {resultado.registro.aula}</p>}
        </div>
      </div>
    );
  }

  if (resultado.tipo === 'seleccion_devolucion') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {nombrePersona || 'Esta persona'} tiene varias llaves en préstamo. Seleccione cuál devolver:
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {(resultado.prestamosActivos || []).map((prestamo) => (
            <div
              key={prestamo.id}
              className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2 bg-muted/30"
            >
              <div className="text-sm">
                <p className="font-medium text-foreground">{prestamo.aula || '—'}</p>
                <p className="text-xs text-muted-foreground">{prestamo.materia || '—'} · {prestamo.horario || '—'}</p>
              </div>
              <Button size="sm" variant="destructive" disabled={procesando} onClick={() => onElegirDevolucion(prestamo)}>
                Devolver
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (resultado.tipo === 'anticipado') {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 bg-warning/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-3 text-sm">
          <Clock className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{resultado.mensaje || 'Reclamo anticipado'}</p>
            {nombrePersona && <p>Docente: {nombrePersona}</p>}
            {resultado.clase?.materia && <p>Materia: {resultado.clase.materia}</p>}
            {resultado.clase?.aula && <p>Aula: {resultado.clase.aula}</p>}
            {resultado.clase?.horario && <p>Horario: {resultado.clase.horario}</p>}
          </div>
        </div>
        <Button size="sm" className="w-full" disabled={procesando} onClick={onConfirmarAnticipado}>
          Confirmar entrega anticipada
        </Button>
      </div>
    );
  }

  if (resultado.tipo === 'sin_clase') {
    return (
      <div className="flex items-start gap-2 bg-muted border border-border text-muted-foreground rounded-lg px-3 py-3 text-sm">
        <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-foreground">{resultado.mensaje || 'No hay clase asignada en este horario'}</p>
          <button onClick={onReintentar} className="text-xs underline text-primary mt-1">Reintentar</button>
        </div>
      </div>
    );
  }

  // 'error' y cualquier otro tipo no contemplado explícitamente: se muestra
  // el mensaje que ya provee el backend en lugar de ignorarlo en silencio.
  return (
    <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-3 py-3 text-sm">
      <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">{resultado.mensaje || 'No se pudo procesar el carnet'}</p>
        <button onClick={onReintentar} className="text-xs underline mt-1">Reintentar</button>
      </div>
    </div>
  );
}
