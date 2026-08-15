import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DataTable from '@/shared/components/DataTable';
import { usePrestamosAbiertos, usePrestamosHistorial, useCrearPrestamo, useRegistrarDevolucion } from './prestamosApi';
import PrestamosDetallePanel from './PrestamosDetallePanel';
import { equiposApi } from '@/features/equipos/equiposApi';
import { comunidadApi } from '@/features/comunidad/comunidadApi';
import { useUbicacionesOperativas } from '@/shared/hooks/useUbicacionesOperativas';
import { showSuccess, showError, showWarning } from '@/shared/utils/alert';
import { Package, Loader2, Search, CheckCircle2, History, Clock } from 'lucide-react';

function tiempoTranscurrido(fechaInicio, fechaFin = null) {
  if (!fechaInicio) return '—';
  const diff = Math.max(0, (fechaFin ? new Date(fechaFin) : Date.now()) - new Date(fechaInicio));
  const total = Math.floor(diff / 60000);
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (mins > 0 || partes.length === 0) partes.push(`${mins}min`);
  return partes.join(' ');
}
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import { cn } from '@/shared/lib/utils';
import { abrirBuscadorPersonaPorNombre } from '@/shared/utils/personaSearchHotkey';

function EstadoBadge({ estado }) {
  const map = {
    activo: 'warning',
    parcialmente_devuelto: 'orange',
    completamente_devuelto: 'success',
  };
  return (
    <StatusBadge variant={map[estado] || 'neutral'}>
      {estado?.replace(/_/g, ' ')}
    </StatusBadge>
  );
}

