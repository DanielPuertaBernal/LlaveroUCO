import { useState, useEffect } from 'react';
import { comunidadApi } from '@/features/comunidad/comunidadApi';
import { useMonitores, useClasesDocente, useRegistrarMonitor, useEliminarMonitor } from './monitoresApi';
import { showSuccess, showError, showConfirm } from '@/shared/utils/alert';
import { GraduationCap, Search, Check, ArrowLeft, CheckCircle2, Trash2, CreditCard, Loader2 } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/FormField';
import { cn } from '@/shared/lib/utils';
import { abrirBuscadorPersonaPorNombre } from '@/shared/utils/personaSearchHotkey';

const PASOS = { ESCANEAR_DOCENTE: 0, SELECCIONAR_MATERIA: 1, ESCANEAR_MONITOR: 2, CONFIRMAR: 3 };

export default function MonitoresPage() {
  const [paso, setPaso] = useState(PASOS.ESCANEAR_DOCENTE);
  const [docente, setDocente] = useState(null);
  const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [busquedaManual, setBusquedaManual] = useState('');

  const registrar = useRegistrarMonitor();
  const eliminar = useEliminarMonitor();

  const documentoDocente = docente?.numero_documento || '';
  const { data: clases = [] } = useClasesDocente(documentoDocente);
  const { data: monitoresExistentes = [], refetch: refetchMonitores } = useMonitores(documentoDocente);

  useEffect(() => {
    const pasoPermiteBusqueda = paso === PASOS.ESCANEAR_DOCENTE || paso === PASOS.ESCANEAR_MONITOR;
    if (!pasoPermiteBusqueda) return;
    const onKeyDown = (e) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      void handleBuscarNombreConF1();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paso]);

  function aplicarPersonaPorPaso(persona) {
    if (!persona) return;
    if (paso === PASOS.ESCANEAR_DOCENTE) {
      setDocente(persona);
      setMonitor(null);
      setMateriaSeleccionada(null);
      setPaso(PASOS.SELECCIONAR_MATERIA);
      return;
    }
    if (paso === PASOS.ESCANEAR_MONITOR) {
      setMonitor(persona);
      setPaso(PASOS.CONFIRMAR);
    }
  }

  async function handleBuscarNombreConF1() {
    const esPasoDocente = paso === PASOS.ESCANEAR_DOCENTE;
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: esPasoDocente ? 'Buscar docente por nombre (F1)' : 'Buscar monitor por nombre (F1)',
      tipo: esPasoDocente ? 'docente' : 'estudiante',
      placeholder: esPasoDocente ? 'Nombre del docente' : 'Nombre del monitor',
    });
    if (!persona) return;
    aplicarPersonaPorPaso(persona);
  }

  async function buscarPersona(identificador, tipo) {
    if (!identificador) return;
    setBuscando(true);
    try {
      let res;
      const esDocumento = /^\d+$/.test(identificador);

      if (esDocumento) {
        try {
          res = await comunidadApi.buscarPorDocumento(identificador);
        } catch (_) {
          res = await comunidadApi.buscarPorCarnet(identificador);
        }
      } else {
        try {
          res = await comunidadApi.buscarPorCarnet(identificador);
        } catch (_) {
          res = await comunidadApi.buscarPorDocumento(identificador);
        }
      }

      const persona = res.data.data.persona;
      if (tipo === 'docente') {
        setDocente(persona);
        setMonitor(null);
        setMateriaSeleccionada(null);
        setPaso(PASOS.SELECCIONAR_MATERIA);
      } else {
        setMonitor(persona);
        setPaso(PASOS.CONFIRMAR);
      }
    } catch {
      showError(
        tipo === 'docente'
          ? `No se encontró ningún docente con el identificador "${identificador}". Verifique el número de documento o código de carnet.`
          : `No se encontró ninguna persona con el identificador "${identificador}". Verifique el número de documento o código de carnet.`
      );
    } finally {
      setBuscando(false);
    }
  }

  function handleBusquedaManual(tipo) {
    const valor = busquedaManual.trim();
    if (!valor) return;
    buscarPersona(valor, tipo);
    setBusquedaManual('');
  }

  async function handleConfirmar() {
    if (!docente || !monitor || !materiaSeleccionada) return;
    try {
      const res = await registrar.mutateAsync({
        numero_documento_docente: docente.numero_documento,
        numero_documento_monitor: monitor.numero_documento,
        materia: materiaSeleccionada.materia,
        aula: materiaSeleccionada.aula || '',
        horario: materiaSeleccionada.horario || '',
        dia: materiaSeleccionada.dia || '',
      });
      showSuccess(res.data?.message || 'Monitor registrado correctamente');
      refetchMonitores();
      reiniciar();
    } catch (err) {
      const msg = err.response?.data?.message;
      const status = err.response?.status;
      if (status === 400 && msg?.includes('sí mismo')) {
        showError('El docente no puede ser registrado como su propio monitor');
      } else if (status === 404) {
        showError(`No se encontró la persona indicada. ${msg || 'Verifique los datos e intente nuevamente.'}`);
      } else {
        showError(msg || 'No se pudo registrar el monitor. Intente nuevamente.');
      }
    }
  }

  async function handleEliminar(id, nombre) {
    const c = await showConfirm('Eliminar monitor', `¿Eliminar a ${nombre} como monitor?`);
    if (!c.isConfirmed) return;
    try {
      await eliminar.mutateAsync(id);
      showSuccess('Monitor eliminado correctamente');
      refetchMonitores();
    } catch (err) {
      const msg = err.response?.data?.message;
      showError(msg || 'No se pudo eliminar el monitor. Intente nuevamente.');
    }
  }

  function reiniciar() {
    setPaso(PASOS.ESCANEAR_DOCENTE);
    setMonitor(null);
    setMateriaSeleccionada(null);
  }

  // Materias únicas del docente
  const materiasUnicas = clases.reduce((acc, c) => {
    const key = `${c.materia}|${c.aula}|${c.dia}|${c.horario}`;
    if (!acc.find((x) => `${x.materia}|${x.aula}|${x.dia}|${x.horario}` === key)) acc.push(c);
    return acc;
  }, []);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <GraduationCap className="h-6 w-6" />Monitores del Docente
      </h1>

      {/* Wizard de registro */}
      <div className="bg-card border border-border rounded-lg p-6">
        <StepIndicator paso={paso} />

        {/* Paso 0: Escanear docente */}
        {paso === PASOS.ESCANEAR_DOCENTE && (
          <div className="space-y-4">
            <NfcIndicator buscando={buscando}
              msgBuscando="Buscando docente..."
              msgListo="Pase el carnet por el lector o escriba el documento del docente" />
            <div className="flex gap-2">
              <Input
                value={busquedaManual}
                onChange={(e) => setBusquedaManual(e.target.value)}
                placeholder="Documento o código de carnet del docente..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleBusquedaManual('docente')}
              />
              <Button onClick={() => handleBusquedaManual('docente')} size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Atajo: F1 para buscar docente por nombre.</p>
          </div>
        )}

        {/* Paso 1: Seleccionar materia */}
        {paso === PASOS.SELECCIONAR_MATERIA && docente && (
          <div className="space-y-4">
            <PersonaCard persona={docente} tipo="Docente" />
            <h3 className="font-medium text-foreground text-sm">Seleccione la materia para el monitor:</h3>
            {materiasUnicas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Este docente no tiene clases programadas</p>
            ) : (
              <div className="grid gap-2">
                {materiasUnicas.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => { setMateriaSeleccionada(c); setPaso(PASOS.ESCANEAR_MONITOR); }}
                    className={cn(
                      'text-left border rounded-lg px-4 py-3 text-sm hover:border-primary transition-colors',
                      materiaSeleccionada === c ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <div className="font-medium text-foreground">{c.materia}</div>
                    <div className="text-muted-foreground text-xs mt-1">
                      {c.dia} · {c.horario} · Aula {c.aula}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={reiniciar} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />Cambiar docente
            </button>
          </div>
        )}

        {/* Paso 2: Escanear monitor */}
        {paso === PASOS.ESCANEAR_MONITOR && (
          <div className="space-y-4">
            <PersonaCard persona={docente} tipo="Docente" compact />
            <div className="bg-muted border border-border rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">Materia:</span> <strong className="text-foreground">{materiaSeleccionada?.materia}</strong>
              <span className="text-muted-foreground ml-2">{materiaSeleccionada?.dia} · {materiaSeleccionada?.horario}</span>
            </div>
            <NfcIndicator buscando={buscando}
              msgBuscando="Buscando persona..."
              msgListo="Pase el carnet por el lector o escriba el documento del monitor" />
            <div className="flex gap-2">
              <Input
                value={busquedaManual}
                onChange={(e) => setBusquedaManual(e.target.value)}
                placeholder="Documento o código de carnet del monitor..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleBusquedaManual('monitor')}
              />
              <Button onClick={() => handleBusquedaManual('monitor')} size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Atajo: F1 para buscar monitor por nombre.</p>
            <button onClick={() => setPaso(PASOS.SELECCIONAR_MATERIA)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />Cambiar materia
            </button>
          </div>
        )}

        {/* Paso 3: Confirmar */}
        {paso === PASOS.CONFIRMAR && monitor && (
          <div className="space-y-4">
            <PersonaCard persona={docente} tipo="Docente" compact />
            <div className="bg-muted border border-border rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">Materia:</span> <strong className="text-foreground">{materiaSeleccionada?.materia}</strong>
              <span className="text-muted-foreground ml-2">{materiaSeleccionada?.dia} · {materiaSeleccionada?.horario}</span>
            </div>
            <PersonaCard persona={monitor} tipo="Monitor" />
            <div className="flex gap-3">
              <Button
                variant="success"
                onClick={handleConfirmar}
                disabled={registrar.isPending}
                className="flex-1"
              >
                {registrar.isPending ? 'Registrando...' : 'Confirmar Monitor'}
              </Button>
              <Button variant="outline" onClick={() => { setMonitor(null); setPaso(PASOS.ESCANEAR_MONITOR); }}>
                Cambiar monitor
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de monitores del docente */}
      {docente && (
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">
              Monitores de {docente.nombre} ({monitoresExistentes.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {monitoresExistentes.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground text-center">Sin monitores registrados</p>
            ) : (
              monitoresExistentes.map((m) => (
                <div key={m._id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.nombre_monitor}</p>
                    <p className="text-xs text-muted-foreground">
                      Doc: {m.numero_documento_monitor} · {m.materia} · {m.dia} {m.horario}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleEliminar(m._id, m.nombre_monitor)}
                    disabled={eliminar.isPending}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />Eliminar
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NfcIndicator({ buscando, msgBuscando, msgListo }) {
  return (
    <div className={cn(
      'flex items-center gap-2 text-sm px-3 py-3 rounded-lg',
      buscando
        ? 'bg-warning/10 border border-warning/20 text-warning'
        : 'bg-muted border border-border text-muted-foreground'
    )}>
      {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      {buscando ? msgBuscando : msgListo}
    </div>
  );
}

function StepIndicator({ paso }) {
  const steps = ['Docente', 'Materia', 'Monitor', 'Confirmar'];
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
            i < paso ? 'bg-success text-white' : i === paso ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}>
            {i < paso ? <Check className="h-3 w-3" /> : i + 1}
          </div>
          <span className={cn('text-xs hidden sm:inline', i === paso ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
          {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

function PersonaCard({ persona, tipo, compact }) {
  if (compact) {
    return (
      <div className="bg-success/10 border border-success/20 text-success text-sm px-3 py-2 rounded-lg flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-muted-foreground">{tipo}:</span> <strong>{persona.nombre}</strong>
        <span className="text-xs text-muted-foreground ml-auto">{persona.numero_documento}</span>
      </div>
    );
  }

  return (
    <div className="bg-success/10 border border-success/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span className="text-sm font-medium text-success">{tipo} identificado</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Nombre:</span> <strong className="text-foreground">{persona.nombre}</strong></div>
        <div><span className="text-muted-foreground">Documento:</span> <span className="text-foreground">{persona.numero_documento}</span></div>
        {persona.facultad && <div><span className="text-muted-foreground">Facultad:</span> <span className="text-foreground">{persona.facultad}</span></div>}
        {persona.correo && <div><span className="text-muted-foreground">Correo:</span> <span className="text-foreground">{persona.correo}</span></div>}
      </div>
    </div>
  );
}
