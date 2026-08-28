import { useState, useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import DataTable from '@/shared/components/DataTable';
import { useLlavesPendientes, useEntregarLlave, useDevolverLlave } from './llavesApi';
import { useSalones } from '@/features/salones/salonesApi';
import { comunidadApi } from '@/features/comunidad/comunidadApi';
import { useUbicacionesOperativas } from '@/shared/hooks/useUbicacionesOperativas';
import { showSuccess, showError } from '@/shared/utils/alert';
import { getPuntoAtencion } from '@/shared/utils/puntoAtencion';
import { UBICACIONES } from '@/shared/constants';
import Swal from '@/shared/lib/swal';
import { Key, Lock, LockOpen, Search, Loader2, CheckCircle2, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/features/auth/authStore';
import { ROLES } from '@/shared/constants';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import Button from '@/shared/components/ui/Button';
import { FormField, Input, Select } from '@/shared/components/ui/FormField';
import { cn } from '@/shared/lib/utils';
import { soloNumerosConTope, LONGITUD_MAXIMA } from '@/shared/utils/inputValidation';

dayjs.extend(customParseFormat);

function normalizarNombreSalon(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildPendientesColumns({ getUbicacionLabel, devolucionOptions = [], defaultUbicacionDevolucion }) {
  return [
    { key: 'materia', label: 'Materia / Motivo' },
    { key: 'docente', label: 'Docente' },
    { key: 'aula', label: 'Aula' },
    { key: 'horario', label: 'Horario' },
    { key: 'fechaEntrega', label: 'F. Entrega' },
    { key: 'horaEntrega', label: 'H. Entrega' },
    {
      key: 'ubicacionPrestamo',
      label: 'Atendido en',
      render: (v, row) => getPuntoAtencion(row, v, getUbicacionLabel),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (v) => (
        <StatusBadge variant="warning">{v}</StatusBadge>
      ),
    },
    {
      key: '_accion',
      label: 'Acción',
      render: (_, row) => (
        <DevolucionBtn
          documento={row.documento}
          nombre={row.docente}
          devolucionOptions={devolucionOptions}
          defaultUbicacionDevolucion={defaultUbicacionDevolucion}
          getUbicacionLabel={getUbicacionLabel}
        />
      ),
    },
  ];
}

function DevolucionBtn({ documento, nombre, devolucionOptions = [], defaultUbicacionDevolucion, getUbicacionLabel }) {
  const devolver = useDevolverLlave();

  async function onDevolver() {
    const options = (devolucionOptions.length ? devolucionOptions : [{ clave: defaultUbicacionDevolucion }])
      .map((ubicacion) => `
        <option value="${ubicacion.clave}" ${ubicacion.clave === defaultUbicacionDevolucion ? 'selected' : ''}>
          ${getUbicacionLabel(ubicacion.clave)}
        </option>
      `)
      .join('');

    const result = await Swal.fire({
      title: 'Registrar devolución',
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.8">
          <p>Se registrará la devolución para <b>${nombre || 'este docente'}</b>.</p>
          <label style="display:block;font-size:13px;font-weight:600;margin:10px 0 6px;color:hsl(var(--foreground))">Ubicación de devolución</label>
          <select id="swal-ubicacion-devolucion" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;background:hsl(var(--card));height:42px">
            ${options}
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => ({
        ubicacion: document.getElementById('swal-ubicacion-devolucion').value,
      }),
    });

    if (!result.isConfirmed) return;
    const payload = { documento, ubicacion: result.value.ubicacion || defaultUbicacionDevolucion };
    devolver.mutate(payload);
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={onDevolver}
      disabled={devolver.isPending}
    >
      Devolver
    </Button>
  );
}

const TAB_CONFIG = [
  { key: 'entregar', label: 'Registrar Préstamo Individual', Icon: LockOpen },
  { key: 'pendientes', label: 'Pendientes Individuales', Icon: Lock, showCount: true },
];

export default function LlavesPage() {
  const [tab, setTab] = useState('entregar');
  const usuario = useAuthStore((s) => s.usuario);
  const esUsuarioAdmin = usuario?.rol === ROLES.ADMIN;
  const { data: pendientes = [], isLoading } = useLlavesPendientes();
  const { data: salones = [] } = useSalones({ enabled: tab === 'entregar' });
  const {
    getUbicacionLabel,
    devolucionLlavesOptions,
    ubicacionPrestamoLlavesDefault,
    ubicacionDevolucionLlavesDefault,
  } = useUbicacionesOperativas();
  const entregar = useEntregarLlave();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      nroidenti: '',
      profesor: '',
      facultad: '',
      aula: '',
      hora_inicio: '',
      hora_fin: '',
      motivo: '',
      ubicacion: UBICACIONES.OFICINA,
    },
  });
  const [buscandoCarnet, setBuscandoCarnet] = useState(false);
  const [docenteEncontrado, setDocenteEncontrado] = useState(null);
  const [lookupValue, setLookupValue] = useState('');
  const [mostrarSugerenciasAula, setMostrarSugerenciasAula] = useState(false);

  const fallbackInputRef = useRef(null);
  const aulaBusqueda = watch('aula') || '';
  const opcionesDevolucionLlaves = devolucionLlavesOptions.length
    ? devolucionLlavesOptions
    : [{ clave: ubicacionDevolucionLlavesDefault, nombre: getUbicacionLabel(ubicacionDevolucionLlavesDefault) }];
  const columnasPendientes = useMemo(
    () => buildPendientesColumns({
      getUbicacionLabel,
      devolucionOptions: opcionesDevolucionLlaves,
      defaultUbicacionDevolucion: ubicacionDevolucionLlavesDefault,
    }),
    [getUbicacionLabel, opcionesDevolucionLlaves, ubicacionDevolucionLlavesDefault]
  );
  const sugerenciasAula = useMemo(() => {
    const query = normalizarNombreSalon(aulaBusqueda);
    if (!query) return [];

    return salones
      .filter((salon) => normalizarNombreSalon(salon.nombre_salon).includes(query))
      .slice(0, 8);
  }, [aulaBusqueda, salones]);

  // Al entrar a la pestaña de entrega, limpiar el formulario y enfocar el lector de carnet.
  useEffect(() => {
    if (tab === 'entregar') {
      limpiarDocenteSeleccionado();
    }
  }, [tab]);

  useEffect(() => {
    setValue('ubicacion', ubicacionPrestamoLlavesDefault, { shouldDirty: false });
  }, [setValue, ubicacionPrestamoLlavesDefault]);

  // Fallback para lectores USB que no envían Enter tras el código: si el valor
  // deja de cambiar por un instante, se dispara la búsqueda automáticamente.
  useEffect(() => {
    if (tab !== 'entregar') return;
    if (!lookupValue.trim() || docenteEncontrado || buscandoCarnet) return;
    const t = setTimeout(() => buscarDocente(lookupValue), 400);
    return () => clearTimeout(t);
  }, [lookupValue, tab]);

  function limpiarDocenteSeleccionado() {
    setDocenteEncontrado(null);
    setLookupValue('');
    setBuscandoCarnet(false);
    setMostrarSugerenciasAula(false);
    reset({
      nroidenti: '',
      profesor: '',
      facultad: '',
      aula: '',
      hora_inicio: '',
      hora_fin: '',
      motivo: '',
      ubicacion: ubicacionPrestamoLlavesDefault,
    });
    setValue('nroidenti', '');
    setValue('profesor', '');
    setValue('facultad', '');
    setTimeout(() => fallbackInputRef.current?.focus(), 0);
  }

  async function buscarDocente(idCarnet) {
    const identificador = String(idCarnet || '').trim();
    if (!identificador) return;
    setBuscandoCarnet(true);
    setDocenteEncontrado(null);
    setLookupValue(identificador);
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

      const doc = res.data.data.persona;
      setDocenteEncontrado(doc);
      setValue('nroidenti', doc.numero_documento || '');
      setValue('profesor', doc.nombre || '');
      setValue('facultad', doc.facultad || '');
    } catch {
      showError(`No se encontró docente con "${identificador}". Verifique el número de documento o código de carnet.`);
      setValue('nroidenti', '');
      setValue('profesor', '');
      setValue('facultad', '');
    } finally {
      setBuscandoCarnet(false);
    }
  }

  async function onEntregar(data) {
    const aulaNormalizada = normalizarNombreSalon(data.aula);
    const salonSeleccionado = salones.find(
      (salon) => normalizarNombreSalon(salon.nombre_salon) === aulaNormalizada
    );
    const payload = {
      ...data,
      aula: salonSeleccionado?.nombre_salon || data.aula,
      origen: 'individual',
    };
    try {
      const res = await entregar.mutateAsync(payload);
      reset({
        nroidenti: '',
        profesor: '',
        facultad: '',
        aula: '',
        hora_inicio: '',
        hora_fin: '',
        motivo: '',
        ubicacion: ubicacionPrestamoLlavesDefault,
      });
      setDocenteEncontrado(null);
      setLookupValue('');
      setMostrarSugerenciasAula(false);
      setTimeout(() => fallbackInputRef.current?.focus(), 0);
      showSuccess(res.data?.message || 'Llave entregada correctamente');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message;
      if (status === 409) {
        showError(msg || 'El docente ya tiene una llave prestada');
      } else if (status === 400) {
        showError(msg || 'Datos incompletos para la entrega de llave');
      } else {
        showError(msg || 'No se pudo entregar la llave. Intente nuevamente.');
      }
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Key className="h-6 w-6" />
        Préstamos Individuales de Llaves
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TAB_CONFIG
          .filter((t) => !t.adminOnly || esUsuarioAdmin)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors',
                tab === t.key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.Icon className="h-3.5 w-3.5" />
              {t.showCount ? `${t.label} (${pendientes.length})` : t.label}
            </button>
          ))}
      </div>

      {tab === 'entregar' && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-5xl">
          <h2 className="font-semibold text-foreground mb-4">Registrar préstamo individual de llave</h2>

          {/* Indicador de identificación */}
          <div className={cn(
            'flex items-center gap-2 text-sm mb-4 px-3 py-2 rounded-lg',
            docenteEncontrado
              ? 'bg-success/10 border border-success/20 text-success'
              : buscandoCarnet
                ? 'bg-primary/10 border border-primary/20 text-primary'
                : 'bg-muted border border-border text-muted-foreground'
          )}>
            {docenteEncontrado
              ? <CheckCircle2 className="h-4 w-4" />
              : buscandoCarnet
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CreditCard className="h-4 w-4" />}
            {docenteEncontrado
              ? `Docente: ${docenteEncontrado.nombre}`
              : buscandoCarnet
                ? 'Buscando docente...'
                : 'Pase el carnet por el lector o escriba el documento'}
          </div>

          <div className="bg-muted/50 border border-border rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Identificación del Docente</p>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                ref={fallbackInputRef}
                value={lookupValue}
                placeholder="Escanee carnet o escriba documento"
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                maxLength={LONGITUD_MAXIMA.documento}
                onChange={(e) => setLookupValue(soloNumerosConTope(e.target.value, LONGITUD_MAXIMA.documento))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    buscarDocente(lookupValue);
                  }
                }}
              />
              <Button
                onClick={() => buscarDocente(lookupValue)}
                disabled={buscandoCarnet || !lookupValue.trim()}
              >
                {buscandoCarnet ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Buscando</> : <><Search className="h-4 w-4 mr-1" />Buscar</>}
              </Button>
            </div>
          </div>

          <form onSubmit={handleSubmit(onEntregar)} className="space-y-4">

            <div className="bg-muted/50 border border-border rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Datos Autocompletados</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Nro. Documento" required error={errors.nroidenti?.message}>
                  <Input {...register('nroidenti', { required: 'Documento es requerido' })} readOnly className="bg-background" />
                </FormField>
                <FormField label="Nombre Docente" required error={errors.profesor?.message}>
                  <Input {...register('profesor', { required: 'Nombre es requerido' })} readOnly className="bg-background" />
                </FormField>
                <div className="md:col-span-2">
                  <FormField label="Facultad">
                    <Input {...register('facultad')} readOnly className="bg-background" />
                  </FormField>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Datos del Préstamo</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <FormField label="Aula" required error={errors.aula?.message}>
                    <div className="relative">
                      <input
                        {...register('aula', {
                          required: 'Aula es requerida',
                          validate: (value) => {
                            const nombre = normalizarNombreSalon(value);
                            if (!nombre) return 'Aula es requerida';
                            return salones.some(
                              (salon) => normalizarNombreSalon(salon.nombre_salon) === nombre
                            ) || 'Seleccione un salón válido';
                          },
                        })}
                        autoComplete="off"
                        placeholder="Escriba para buscar un salón..."
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        onFocus={() => setMostrarSugerenciasAula(true)}
                        onBlur={() => setTimeout(() => setMostrarSugerenciasAula(false), 150)}
                      />

                      {mostrarSugerenciasAula && sugerenciasAula.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {sugerenciasAula.map((salon) => (
                            <button
                              key={salon.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm text-popover-foreground hover:bg-muted"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setValue('aula', salon.nombre_salon, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                setMostrarSugerenciasAula(false);
                              }}
                            >
                              {salon.nombre_salon}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormField>
                </div>
                <FormField label="Hora Inicio">
                  <Input
                    type="time"
                    {...register('hora_inicio')}
                  />
                </FormField>
                <FormField label="Hora Fin">
                  <Input
                    type="time"
                    {...register('hora_fin')}
                  />
                </FormField>
                <div className="md:col-span-2">
                  <FormField label="Motivo">
                    <Input {...register('motivo')} placeholder="Motivo del préstamo..." />
                  </FormField>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Las ubicaciones disponibles son administradas desde el módulo de ubicaciones operativas.</p>
            </div>

            <Button
              type="submit"
              disabled={entregar.isPending || !docenteEncontrado}
              className="w-full"
            >
              {entregar.isPending ? 'Registrando...' : 'Registrar Entrega'}
            </Button>
          </form>
        </div>
      )}

      {tab === 'pendientes' && (
        <DataTable
          columns={columnasPendientes}
          data={pendientes}
          loading={isLoading}
          searchable
          exportable
          exportFileName="llaves_pendientes"
          extraSearchKeys={['documento']}
        />
      )}

    </div>
  );
}
