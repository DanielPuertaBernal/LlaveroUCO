import { useState, useEffect } from 'react';
import { comunidadApi } from '@/features/comunidad/comunidadApi';
import { useMonitores, useClasesDocente, useRegistrarMonitor, useEliminarMonitor } from './monitoresApi';
import { showSuccess, showError, showConfirm } from '@/shared/utils/alert';
import { GraduationCap, Search, CheckCircle2, Trash2, CreditCard, Loader2, Pencil, Plus, X } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/FormField';
import { cn } from '@/shared/lib/utils';
import { abrirBuscadorPersonaPorNombre } from '@/shared/utils/personaSearchHotkey';
import { soloNumerosConTope, LONGITUD_MAXIMA } from '@/shared/utils/inputValidation';

const TABS = { REGISTRAR: 'registrar', GESTIONAR: 'gestionar' };

/** Búsqueda de una persona por documento o carnet, probando ambos en cualquier orden. */
function useBuscarPersona() {
  const [buscando, setBuscando] = useState(false);

  async function buscar(identificador) {
    setBuscando(true);
    try {
      const esDocumento = /^\d+$/.test(identificador);
      let res;
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
      return res.data.data.persona;
    } finally {
      setBuscando(false);
    }
  }

  return { buscar, buscando };
}

/** Materias únicas de un docente (mismas materia+aula+dia+horario colapsadas). */
function materiasUnicasDe(clases) {
  return clases.reduce((acc, c) => {
    const key = `${c.materia}|${c.aula}|${c.dia}|${c.horario}`;
    if (!acc.find((x) => `${x.materia}|${x.aula}|${x.dia}|${x.horario}` === key)) acc.push(c);
    return acc;
  }, []);
}

export default function MonitoresPage() {
  const [tab, setTab] = useState(TABS.REGISTRAR);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <GraduationCap className="h-6 w-6" />Monitores del Docente
      </h1>

      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab(TABS.REGISTRAR)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === TABS.REGISTRAR
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Registrar monitor
        </button>
        <button
          onClick={() => setTab(TABS.GESTIONAR)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === TABS.GESTIONAR
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Buscar y gestionar
        </button>
      </div>

      {tab === TABS.REGISTRAR ? <RegistrarTab /> : <GestionarTab />}
    </div>
  );
}

function RegistrarTab() {
  const [docente, setDocente] = useState(null);
  const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [busquedaDocente, setBusquedaDocente] = useState('');
  const [busquedaMonitor, setBusquedaMonitor] = useState('');
  const { buscar, buscando } = useBuscarPersona();
  const registrar = useRegistrarMonitor();

  const documentoDocente = docente?.numero_documento || '';
  const { data: clases = [] } = useClasesDocente(documentoDocente);
  const materiasUnicas = materiasUnicasDe(clases);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      if (!docente) void handleBuscarDocenteF1();
      else if (materiaSeleccionada && !monitor) void handleBuscarMonitorF1();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [docente, materiaSeleccionada, monitor]);

  async function handleBuscarDocenteF1() {
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: 'Buscar docente por nombre (F1)',
      tipo: 'docente',
      placeholder: 'Nombre del docente',
    });
    if (persona) seleccionarDocente(persona);
  }

  async function handleBuscarMonitorF1() {
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: 'Buscar monitor por nombre (F1)',
      tipo: 'estudiante',
      placeholder: 'Nombre del monitor',
    });
    if (persona) seleccionarMonitor(persona);
  }

  function seleccionarDocente(persona) {
    setDocente(persona);
    setMateriaSeleccionada(null);
    setMonitor(null);
  }

  function seleccionarMonitor(persona) {
    if (docente && String(persona.numero_documento) === String(docente.numero_documento)) {
      showError('El docente no puede ser monitor de sí mismo. Escanee o busque a otra persona.');
      return;
    }
    setMonitor(persona);
  }

  async function handleBuscarDocente() {
    const valor = busquedaDocente.trim();
    if (!valor) return;
    try {
      seleccionarDocente(await buscar(valor));
      setBusquedaDocente('');
    } catch {
      showError(`No se encontró ningún docente con el identificador "${valor}". Verifique el número de documento o código de carnet.`);
    }
  }

  async function handleBuscarMonitor() {
    const valor = busquedaMonitor.trim();
    if (!valor) return;
    try {
      seleccionarMonitor(await buscar(valor));
      setBusquedaMonitor('');
    } catch {
      showError(`No se encontró ninguna persona con el identificador "${valor}". Verifique el número de documento o código de carnet.`);
    }
  }

  function cambiarDocente() {
    setDocente(null);
    setMateriaSeleccionada(null);
    setMonitor(null);
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
      setMateriaSeleccionada(null);
      setMonitor(null);
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

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-foreground text-base">Registrar monitor</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Identifique al docente, seleccione la materia y el monitor. Los datos se registran cuando confirme al final.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Columna izquierda: Docente → Monitor → Confirmar */}
        <div className="space-y-5">
          {!docente ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">1. Docente</p>
              <NfcIndicator buscando={buscando}
                msgBuscando="Buscando docente..."
                msgListo="Pase el carnet por el lector o escriba el documento del docente" />
              <div className="flex gap-2">
                <Input
                  value={busquedaDocente}
                  onChange={(e) => setBusquedaDocente(soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento))}
                  placeholder="Documento o código de carnet del docente..."
                  className="flex-1"
                  maxLength={LONGITUD_MAXIMA.documento}
                  onKeyDown={(e) => e.key === 'Enter' && handleBuscarDocente()}
                />
                <Button onClick={handleBuscarDocente} size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Atajo: F1 para buscar docente por nombre.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">1. Docente</p>
              <PersonaCard persona={docente} tipo="Docente" compact onCambiar={cambiarDocente} />
            </div>
          )}

          {docente && materiaSeleccionada && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">3. Monitor</p>
              {!monitor ? (
                <>
                  <NfcIndicator buscando={buscando}
                    msgBuscando="Buscando persona..."
                    msgListo="Pase el carnet por el lector o escriba el documento del monitor" />
                  <div className="flex gap-2">
                    <Input
                      value={busquedaMonitor}
                      onChange={(e) => setBusquedaMonitor(soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento))}
                      placeholder="Documento o código de carnet del monitor..."
                      className="flex-1"
                      maxLength={LONGITUD_MAXIMA.documento}
                      onKeyDown={(e) => e.key === 'Enter' && handleBuscarMonitor()}
                    />
                    <Button onClick={handleBuscarMonitor} size="icon">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Atajo: F1 para buscar monitor por nombre.</p>
                </>
              ) : (
                <PersonaCard persona={monitor} tipo="Monitor" compact onCambiar={() => setMonitor(null)} />
              )}
            </div>
          )}

          {docente && materiaSeleccionada && monitor && (
            <Button
              variant="success"
              onClick={handleConfirmar}
              disabled={registrar.isPending}
              className="w-full"
            >
              {registrar.isPending ? 'Registrando...' : 'Confirmar y registrar monitor'}
            </Button>
          )}
        </div>

        {/* Columna derecha: Materia */}
        {docente && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">2. Materia</p>
            {materiasUnicas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Este docente no tiene clases programadas</p>
            ) : (
              <div className="grid gap-2">
                {materiasUnicas.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => { setMateriaSeleccionada(c); setMonitor(null); }}
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
          </div>
        )}
      </div>
    </div>
  );
}

