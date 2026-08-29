import { useState, useMemo, useEffect } from 'react';
import {
  useReservas,
  useCrearReserva,
  useCancelarReserva,
  useEditarReserva,
  useDisponibilidad,
  useSalonesDisponibles,
  reservasApi,
} from './reservasApi';
import { useBloques } from '@/features/bloques/bloquesApi';
import { useSalones } from '@/features/salones/salonesApi';
import { comunidadApi } from '@/features/comunidad/comunidadApi';
import Swal from '@/shared/lib/swal';
import { CalendarDays, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { abrirBuscadorPersonaPorNombre } from '@/shared/utils/personaSearchHotkey';
import { getHoy, isEnCurso } from './reservasConstants';
import ReservasNuevaTab from './ReservasNuevaTab';
import ReservasBuscarTab from './ReservasBuscarTab';
import ReservasListaTab from './ReservasListaTab';



export default function ReservasPage() {
  const [vista, setVista] = useState('nueva');
  const [filters, setFilters] = useState({ estado: '', nombre_bloque: '', fecha: getHoy() });
  const [buscandoPersona, setBuscandoPersona] = useState(false);
  const [buscarForm, setBuscarForm] = useState({ fecha: getHoy(), hora_inicio: '', hora_fin: '', tipo_silleteria: '', capacidad_min: '' });
  const [buscarParams, setBuscarParams] = useState(null);
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState(null);
  const [solicitanteEncontrado, setSolicitanteEncontrado] = useState(null);
  const [responsableEncontrado, setResponsableEncontrado] = useState(null);
  const [reservaDetalle, setReservaDetalle] = useState(null);
  const [form, setForm] = useState({
    nombre_bloque: '', nombre_salon: '', fecha: getHoy(),
    hora_inicio: '', hora_fin: '', motivo: '',
    solicitante_documento: '', solicitante_nombre: '',
    tipo_solicitante: 'docente',
    responsable_documento: '', responsable_nombre: '',
    entregar_llave: false,
  });
  const [editando, setEditando] = useState({ reserva: null, modo: null });

  const { data: reservas = [], isLoading } = useReservas(filters);
  const { data: bloques = [] } = useBloques();
  const { data: salones = [] } = useSalones();
  const crear = useCrearReserva();
  const cancelar = useCancelarReserva();
  const editar = useEditarReserva();

  const { data: disponibilidad } = useDisponibilidad(form.nombre_salon, form.fecha);
  const { data: salonesLibres = [], isLoading: buscandoSalones } = useSalonesDisponibles(buscarParams);
  const objetivoEscaneo = useMemo(() => {
    if (!solicitanteEncontrado) return 'solicitante';
    if (form.tipo_solicitante === 'estudiante' && !responsableEncontrado) return 'responsable';
    return 'solicitante';
  }, [solicitanteEncontrado, responsableEncontrado, form.tipo_solicitante]);

  const tiposSilleteria = useMemo(() => [...new Set(salones.map((s) => s.tipo_silleteria).filter(Boolean))].sort(), [salones]);

  const salonesLibresFiltrados = useMemo(() => {
    return salonesLibres.filter((s) => {
      if (buscarForm.tipo_silleteria && s.tipo_silleteria !== buscarForm.tipo_silleteria) return false;
      if (buscarForm.capacidad_min && s.capacidad_estudiantes < Number(buscarForm.capacidad_min)) return false;
      return true;
    });
  }, [salonesLibres, buscarForm.tipo_silleteria, buscarForm.capacidad_min]);

  const porBloque = useMemo(() => {
    const map = {};
    salonesLibresFiltrados.forEach((s) => {
      const b = s.nombre_bloque || 'Sin bloque';
      if (!map[b]) map[b] = [];
      map[b].push(s);
    });
    return map;
  }, [salonesLibresFiltrados]);

  const salonesVista = bloqueSeleccionado ? (porBloque[bloqueSeleccionado] || []) : salonesLibresFiltrados;


  useEffect(() => {
    if (vista !== 'nueva') return;
    const onKeyDown = (e) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      void handleBuscarPorNombre();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [vista, objetivoEscaneo]);

  // Auto-búsqueda al escribir documento (sin Enter)
  useEffect(() => {
    if (vista !== 'nueva' || !form.solicitante_documento || form.solicitante_documento.length < 5 || solicitanteEncontrado) return;
    const t = setTimeout(() => buscarPersona(form.solicitante_documento, 'solicitante'), 600);
    return () => clearTimeout(t);
  }, [form.solicitante_documento, vista]);

  useEffect(() => {
    if (vista !== 'nueva' || form.tipo_solicitante !== 'estudiante' || !form.responsable_documento || form.responsable_documento.length < 5 || responsableEncontrado) return;
    const t = setTimeout(() => buscarPersona(form.responsable_documento, 'responsable'), 600);
    return () => clearTimeout(t);
  }, [form.responsable_documento, vista]);

  function aplicarPersonaEnFormulario(persona, objetivo, identificadorFallback = '') {
    if (!persona) return;
    const fallback = String(identificadorFallback || '').trim();
    if (objetivo === 'responsable') {
      setResponsableEncontrado(persona);
      setForm((f) => ({
        ...f,
        responsable_documento: persona.numero_documento || fallback,
        responsable_nombre: persona.nombre || '',
      }));
      return;
    }

    const tipoPersona = String(persona?.tipo || '').toLowerCase();
    const tipoSolicitante = ['docente', 'estudiante'].includes(tipoPersona) ? tipoPersona : 'docente';
    setSolicitanteEncontrado(persona);
    setForm((f) => ({
      ...f,
      solicitante_documento: persona.numero_documento || fallback,
      solicitante_nombre: persona.nombre || '',
      tipo_solicitante: tipoSolicitante,
      responsable_documento: tipoSolicitante === 'estudiante' ? f.responsable_documento : '',
      responsable_nombre: tipoSolicitante === 'estudiante' ? f.responsable_nombre : '',
    }));
    if (tipoSolicitante !== 'estudiante') {
      setResponsableEncontrado(null);
    }
  }

  async function handleBuscarPorNombre() {
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: objetivoEscaneo === 'responsable' ? 'Buscar profesor responsable (F1)' : 'Buscar solicitante (F1)',
      tipo: objetivoEscaneo === 'responsable' ? 'docente' : undefined,
      placeholder: objetivoEscaneo === 'responsable' ? 'Nombre del profesor' : 'Nombre del solicitante',
    });
    if (!persona) return;
    aplicarPersonaEnFormulario(persona, objetivoEscaneo);
  }

  async function buscarPersona(identificador, objetivo = 'solicitante') {
    const id = String(identificador || '').trim();
    if (!id) return;
    setBuscandoPersona(true);
    if (objetivo === 'responsable') {
      setResponsableEncontrado(null);
    } else {
      setSolicitanteEncontrado(null);
    }
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
      const persona = res.data.data.persona;
      aplicarPersonaEnFormulario(persona, objetivo, id);
    } catch {
      Swal.fire({ icon: 'warning', title: 'No encontrado', text: `No se encontró persona con "${id}". Puede ingresar el nombre manualmente.`, timer: 3000, showConfirmButton: false });
    } finally {
      setBuscandoPersona(false);
    }
  }

  async function handleCrear() {
    const requiereResponsable = form.tipo_solicitante === 'estudiante';
    if (!form.solicitante_documento || !form.solicitante_nombre || !form.nombre_bloque || !form.nombre_salon || !form.fecha || !form.hora_inicio || !form.hora_fin || !form.motivo) {
      Swal.fire({ icon: 'warning', title: 'Completa todos los campos obligatorios', text: 'Documento, nombre, bloque, salón, fecha, horario y motivo son requeridos.' });
      return;
    }
    if (requiereResponsable && (!form.responsable_documento || !form.responsable_nombre)) {
      Swal.fire({
        icon: 'warning',
        title: 'Falta profesor responsable',
        text: 'Si el solicitante es estudiante, debes registrar el documento y nombre del profesor responsable.',
      });
      return;
    }
    let forzar = false;
    try {
      const res = await reservasApi.validar({
        nombre_salon: form.nombre_salon,
        fecha: form.fecha,
        hora_inicio: form.hora_inicio,
        hora_fin: form.hora_fin,
      });
      const { tiene_conflictos, conflictos } = res.data.data;
      if (tiene_conflictos) {
        const detalles = conflictos.map((c) => `• [${c.tipo}] ${c.detalle}`).join('<br/>');
        const confirm = await Swal.fire({
          icon: 'warning',
          title: 'Conflictos detectados',
          html: `<p class="text-sm text-left mb-2">El horario seleccionado tiene solapamientos:</p>${detalles}`,
          showCancelButton: true,
          confirmButtonText: 'Crear de todas formas',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#d97706',
        });
        if (!confirm.isConfirmed) return;
        forzar = true;
      }
    } catch {
      // Si el endpoint falla, continuar sin forzar
    }
    try {
      await crear.mutateAsync({ ...form, forzar });
      Swal.fire({ icon: 'success', title: 'Reserva creada', timer: 1500, showConfirmButton: false });
      cerrarForm();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo crear la reserva' });
    }
  }

  async function handleCancelar(row) {
    const tieneLlaveEntregada = Boolean(row?.llave_entregada);
    const r = await Swal.fire({
      title: tieneLlaveEntregada ? '¿Cancelar reserva con llave entregada?' : '¿Cancelar reserva?',
      icon: 'warning',
      html: tieneLlaveEntregada
        ? '<p class="text-sm">Este docente ya recibió la llave. Si continúas, se cancelará la reserva y se registrará la devolución en historial con fecha/hora actual (oficina).</p>'
        : undefined,
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'No',
    });
    if (!r.isConfirmed) return;
    try {
      const resp = await cancelar.mutateAsync(String(row.id));
      const devolucionAuto = Boolean(resp?.data?.data?.devolucion_automatica_registrada);
      Swal.fire({
        icon: 'success',
        title: devolucionAuto ? 'Reserva cancelada y llave devuelta' : 'Reserva cancelada',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'Error' });
    }
  }

  function handleIniciarEdicion(row) {
    const modo = isEnCurso(row) ? 'en_curso' : 'completo';
    const fechaStr = new Date(row.fecha).toLocaleDateString('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    setForm({
      nombre_bloque: row.nombre_bloque || '',
      nombre_salon: row.nombre_salon || '',
      fecha: fechaStr,
      hora_inicio: row.hora_inicio || '',
      hora_fin: row.hora_fin || '',
      motivo: row.motivo || '',
      solicitante_documento: row.solicitante_documento || '',
      solicitante_nombre: row.solicitante_nombre || '',
      tipo_solicitante: row.tipo_solicitante || 'docente',
      responsable_documento: row.responsable_documento || '',
      responsable_nombre: row.responsable_nombre || '',
      entregar_llave: false,
    });
    setSolicitanteEncontrado(row.solicitante_nombre ? { nombre: row.solicitante_nombre } : null);
    if (row.tipo_solicitante === 'estudiante' && row.responsable_nombre) {
      setResponsableEncontrado({ nombre: row.responsable_nombre });
    } else {
      setResponsableEncontrado(null);
    }
    setEditando({ reserva: row, modo });
    setVista('nueva');
  }

  async function handleGuardarEdicion() {
    if (!editando?.reserva) return;
    const id = String(editando.reserva.id);
    const payload = editando.modo === 'en_curso'
      ? { id, hora_fin: form.hora_fin, motivo: form.motivo }
      : { id, nombre_bloque: form.nombre_bloque, nombre_salon: form.nombre_salon, fecha: form.fecha, hora_inicio: form.hora_inicio, hora_fin: form.hora_fin, motivo: form.motivo };
    try {
      await editar.mutateAsync(payload);
      Swal.fire({ icon: 'success', title: 'Reserva actualizada', timer: 1500, showConfirmButton: false });
      cerrarForm();
    } catch (err) {
      if (err.response?.status === 409) {
        const confirm = await Swal.fire({
          icon: 'warning',
          title: 'Conflictos detectados',
          text: err.response?.data?.message ?? 'El horario tiene conflictos con otro evento.',
          showCancelButton: true,
          confirmButtonText: 'Guardar de todas formas',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#d97706',
        });
        if (!confirm.isConfirmed) return;
        try {
          await editar.mutateAsync({ ...payload, forzar: true });
          Swal.fire({ icon: 'success', title: 'Reserva actualizada', timer: 1500, showConfirmButton: false });
          cerrarForm();
        } catch (err2) {
          Swal.fire({ icon: 'error', title: 'Error', text: err2.response?.data?.message ?? 'No se pudo guardar la reserva' });
        }
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'No se pudo editar la reserva' });
      }
    }
  }

  function handleReservarDesdeResultado(salon) {
    setForm((f) => ({
      ...f,
      nombre_bloque: salon.nombre_bloque || '',
      nombre_salon: salon.nombre_salon || '',
      fecha: buscarParams?.fecha || '',
      hora_inicio: buscarParams?.hora_inicio || '',
      hora_fin: buscarParams?.hora_fin || '',
    }));
    setVista('nueva');
  }

  function abrirNuevaReserva() {
    setEditando({ reserva: null, modo: null });
    setVista('nueva');
  }

  function cerrarForm() {
    setVista('reservas');
    setSolicitanteEncontrado(null);
    setResponsableEncontrado(null);
    setEditando({ reserva: null, modo: null });
    setForm({
      nombre_bloque: '',
      nombre_salon: '',
      fecha: getHoy(),
      hora_inicio: '',
      hora_fin: '',
      motivo: '',
      solicitante_documento: '',
      solicitante_nombre: '',
      tipo_solicitante: 'docente',
      responsable_documento: '',
      responsable_nombre: '',
      entregar_llave: false,
    });
  }


  function isSlotInRange(slotHora) {
    if (!form.hora_inicio) return false;
    if (form.hora_fin) return slotHora >= form.hora_inicio && slotHora < form.hora_fin;
    return slotHora === form.hora_inicio;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Reservas Individuales
          </h1>
          <p className="text-muted-foreground text-sm">{reservas.length} reservas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0 overflow-x-auto">
        {[
          { id: 'nueva', label: 'Nueva reserva', icon: Plus },
          { id: 'buscar', label: 'Buscar salón disponible', icon: Sparkles },
          { id: 'reservas', label: 'Reservas', icon: CalendarDays },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => (id === 'nueva' ? abrirNuevaReserva() : setVista(id))}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap',
              vista === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {vista === 'buscar' && (
        <ReservasBuscarTab
          buscarForm={buscarForm}
          setBuscarForm={setBuscarForm}
          buscarParams={buscarParams}
          setBuscarParams={setBuscarParams}
          salonesLibresFiltrados={salonesLibresFiltrados}
          porBloque={porBloque}
          salonesVista={salonesVista}
          bloqueSeleccionado={bloqueSeleccionado}
          setBloqueSeleccionado={setBloqueSeleccionado}
          buscandoSalones={buscandoSalones}
          tiposSilleteria={tiposSilleteria}
          handleReservarDesdeResultado={handleReservarDesdeResultado}
        />
      )}

      {vista === 'nueva' && (
        <ReservasNuevaTab
          form={form}
          setForm={setForm}
          salones={salones}
          disponibilidad={disponibilidad}
          solicitanteEncontrado={solicitanteEncontrado}
          setSolicitanteEncontrado={setSolicitanteEncontrado}
          responsableEncontrado={responsableEncontrado}
          setResponsableEncontrado={setResponsableEncontrado}
          buscandoPersona={buscandoPersona}
          objetivoEscaneo={objetivoEscaneo}
          handleCrear={handleCrear}
          cerrarForm={cerrarForm}
          isSlotInRange={isSlotInRange}
          buscarPersona={buscarPersona}
          isPendingCrear={crear.isPending}
          editando={editando}
          handleGuardarEdicion={handleGuardarEdicion}
          isPendingEditar={editar.isPending}
        />
      )}

      {vista === 'reservas' && (
        <ReservasListaTab
          reservas={reservas}
          isLoading={isLoading}
          filters={filters}
          setFilters={setFilters}
          bloques={bloques}
          reservaDetalle={reservaDetalle}
          setReservaDetalle={setReservaDetalle}
          handleCancelar={handleCancelar}
          onEditar={handleIniciarEdicion}
        />
      )}
    </div>
  );
}