export default function PrestamosPage() {
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('activos');
  const [detallePrestamoId, setDetallePrestamoId] = useState('');
  const { data: prestamos = [], isLoading } = usePrestamosAbiertos();
  const { data: historialPrestamos = [], isLoading: isLoadingHistorial } = usePrestamosHistorial();
  const crear = useCrearPrestamo();
  const devolver = useRegistrarDevolucion();
  const [equiposSeleccionados, setEquiposSeleccionados] = useState([]);
  const [barcodePrestamo, setBarcodePrestamo] = useState('');
  const [barcodeDevolucion, setBarcodeDevolucion] = useState('');
  const [prestamoSeleccionadoId, setPrestamoSeleccionadoId] = useState('');
  // Estado unificado del solicitante y docente responsable
  const SOL_FORM_INIT = { solicitante_codigo: '', solicitante_nombre: '', solicitante_tipo: '', responsable_codigo: '', responsable_nombre: '' };
  const [solForm, setSolForm] = useState(SOL_FORM_INIT);
  const [solicitanteEncontrado, setSolicitanteEncontrado] = useState(null);
  const [responsableEncontrado, setResponsableEncontrado] = useState(null);
  const [buscandoPersona, setBuscandoPersona] = useState(false);
  // Búsqueda por nombre de equipo
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const {
    getUbicacionLabel,
    prestamoEquiposOptions,
    ubicacionPrestamoEquiposDefault,
  } = useUbicacionesOperativas();
  const [ubicacionPrestamo, setUbicacionPrestamo] = useState(ubicacionPrestamoEquiposDefault);
  const [ubicacionDevolucion, setUbicacionDevolucion] = useState(ubicacionPrestamoEquiposDefault);
  const [equiposParaDevolver, setEquiposParaDevolver] = useState([]);
  const inputPrestamoRef = useRef(null);
  const inputDevolucionRef = useRef(null);
  const ultimoScanPrestamoRef = useRef('');
  const ultimoScanDevolucionRef = useRef('');

  const prestamoSeleccionado = useMemo(
    () => prestamos.find((p) => String(p._id) === String(prestamoSeleccionadoId)) || null,
    [prestamos, prestamoSeleccionadoId]
  );

  const detalleSeleccionado = useMemo(
    () => [...prestamos, ...historialPrestamos].find((p) => String(p._id) === String(detallePrestamoId)) || null,
    [prestamos, historialPrestamos, detallePrestamoId]
  );

  const pendientesSeleccionados = useMemo(
    () => (prestamoSeleccionado?.equipos || []).filter((e) => e.estado_equipo === 'entregado'),
    [prestamoSeleccionado]
  );

  const opcionesPrestamoEquipos = useMemo(
    () => (prestamoEquiposOptions.length
      ? prestamoEquiposOptions
      : [{ clave: ubicacionPrestamoEquiposDefault, nombre: getUbicacionLabel(ubicacionPrestamoEquiposDefault) }]),
    [prestamoEquiposOptions, ubicacionPrestamoEquiposDefault, getUbicacionLabel]
  );

  useEffect(() => {
    setUbicacionPrestamo(ubicacionPrestamoEquiposDefault);
    setUbicacionDevolucion(ubicacionPrestamoEquiposDefault);
  }, [ubicacionPrestamoEquiposDefault]);

  useEffect(() => {
    if (!prestamoSeleccionadoId) return;
    if (!prestamoSeleccionado || pendientesSeleccionados.length === 0) {
      setPrestamoSeleccionadoId('');
      setBarcodeDevolucion('');
      setEquiposParaDevolver([]);
    }
  }, [prestamoSeleccionadoId, prestamoSeleccionado, pendientesSeleccionados.length]);

  // Computed objetivo for F1: if student found and waiting for docente, F1 searches responsable
  const objetivoF1 =
    solicitanteEncontrado && solForm.solicitante_tipo === 'estudiante' && !responsableEncontrado
      ? 'responsable'
      : 'solicitante';
  // Keep a ref so the event listener always uses the latest objetivo/handler without needing to re-register
  const objetivoF1Ref = useRef(objetivoF1);
  objetivoF1Ref.current = objetivoF1;

  useEffect(() => {
    if (!showForm) return;
    const onKeyDown = (e) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      void handleBuscarPorNombreF1();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showForm]);

  async function handleBuscarPorNombreF1() {
    const objetivo = objetivoF1Ref.current;
    const esResponsable = objetivo === 'responsable';
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: esResponsable ? 'Buscar responsable por nombre (F1)' : 'Buscar solicitante por nombre (F1)',
      tipo: esResponsable ? ['docente', 'empleado'] : undefined,
      placeholder: esResponsable ? 'Nombre del responsable' : 'Nombre del solicitante',
    });
    if (!persona) return;
    aplicarPersona(persona, objetivo);
  }

  function normalizarCodigoEscaneado(codigo = '') {
    return String(codigo)
      .trim()
      .toUpperCase()
      .replace(/["'`]+/g, '-')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function posiblesCodigos(codigo = '') {
    const raw = String(codigo || '').trim().toUpperCase();
    const normalizado = normalizarCodigoEscaneado(raw);
    return [...new Set([raw, normalizado].filter(Boolean))];
  }

  function aplicarPersona(persona, objetivo) {
    if (objetivo === 'responsable') {
      if (!['docente', 'empleado'].includes(persona.tipo)) {
        showWarning(`"${persona.nombre}" es ${persona.tipo || 'desconocido'}. El responsable debe ser un docente o empleado.`);
        return;
      }
      setSolForm((f) => ({ ...f, responsable_codigo: persona.numero_documento || '', responsable_nombre: persona.nombre || '' }));
      setResponsableEncontrado(persona);
    } else {
      const tipo = ['docente', 'estudiante', 'empleado'].includes(persona.tipo) ? persona.tipo : 'docente';
      setSolForm((f) => ({
        ...f,
        solicitante_codigo: persona.numero_documento || '',
        solicitante_nombre: persona.nombre || '',
        solicitante_tipo: tipo,
        ...(tipo !== 'estudiante' ? { responsable_codigo: '', responsable_nombre: '' } : {}),
      }));
      setSolicitanteEncontrado(persona);
      if (tipo !== 'estudiante') setResponsableEncontrado(null);
    }
  }

  async function buscarPersona(identificador, objetivo = 'solicitante') {
    const id = String(identificador || '').trim();
    if (!id) return;
    setBuscandoPersona(true);
    if (objetivo === 'responsable') setResponsableEncontrado(null);
    else setSolicitanteEncontrado(null);
    try {
      let res;
      const esDocumento = /^\d+$/.test(id);
      if (esDocumento) {
        try { res = await comunidadApi.buscarPorDocumento(id); }
        catch (_) { res = await comunidadApi.buscarPorCarnet(id); }
      } else {
        try { res = await comunidadApi.buscarPorCarnet(id); }
        catch (_) { res = await comunidadApi.buscarPorDocumento(id); }
      }
      aplicarPersona(res.data.data.persona, objetivo);
    } catch {
      showWarning(`No se encontró persona con "${id}". Puede ingresar el nombre manualmente.`);
    } finally {
      setBuscandoPersona(false);
    }
  }

  function equipoPrestadoEnAbiertos(equipoId) {
    return prestamos.some((p) =>
      (p.equipos || []).some(
        (eq) => String(eq.equipo_id) === String(equipoId) && eq.estado_equipo === 'entregado'
      )
    );
  }

  async function agregarPorCodigoBarras(codigoEntrada = barcodePrestamo) {
    const codigo = String(codigoEntrada || '').trim();
    if (!codigo) return;
    try {
      let equipo = null;
      const candidatos = posiblesCodigos(codigo);
      for (const c of candidatos) {
        try {
          const res = await equiposApi.buscarBarcode(c);
          equipo = res.data?.data?.equipo;
          if (equipo) break;
        } catch (_) {
          // Probar siguiente variante del código escaneado
        }
      }
      if (!equipo) return showWarning('No se encontró equipo para ese código');
      if (equiposSeleccionados.some((eq) => String(eq._id) === String(equipo._id))) {
        return showWarning('Ese equipo ya está agregado al carrito');
      }
      if (equipoPrestadoEnAbiertos(equipo._id)) {
        return showWarning('Ese equipo ya se encuentra en un préstamo activo');
      }
      if (equipo.estado !== 'activo') {
        return showWarning(`El equipo está en estado '${equipo.estado}' y no se puede prestar`);
      }
      setEquiposSeleccionados((prev) => [...prev, equipo]);
      setBarcodePrestamo('');
      ultimoScanPrestamoRef.current = '';
      inputPrestamoRef.current?.focus();
    } catch (err) {
      showError(err.response?.data?.message || 'No se pudo leer el código de barras');
    }
  }

  function quitarDelCarrito(equipoId) {
    setEquiposSeleccionados((prev) => prev.filter((eq) => String(eq._id) !== String(equipoId)));
  }

  function agregarEquipoDirecto(equipo) {
    if (equiposSeleccionados.some((eq) => String(eq._id) === String(equipo._id))) {
      return showWarning('Ese equipo ya está agregado al carrito');
    }
    if (equipoPrestadoEnAbiertos(equipo._id)) {
      return showWarning('Ese equipo ya se encuentra en un préstamo activo');
    }
    if (equipo.estado !== 'activo') {
      return showWarning(`El equipo está en estado '${equipo.estado}' y no se puede prestar`);
    }
    setEquiposSeleccionados((prev) => [...prev, equipo]);
    setTextoBusqueda('');
    setSugerencias([]);
    setShowSug(false);
    inputPrestamoRef.current?.focus();
  }

  async function onCrear() {
    if (!equiposSeleccionados.length) return showWarning('Seleccione al menos un equipo');
    if (!solForm.solicitante_nombre.trim()) {
      return showWarning('No se encontró la persona para ese documento/carnet');
    }
    if (solForm.solicitante_tipo === 'estudiante') {
      if (!solForm.responsable_codigo.trim()) return showWarning('El estudiante debe tener un responsable asignado');
      if (!solForm.responsable_nombre.trim()) return showWarning('El nombre del responsable es requerido');
    }
    try {
      await crear.mutateAsync({
        docente_codigo_nfc: solForm.solicitante_codigo,
        docente_nombre: solForm.solicitante_nombre,
        solicitante_tipo: solForm.solicitante_tipo,
        docente_responsable_codigo: solForm.responsable_codigo,
        docente_responsable_nombre: solForm.responsable_nombre,
        ubicacion_prestamo: ubicacionPrestamo,
        equipos: equiposSeleccionados.map((eq) => String(eq._id)),
      });
      setSolForm(SOL_FORM_INIT);
      setSolicitanteEncontrado(null);
      setResponsableEncontrado(null);
      setEquiposSeleccionados([]);
      setBarcodePrestamo('');
      setTextoBusqueda('');
      setSugerencias([]);
      setShowForm(false);
      showSuccess('Préstamo registrado correctamente');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message;
      if (status === 409) {
        showError(msg || 'Alguno de los equipos ya está en un préstamo activo');
      } else if (status === 404) {
        showError(msg || 'No se encontraron los equipos seleccionados');
      } else {
        showError(msg || 'No se pudo registrar el préstamo. Intente nuevamente.');
      }
    }
  }

  function devolverPorCodigoBarras(codigoEntrada = barcodeDevolucion) {
    if (!prestamoSeleccionado) return showWarning('Seleccione un préstamo');
    const codigo = String(codigoEntrada || '').trim();
    if (!codigo) return;

    const codigos = posiblesCodigos(codigo);

    // Excluir equipos ya en cola
    const yaEnCola = equipo => equiposParaDevolver.some(item => String(item.equipo.equipo_id) === String(equipo.equipo_id));
    const pendientesSinCola = pendientesSeleccionados.filter(eq => !yaEnCola(eq));

    const equipo = pendientesSinCola.find(
      (eq) => codigos.includes(String(eq.equipo_codigo_barras || '').toUpperCase())
    );

    if (!equipo) {
      if (pendientesSeleccionados.find(eq => codigos.includes(String(eq.equipo_codigo_barras || '').toUpperCase()))) {
        return showWarning('Ese equipo ya está en la cola de devolución');
      }
      return showWarning('Ese código no corresponde a un equipo pendiente de este préstamo');
    }

    setEquiposParaDevolver((prev) => [...prev, { equipo, novedad: { categoria: '', descripcion: '' } }]);
    setBarcodeDevolucion('');
    ultimoScanDevolucionRef.current = '';
    inputDevolucionRef.current?.focus();
  }

  async function confirmarDevoluciones() {
    if (!equiposParaDevolver.length) return;
    const total = equiposParaDevolver.length;
    try {
      for (const { equipo, novedad } of equiposParaDevolver) {
        const payload = {
          prestamo_id: String(prestamoSeleccionado._id),
          docente_codigo_nfc: prestamoSeleccionado.docente_codigo_nfc,
          docente_nombre: prestamoSeleccionado.docente_nombre,
          ubicacion_devolucion: ubicacionDevolucion,
          equipos: [String(equipo.equipo_id)],
        };
        if (novedad.categoria) payload.novedad = novedad;
        await devolver.mutateAsync(payload);
      }
      setEquiposParaDevolver([]);
      showSuccess(total > 1 ? `${total} equipos devueltos correctamente` : `${equiposParaDevolver[0]?.equipo.equipo_nombre || 'Equipo'} devuelto`);
    } catch (err) {
      showError(err.response?.data?.message || 'No se pudo confirmar la devolución. Intente nuevamente.');
    }
  }

  // Auto-búsqueda de equipos por nombre — excluye prestados y ya en carrito
  useEffect(() => {
    if (!showForm || textoBusqueda.trim().length < 2) {
      setSugerencias([]);
      setShowSug(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await equiposApi.buscarPorTexto(textoBusqueda.trim());
        const todos = res.data?.data?.equipos || [];
        const filtrados = todos.filter(
          (eq) =>
            !equiposSeleccionados.some((s) => String(s._id) === String(eq._id)) &&
            !equipoPrestadoEnAbiertos(eq._id)
        );
        setSugerencias(filtrados);
        setShowSug(true);
      } catch (_) {
        setSugerencias([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [textoBusqueda, showForm, equiposSeleccionados, prestamos]);

  // Auto-resolución del docente responsable ya está en el useEffect arriba

  useEffect(() => {
    if (!showForm) return;
    const valor = barcodePrestamo.trim();
    if (!valor) return;

    const timer = setTimeout(async () => {
      const normalizado = normalizarCodigoEscaneado(valor);
      if (!normalizado || normalizado === ultimoScanPrestamoRef.current) return;
      ultimoScanPrestamoRef.current = normalizado;
      await agregarPorCodigoBarras(valor);
    }, 120);

    return () => clearTimeout(timer);
  }, [barcodePrestamo, showForm]);

  useEffect(() => {
    if (!prestamoSeleccionado) return;
    const valor = barcodeDevolucion.trim();
    if (!valor) return;

    const timer = setTimeout(async () => {
      const normalizado = normalizarCodigoEscaneado(valor);
      if (!normalizado || normalizado === ultimoScanDevolucionRef.current) return;
      ultimoScanDevolucionRef.current = normalizado;
      await devolverPorCodigoBarras(valor);
    }, 120);

    return () => clearTimeout(timer);
  }, [barcodeDevolucion, prestamoSeleccionado]);

  const columns = [
    {
      key: 'docente_nombre',
      label: 'Solicitante',
      render: (v, row) => (
        <button
          onClick={() => setDetallePrestamoId(String(row._id))}
          className="text-primary hover:underline font-medium text-left"
          title="Ver detalle"
        >
          {v || '—'}
        </button>
      ),
    },
    {
      key: 'equipos',
      label: 'Equipos',
      render: (v) => {
        const pendientes = Array.isArray(v) ? v.filter((e) => e.estado_equipo === 'entregado') : [];
        return <span>{pendientes.map((e) => e.equipo_nombre).join(', ') || '—'}</span>;
      },
    },
    {
      key: 'fecha_prestamo',
      label: 'Tiempo en préstamo',
      render: (v) => (
        <span className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
          <Clock className="h-3 w-3" />
          {tiempoTranscurrido(v)}
        </span>
      ),
    },
    { key: 'estado', label: 'Estado', render: (v) => <EstadoBadge estado={v} /> },
  ];

  const historialColumns = [
    {
      key: 'docente_nombre',
      label: 'Solicitante',
      render: (v, row) => (
        <button
          onClick={() => setDetallePrestamoId(String(row._id))}
          className="text-primary hover:underline font-medium text-left"
          title="Ver detalle"
        >
          {v || '—'}
        </button>
      ),
    },
    {
      key: 'equipos',
      label: 'Artículos',
      render: (v) => <span>{Array.isArray(v) ? v.map((e) => e.equipo_nombre).join(', ') : '—'}</span>,
    },
    {
      key: 'fecha_prestamo',
      label: 'Préstamo',
      render: (v) => v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      key: 'equipos',
      label: 'Duración',
      render: (v) => {
        const ultima = Array.isArray(v)
          ? v.map((e) => e.fecha_devolucion).filter(Boolean).sort().at(-1)
          : null;
        return <span className="text-muted-foreground text-xs">{ultima ? tiempoTranscurrido(v[0]?.fecha_entrega, ultima) : '—'}</span>;
      },
    },
    { key: 'auxiliar_prestamista', label: 'Auxiliar' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-6 w-6" />
            Préstamos de Equipos
          </h1>
          <p className="text-muted-foreground text-sm">{prestamos.length} abiertos</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cerrar formulario' : '+ Nuevo Préstamo'}
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border-2 border-primary/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Registrar préstamo</h2>
            <button onClick={() => setShowForm(false)} className="text-sm text-muted-foreground hover:text-foreground underline">Cancelar</button>
          </div>

          <div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Columna izquierda: datos del solicitante ── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Solicitante</p>
                <FormField label="Número de documento del solicitante" required>
                  <div className="flex gap-1">
                    <Input
                      value={solForm.solicitante_codigo}
                      onChange={(e) => {
                        setSolForm((f) => ({ ...f, solicitante_codigo: e.target.value, solicitante_nombre: '', solicitante_tipo: '', responsable_codigo: '', responsable_nombre: '' }));
                        setSolicitanteEncontrado(null);
                        setResponsableEncontrado(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && buscarPersona(solForm.solicitante_codigo, 'solicitante')}
                      placeholder="Escanee carnet o escriba documento"
                    />
                    <button
                      type="button"
                      onClick={() => buscarPersona(solForm.solicitante_codigo, 'solicitante')}
                      disabled={buscandoPersona}
                      className="px-2 rounded border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50"
                      title="Buscar solicitante"
                    >
                      {buscandoPersona && !responsableEncontrado !== undefined && !solicitanteEncontrado
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Search className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">F1 para buscar por nombre</p>
                </FormField>
                <FormField label="Nombre del solicitante" required>
                  <div className="relative">
                    <Input value={solForm.solicitante_nombre} readOnly className="bg-muted" placeholder="Se completa automáticamente" />
                    {solicitanteEncontrado && <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                  </div>
                </FormField>

                {/* Responsable — obligatorio si estudiante, solo visible cuando tipo === 'estudiante' */}
                {solForm.solicitante_tipo === 'estudiante' && (
                  <div className="border border-border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Responsable — obligatorio
                    </p>
                    <FormField label="Número de documento del responsable" required>
                      <div className="flex gap-1">
                        <Input
                          value={solForm.responsable_codigo}
                          onChange={(e) => {
                            setSolForm((f) => ({ ...f, responsable_codigo: e.target.value, responsable_nombre: '' }));
                            setResponsableEncontrado(null);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && buscarPersona(solForm.responsable_codigo, 'responsable')}
                          placeholder="Escriba el número de documento"
                        />
                        <button
                          type="button"
                          onClick={() => buscarPersona(solForm.responsable_codigo, 'responsable')}
                          disabled={buscandoPersona}
                          className="px-2 rounded border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50"
                          title="Buscar responsable"
                        >
                          {buscandoPersona
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Search className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormField>
                    <FormField label="Nombre del responsable">
                      <div className="relative">
                        <Input value={solForm.responsable_nombre} readOnly className="bg-muted" placeholder="Se completa automáticamente" />
                        {responsableEncontrado && <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                      </div>
                    </FormField>
                  </div>
                )}

                {opcionesPrestamoEquipos.length > 1 && (
                  <FormField label="Ubicación del préstamo">
                    <Select value={ubicacionPrestamo} onChange={(e) => setUbicacionPrestamo(e.target.value)}>
                      {opcionesPrestamoEquipos.map((u) => (
                        <option key={u.clave} value={u.clave}>{getUbicacionLabel(u.clave)}</option>
                      ))}
                    </Select>
                  </FormField>
                )}
              </div>

              {/* ── Columna derecha: equipos ── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Equipos</p>

                <FormField label="Escanear código de barras">
                  <div className="flex gap-2">
                    <Input
                      ref={inputPrestamoRef}
                      value={barcodePrestamo}
                      onChange={(e) => setBarcodePrestamo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarPorCodigoBarras(); } }}
                      placeholder="Ej: INV-M-303-001"
                    />
                    <Button type="button" onClick={agregarPorCodigoBarras}>Agregar</Button>
                  </div>
                </FormField>

                <FormField label="Buscar por nombre o marca">
                  <div className="relative">
                    <Input
                      value={textoBusqueda}
                      onChange={(e) => setTextoBusqueda(e.target.value)}
                      onFocus={() => sugerencias.length > 0 && setShowSug(true)}
                      onBlur={() => setTimeout(() => setShowSug(false), 150)}
                      placeholder="Ej: cable, proyector, bus..."
                    />
                    {showSug && sugerencias.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {sugerencias.map((eq) => (
                          <button
                            key={String(eq._id)}
                            type="button"
                            onMouseDown={() => agregarEquipoDirecto(eq)}
                            className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="font-medium text-foreground truncate">{eq.nombre}</span>
                            <span className="text-muted-foreground text-xs shrink-0">#{eq.consecutivo}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showSug && sugerencias.length === 0 && textoBusqueda.trim().length >= 2 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm text-muted-foreground">
                        Sin resultados para «{textoBusqueda}»
                      </div>
                    )}
                  </div>
                </FormField>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Carrito ({equiposSeleccionados.length})</label>
                  <div className="max-h-52 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {equiposSeleccionados.map((eq) => (
                      <div key={String(eq._id)} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{eq.nombre}</p>
                          <p className="text-muted-foreground text-xs font-mono">{eq.codigo_barras || eq.codigo_inventario}</p>
                        </div>
                        <button type="button" onClick={() => quitarDelCarrito(eq._id)} className="text-destructive hover:text-destructive/80 text-xs font-semibold shrink-0">Quitar</button>
                      </div>
                    ))}
                    {!equiposSeleccionados.length && (
                      <p className="text-muted-foreground text-sm py-4 text-center">Sin equipos — escanee o busque por nombre</p>
                    )}
                  </div>
                </div>

                <Button type="button" onClick={onCrear} disabled={crear.isPending} className="w-full">
                  {crear.isPending ? 'Registrando...' : 'Registrar Préstamo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!showForm && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('activos')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'activos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Package className="h-4 w-4" />
              Activos
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">{prestamos.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('historial')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'historial'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <History className="h-4 w-4" />
              Historial
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">{historialPrestamos.length}</span>
            </button>
          </div>

          {/* Table */}
          <div>
            {activeTab === 'activos'
              ? <DataTable columns={columns} data={prestamos} loading={isLoading} searchable onRowClick={(row) => setDetallePrestamoId(String(row._id))} />
              : <DataTable columns={historialColumns} data={historialPrestamos} loading={isLoadingHistorial} searchable onRowClick={(row) => setDetallePrestamoId(String(row._id))} />}
          </div>

          {/* Modal de detalle */}
          {detallePrestamoId && createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
              onClick={() => setDetallePrestamoId('')}
            >
              <div
                className="w-full max-w-lg max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <PrestamosDetallePanel
                  prestamo={detalleSeleccionado}
                  onClose={() => setDetallePrestamoId('')}
                  getUbicacionLabel={getUbicacionLabel}
                  onGestionarDevolucion={detalleSeleccionado?.estado !== 'completamente_devuelto' ? () => {
                    setPrestamoSeleccionadoId(String(detalleSeleccionado._id));
                    setBarcodeDevolucion('');
                    setDetallePrestamoId('');
                    setTimeout(() => inputDevolucionRef.current?.focus(), 0);
                  } : null}
                />
              </div>
            </div>,
            document.body
          )}
        </>
      )}

      {prestamoSeleccionado && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-foreground">
              Devolución parcial por escaneo: {prestamoSeleccionado.docente_nombre}
            </h3>
            <button
              onClick={() => setPrestamoSeleccionadoId('')}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Cerrar
            </button>
          </div>

          <p className="text-sm text-muted-foreground">
            Documento/Carnet: <b className="text-foreground">{prestamoSeleccionado.docente_codigo_nfc}</b> | Pendientes: <b className="text-foreground">{pendientesSeleccionados.length}</b>
          </p>
          {opcionesPrestamoEquipos.length > 1 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Ubicación de devolución</p>
              <Select
                value={ubicacionDevolucion}
                onChange={(e) => setUbicacionDevolucion(e.target.value)}
              >
                {opcionesPrestamoEquipos.map((ubicacion) => (
                  <option key={ubicacion.clave} value={ubicacion.clave}>
                    {getUbicacionLabel(ubicacion.clave)}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Escanear equipo para añadir a cola */}
          <div className="flex gap-2">
            <Input
              ref={inputDevolucionRef}
              value={barcodeDevolucion}
              onChange={(e) => setBarcodeDevolucion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  devolverPorCodigoBarras();
                }
              }}
              placeholder="Escanee código de barras del equipo"
            />
            <Button type="button" onClick={() => devolverPorCodigoBarras()}>
              Añadir
            </Button>
          </div>

          {/* Tabla de equipos pendientes — clic para agregar a la cola */}
          <div className="max-h-44 overflow-y-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="table-header">Equipo pendiente</th>
                  <th className="table-header">Código de barras</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {pendientesSeleccionados
                  .filter(eq => !equiposParaDevolver.some(item => String(item.equipo.equipo_id) === String(eq.equipo_id)))
                  .map((eq) => (
                    <tr
                      key={`${eq.equipo_id}-${eq.fecha_entrega || ''}`}
                      className="border-t border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setEquiposParaDevolver(prev => [...prev, { equipo: eq, novedad: { categoria: '', descripcion: '' } }])}
                      title="Clic para agregar a la cola de devolución"
                    >
                      <td className="table-cell">{eq.equipo_nombre}</td>
                      <td className="table-cell font-mono text-xs">{eq.equipo_codigo_barras || '—'}</td>
                      <td className="table-cell text-xs text-primary">+ Devolver</td>
                    </tr>
                  ))}
                {pendientesSeleccionados.every(eq => equiposParaDevolver.some(item => String(item.equipo.equipo_id) === String(eq.equipo_id))) && (
                  <tr><td colSpan={3} className="table-cell text-center text-muted-foreground">Todos en cola de devolución</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Cola de devolución con novedad por equipo */}
          {equiposParaDevolver.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Equipos a devolver ({equiposParaDevolver.length})</p>
              <div className="space-y-2">
                {equiposParaDevolver.map((item, idx) => (
                  <div key={String(item.equipo.equipo_id)} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{item.equipo.equipo_nombre}</p>
                      <button
                        type="button"
                        onClick={() => setEquiposParaDevolver(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Quitar
                      </button>
                    </div>
                    <Select
                      value={item.novedad.categoria}
                      onChange={(e) => setEquiposParaDevolver(prev => prev.map((it, i) => i === idx ? { ...it, novedad: { ...it.novedad, categoria: e.target.value, descripcion: '' } } : it))}
                    >
                      <option value="">Sin novedad</option>
                      <option value="daño_fisico">Daño físico</option>
                      <option value="no_funciona">No funciona</option>
                      <option value="perdida">Pérdida</option>
                      <option value="otro">Otro</option>
                    </Select>
                    {item.novedad.categoria && (
                      <Input
                        value={item.novedad.descripcion}
                        onChange={(e) => setEquiposParaDevolver(prev => prev.map((it, i) => i === idx ? { ...it, novedad: { ...it.novedad, descripcion: e.target.value } } : it))}
                        placeholder="Descripción de la novedad..."
                      />
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="destructive"
                onClick={confirmarDevoluciones}
                disabled={devolver.isPending}
                className="w-full"
              >
                {devolver.isPending ? 'Procesando...' : `Confirmar devolución (${equiposParaDevolver.length} equipo${equiposParaDevolver.length > 1 ? 's' : ''})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