function GestionarTab() {
  const [docente, setDocente] = useState(null);
  const [busquedaDocente, setBusquedaDocente] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);
  const [monitorNuevo, setMonitorNuevo] = useState(null);
  const [busquedaMonitor, setBusquedaMonitor] = useState('');
  const { buscar, buscando } = useBuscarPersona();
  const registrar = useRegistrarMonitor();

  const documentoDocente = docente?.numero_documento || '';
  const { data: clases = [] } = useClasesDocente(documentoDocente);
  const { data: monitoresExistentes = [], refetch: refetchMonitores } = useMonitores(documentoDocente);
  const materiasUnicas = materiasUnicasDe(clases);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      if (!docente) void handleBuscarDocenteF1();
      else if (agregando && materiaSeleccionada && !monitorNuevo) void handleBuscarMonitorF1();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [docente, agregando, materiaSeleccionada, monitorNuevo]);

  async function handleBuscarDocenteF1() {
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: 'Buscar docente por nombre (F1)',
      tipo: 'docente',
      placeholder: 'Nombre del docente',
    });
    if (persona) setDocente(persona);
  }

  async function handleBuscarMonitorF1() {
    const persona = await abrirBuscadorPersonaPorNombre({
      titulo: 'Buscar monitor por nombre (F1)',
      tipo: 'estudiante',
      placeholder: 'Nombre del monitor',
    });
    if (persona) seleccionarMonitorNuevo(persona);
  }

  async function handleBuscarDocente() {
    const valor = busquedaDocente.trim();
    if (!valor) return;
    try {
      setDocente(await buscar(valor));
      setBusquedaDocente('');
    } catch {
      showError(`No se encontró ningún docente con el identificador "${valor}". Verifique el número de documento o código de carnet.`);
    }
  }

  function cambiarDocente() {
    setDocente(null);
    cerrarAgregar();
  }

  function cerrarAgregar() {
    setAgregando(false);
    setMateriaSeleccionada(null);
    setMonitorNuevo(null);
    setBusquedaMonitor('');
  }

  function seleccionarMonitorNuevo(persona) {
    if (docente && String(persona.numero_documento) === String(docente.numero_documento)) {
      showError('El docente no puede ser monitor de sí mismo. Escanee o busque a otra persona.');
      return;
    }
    setMonitorNuevo(persona);
  }

  async function handleBuscarMonitor() {
    const valor = busquedaMonitor.trim();
    if (!valor) return;
    try {
      seleccionarMonitorNuevo(await buscar(valor));
      setBusquedaMonitor('');
    } catch {
      showError(`No se encontró ninguna persona con el identificador "${valor}". Verifique el número de documento o código de carnet.`);
    }
  }

  async function handleAgregarMonitor() {
    if (!docente || !monitorNuevo || !materiaSeleccionada) return;
    try {
      const res = await registrar.mutateAsync({
        numero_documento_docente: docente.numero_documento,
        numero_documento_monitor: monitorNuevo.numero_documento,
        materia: materiaSeleccionada.materia,
        aula: materiaSeleccionada.aula || '',
        horario: materiaSeleccionada.horario || '',
        dia: materiaSeleccionada.dia || '',
      });
      showSuccess(res.data?.message || 'Monitor registrado correctamente');
      refetchMonitores();
      cerrarAgregar();
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

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-foreground text-base">Buscar docente</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Busque un docente para ver, agregar o quitar sus monitores.
          </p>
        </div>
        {!docente ? (
          <div className="space-y-3">
            <NfcIndicator buscando={buscando}
              msgBuscando="Buscando docente..."
              msgListo="Pase el carnet por el lector o escriba el documento del docente" />
            <div className="flex gap-2">
              <Input
                value={busquedaDocente}
                onChange={(e) => setBusquedaDocente(e.target.value)}
                placeholder="Documento o código de carnet del docente..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleBuscarDocente()}
              />
              <Button onClick={handleBuscarDocente} size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Atajo: F1 para buscar docente por nombre.</p>
          </div>
        ) : (
          <PersonaCard persona={docente} tipo="Docente" compact onCambiar={cambiarDocente} />
        )}
      </div>

      {docente && (
        <ListaMonitores
          docente={docente}
          monitores={monitoresExistentes}
          onEliminado={refetchMonitores}
          accion={
            !agregando ? (
              <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Agregar monitor
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={cerrarAgregar}>
                <X className="h-3.5 w-3.5 mr-1" />Cancelar
              </Button>
            )
          }
        >
          {agregando && (
            <div className="px-4 py-4 space-y-4 border-t border-border bg-muted/30">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Materia</p>
                {materiasUnicas.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Este docente no tiene clases programadas</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {materiasUnicas.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => { setMateriaSeleccionada(c); setMonitorNuevo(null); }}
                        className={cn(
                          'text-left border rounded-lg px-4 py-3 text-sm hover:border-primary transition-colors bg-card',
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
              </div>

              {materiaSeleccionada && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Monitor</p>
                  {!monitorNuevo ? (
                    <>
                      <div className="flex gap-2">
                        <Input
                          value={busquedaMonitor}
                          onChange={(e) => setBusquedaMonitor(soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento))}
                          placeholder="Documento o código de carnet del monitor..."
                          className="flex-1"
                          maxLength={LONGITUD_MAXIMA.documento}
                          onKeyDown={(e) => e.key === 'Enter' && handleBuscarMonitor()}
                        />
                        <Button onClick={handleBuscarMonitor} size="icon">
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Atajo: F1 para buscar monitor por nombre.</p>
                    </>
                  ) : (
                    <PersonaCard persona={monitorNuevo} tipo="Monitor" compact onCambiar={() => setMonitorNuevo(null)} />
                  )}
                </div>
              )}

              {materiaSeleccionada && monitorNuevo && (
                <Button
                  variant="success"
                  onClick={handleAgregarMonitor}
                  disabled={registrar.isPending}
                  className="w-full"
                >
                  {registrar.isPending ? 'Registrando...' : 'Confirmar y agregar monitor'}
                </Button>
              )}
            </div>
          )}
        </ListaMonitores>
      )}
    </div>
  );
}

function ListaMonitores({ docente, monitores, onEliminado, accion, children }) {
  const eliminar = useEliminarMonitor();

  async function handleEliminar(id, nombre) {
    const c = await showConfirm('Eliminar monitor', `¿Eliminar a ${nombre} como monitor?`);
    if (!c.isConfirmed) return;
    try {
      await eliminar.mutateAsync(id);
      showSuccess('Monitor eliminado correctamente');
      onEliminado?.();
    } catch (err) {
      const msg = err.response?.data?.message;
      showError(msg || 'No se pudo eliminar el monitor. Intente nuevamente.');
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground text-sm">
          Monitores de {docente.nombre} ({monitores.length})
        </h2>
        {accion}
      </div>
      <div className="divide-y divide-border">
        {monitores.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground text-center">Sin monitores registrados</p>
        ) : (
          monitores.map((m) => (
            <div key={m.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{m.nombre_monitor}</p>
                <p className="text-xs text-muted-foreground">
                  Doc: {m.numero_documento_monitor} · {m.materia} · {m.dia} {m.horario}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleEliminar(m.id, m.nombre_monitor)}
                disabled={eliminar.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1" />Eliminar
              </Button>
            </div>
          ))
        )}
      </div>
      {children}
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

function PersonaCard({ persona, tipo, compact, onCambiar }) {
  if (compact) {
    return (
      <div className="bg-success/10 border border-success/20 text-success text-sm px-3 py-2 rounded-lg flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-muted-foreground">{tipo}:</span> <strong>{persona.nombre}</strong>
        <span className="text-xs text-muted-foreground ml-2">{persona.numero_documento}</span>
        {onCambiar && (
          <button
            onClick={onCambiar}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />Cambiar
          </button>
        )}
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
