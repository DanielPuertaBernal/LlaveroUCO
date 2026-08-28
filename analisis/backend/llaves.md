# Módulo `llaves`

## 1. Propósito

Gestiona el préstamo y devolución física de llaves de salones, disparado por lectura NFC de carnet (ESP32) o por acción manual de un auxiliar de oficina. Resuelve automáticamente si la persona que hace tap NFC debe **recibir** una llave (según su programación académica, reserva semestral, o asignación de monitor) o **devolver** una que ya tiene, y mantiene un historial paginado con estados de mora calculados por un scheduler externo (`notificaciones`).

**Aclaración estructural**: la "arquitectura CQRS" descrita en el enunciado no existe como subcarpetas (`context/domain/workflows/read-model/write-model`) — es CQRS ligero por **convención de nombres de archivo**, todos planos dentro de `src/features/llaves/`: `llave.routes.js`, `llave.controller.js`, `llave.service.js` (fachada + DI), `llave.workflows.js` (casos de uso), `llave.context.js` (resolución NFC), `llave.domain.js` (funciones puras), `llave.read-model.js` (queries formateadas), `llave.write-model.js` (comandos de escritura) y `llave.repository.js`. No hay clases de dominio, agregados ni value objects tipados.

## 2. Modelo de datos

Tabla `registros_llaves` (migración `005_llaves_monitores.js`, ampliada por la 009 y la 022). Un registro cubre **el préstamo y su devolución en la misma fila**: no hay tabla de devoluciones para llaves, a diferencia de equipos.

### Identificación y contexto

| Columna | Detalle |
|---|---|
| `comunidad_id` → `comunidad` | persona del préstamo; `docente_nombre` es el snapshot del nombre |
| `programacion_id` → `programaciones` | clase que originó la entrega, si vino de programación |
| `salon_id` → `salones` | `aula` es el snapshot del nombre |
| `dia`, `horario`, `facultad`, `materia` | snapshots de texto al momento del registro |
| `origen_registro` | CHECK: `individual`, `programacion`, `reserva_semestral`, `''` |

### Tiempos y estado

| Columna | Detalle |
|---|---|
| `fecha_hora_entrega` / `fecha_hora_devolucion` | timestamptz |
| `dia_entrega` | `date` — día calendario, para agrupar sin depender de la hora |
| `duracion_minutos`, `tiempo_retraso_minutos`, `tiempo_retraso_devolucion_minutos` | enteros; el formato "2h 15min" se arma al serializar |
| `se_reclamo_a_tiempo`, `retraso_entrega` | bool |
| `estado` | CHECK: `en_prestamo`, `en_mora`, `demora_entrega`, `entregado` |

`en_mora` y `demora_entrega` los escribe el scheduler de notificaciones según la configuración del admin, no se calculan al vuelo.

### Quién reclama y quién entrega

`quien_reclama` (CHECK: `docente`, `monitor`, `otra_persona`, `''`) con `reclama_comunidad_id` y `nombre_reclama`; `quien_entrega` (CHECK: `docente`, `monitor`, `''`) con `entrega_comunidad_id` y `nombre_entrega`. `tipo_entrega`/`tipo_devolucion` distinguen `manual` de `carnet` — y la devolución admite además `automatica`.

### Trazabilidad

| Columna | Detalle |
|---|---|
| `gestionado_por_usuario_id` → `usuarios` | quién procesó **la entrega** |
| `gestionado_por_devolucion_usuario_id` → `usuarios` | quién procesó **la devolución** (migración 022) |
| `ubicacion_prestamo_id` / `ubicacion_devolucion_id` | snapshot histórico, congelado — ver abajo |

Hasta la migración 022 había una sola columna de gestor y la devolución la sobrescribía, perdiendo quién entregó. Las dos columnas separan los momentos.

Las dos de ubicación quedaron congeladas en `oficina_centro_servicios_docentes` desde la 009: todos los caminos de escritura caen a ese default y nada las calcula. La UI muestra el usuario gestor en su lugar. Ver [catálogos](./catalogos.md).

## 3. Diagrama de clases / dependencias

```mermaid
classDiagram
    class LlaveRoutes
    class LlaveController
    class LlaveService {
        DI de comunidad/reservas/context/write-model
        +procesarNFC() +devolver() +entregar()
        +confirmarAnticipado() +historial() +exportarHistorial()
    }
    class LlaveContext {
        +resolverContextoNFC()
        +resolverContextoDocente()
        +resolverContextoMonitor()
        +buscarPersonaPorCarnet()
    }
    class LlaveWorkflows {
        +procesarLecturaNFC()
        +confirmarPrestamoAnticipado()
        +registrarEntrega() +registrarDevolucion()
        +registrarDevolucionPorId()
    }
    class LlaveDomain {
        funciones puras: builders, matching, cálculo de estado
    }
    class LlaveReadModel {
        +obtenerHistorialFormateado()
        +formatearPendientes()
        auto-corrección de origen_registro
    }
    class LlaveWriteModel {
        +persistirPrestamo() +persistirDevolucion()
    }
    class LlaveRepository
    class LlaveSchema

    LlaveRoutes --> LlaveController --> LlaveService
    LlaveService --> LlaveContext
    LlaveService --> LlaveWorkflows
    LlaveWorkflows --> LlaveDomain
    LlaveWorkflows --> LlaveWriteModel --> LlaveRepository --> LlaveSchema
    LlaveService --> LlaveReadModel --> LlaveRepository
    LlaveContext --> ComunidadRepository : buscarPersonaPorCarnet
    LlaveContext --> ProgramacionRepository : findByDia
    LlaveContext --> MonitorRepository : findByDocumentoMonitor
    LlaveContext --> ReservasSemestralesRepository
    LlaveService --> ReservaRepository : checkin NFC pendiente
    LlaveService --> PorterosService : tienePermiso(usuario, bloque, operacion)
    NfcService ..> LlaveService : procesarLecturaNFC (entry point real)
    NotificacionService ..> LlaveRepository : escribe estado en_mora/demora_entrega
    ReservaService ..> LlaveSchema : bypass repository -- acceso directo
```

## 4. Flujos principales

### 4.1 Préstamo vía NFC

```mermaid
sequenceDiagram
    participant NFC as nfc.service
    participant WF as llave.workflows
    participant Ctx as llave.context
    participant Com as comunidad.repository
    participant WM as llave.write-model

    NFC->>WF: procesarLecturaNFC(idCarnet, ubicacion)
    WF->>Ctx: buscarPersonaPorCarnet(idCarnet)
    alt no existe
        WF-->>NFC: {tipo:'error'}
    end
    WF->>Ctx: resolverContextoNFC(documento)
    Ctx->>Ctx: ¿1 préstamo activo? -> prioriza DEVOLUCIÓN
    Ctx->>Ctx: ¿>1 préstamo activo? -> retorna lista para selección manual
    Ctx->>Ctx: sin préstamo -> ¿tiene clase propia hoy?
    alt tiene clase o reserva propia
        Ctx-->>WF: resolverContextoDocente
    else no tiene
        Ctx-->>WF: resolverContextoMonitor (busca delegación)
    end
    WF->>WF: resolverResultadoPrestamo: busca clase actual o reserva pendiente
    note right of WF: si hay clase Y reserva al mismo tiempo, prioriza CLASE
    alt reclamo anticipado (antes de hora de clase)
        WF-->>NFC: {tipo:'anticipado'} (no persiste, requiere confirmación)
    else
        WF->>WM: persistirPrestamo (construirRegistroPrestamo)
        WM-->>WF: registro creado (estado=en_prestamo)
    end
```

### 4.2 Devolución vía NFC / manual / por ID

```mermaid
flowchart TD
    A[resolverResultadoDevolucion] --> B[persistirDevolucion: calcula duración/retraso, estado=entregado]
    C[POST /devolver/:documento] --> D{existe préstamo pendiente?}
    D -->|no| E[404 notFound]
    D -->|sí| B
    F[POST /devolver-por-id] --> G{estado in en_prestamo/en_mora/demora_entrega?}
    G -->|no| E
    G -->|sí| B
    C -.-> H[si body.novedad.categoria -> novedadService.registrar]
```

### 4.3 Entrega manual con índice único

```mermaid
sequenceDiagram
    participant Aux as Auxiliar
    participant WF as registrarEntrega
    participant WM as write-model
    participant DB as MongoDB

    Aux->>WF: entregar({nroidenti, profesor, aula})
    WF->>WF: validarEntregaManual (campos requeridos)
    WF->>WF: dia_entrega = medianoche de hoy (para activar índice único)
    WF->>WM: persistirPrestamo
    WM->>DB: create (índice único numero_documento+aula+dia_entrega)
    alt duplicado (err.code 11000)
        DB-->>WF: error
        WF-->>Aux: 409 "La llave de este salón ya está en préstamo hoy"
    end
```

## 5. Puntos de inflexión

- **Sin transacciones Mongo en ninguna operación crítica** (confirmado, cero uso de `session`/`startTransaction` en el módulo).
- **Índice único de duplicados no cubre los flujos NFC**: el índice sparse `{numero_documento, aula, dia_entrega}` solo se activa cuando `dia_entrega` está seteado — y **solo `registrarEntrega` (manual) lo setea**. `construirRegistroPrestamo`, usado por NFC y `confirmarPrestamoAnticipado`, no incluye `dia_entrega`. Consecuencia: **dos lecturas NFC simultáneas del mismo docente/aula pueden crear préstamos duplicados sin protección de base de datos**, solo protección aplicativa por lectura previa no atómica (TOCTOU).
- **Decisión deliberada de no bloquear préstamos múltiples**: comentario explícito en `llave.workflows.js:272-275` — *"Ya no bloqueamos: el docente puede tener múltiples llaves"* — el sistema permite intencionalmente varios préstamos activos simultáneos por docente.
- **Idempotencia NFC vive fuera del módulo**: `nfc.service.js` usa `eventoId` para no reprocesar el mismo evento físico, pero no protege contra dos eventos NFC distintos casi simultáneos (cae en el riesgo anterior).
- **Prioridad devolución sobre préstamo**: si hay exactamente 1 préstamo activo, siempre se interpreta el tap como devolución.
- **Prioridad clase sobre reserva** cuando ambas coinciden en tiempo, decisión explícita en el código.
- **Auto-corrección silenciosa de `origen_registro`**: en cada consulta de pendientes, si un préstamo marcado `individual` coincide retroactivamente con la programación oficial, se re-etiqueta a `programacion` con un `try/catch` que ignora fallos silenciosamente.
- **Sin reporte de pérdida/daño en este módulo**: no existe estado `perdida`/`en_reparacion`. La única vía relacionada es adjuntar una `novedad` al devolver, delegada 100% a `novedades`.
- **Sin transferencia de titularidad explícita**: otra persona (monitor/"otra_persona") puede recibir/entregar vía `quien_reclama`/`quien_entrega`, pero la llave sigue asociada al `numero_documento` del docente titular.

## 6. Dependencias externas/cruzadas

**Usa**: `comunidad` (repository, identificación por carnet), `programacion` (repository, clases del día), `monitores` (repository, delegación), `reservas_semestrales` (repository), `reservas` (repository, checkin NFC), `porteros` (service, `tienePermiso` — gate de rol+bloque desde la migración 009), `salones` (repository, para resolver el bloque del aula), `auth` (middleware).

**Lo usan**:
- `nfc` — `nfc.service.js` dispara `llaveService.procesarLecturaNFC` en cada lectura (entry point principal).
- `programacion` — `llaveRepository.findByFecha` para deduplicar UI de clases con llave ya entregada.
- `reservas` — `reserva.service.js` y `reserva.repository.js` **importan el schema `Llave` directamente**, sin pasar por el repositorio del módulo (ver riesgo).
- `notificaciones` — `notificacion.service.js` **escribe** `estado: 'en_mora'`/`'demora_entrega'` directamente vía `llaveRepository.update` — es el "scheduler" mencionado en los comentarios de dominio.

No existe módulo `prestamos` compartido con `llaves` — son dominios completamente separados (ver `prestamos.md`).

## 7. Riesgos y observaciones de auditoría

- **Sin transacciones Mongo**: crear un préstamo y actualizar la reserva asociada son dos escrituras separadas no atómicas — un fallo intermedio deja una llave "huérfana" sin la reserva marcada como `llave_entregada`.
- **Índice único no cubre los flujos NFC** (ver §5) — riesgo real de duplicados bajo concurrencia en el camino más usado del sistema.
- **Violación de encapsulación CQRS desde `reservas`**: `reserva.service.js`/`reserva.repository.js` manipulan el modelo `Llave` directamente, duplicando la lógica de construcción de registro de préstamo y de devolución con **diferencias de comportamiento** respecto a `llave.domain.js` (ej. `tiempo_retraso_devolucion` queda hardcodeado en `''` en la versión de `reservas`) — dos implementaciones paralelas del mismo caso de uso que pueden divergir.
- **`Llave.create` en `reserva.service.js` sin manejo de `err.code === 11000`** (a diferencia de `llave.workflows.js`, que sí lo captura) — aunque en la práctica es irrelevante mientras el índice no se active en ese flujo.
- **Filtro de `estado` en historial paginado se aplica en memoria**, no en la query Mongo — cuando hay paginación y filtro simultáneos, se trae todo el resultado sin paginar y se filtra/pagina en JS, ineficiente en historiales grandes.
- **Auto-corrección con `try/catch` vacío**: side-effect de escritura dentro de una operación de lectura, con fallos silenciados sin logging.
- **Sin cobertura de tests**: CodeGraph marcó "no covering tests found" en todos los símbolos principales del módulo (el más complejo del sistema).
- **`aula` es snapshot, `salon_id` es la referencia**: la FK a `salones` existe y es la que se usa para resolver el bloque al validar permisos de portería. El texto `aula` se conserva a propósito para que el histórico muestre el nombre que tenía el salón al momento del préstamo; renombrarlo después no lo actualiza, y eso es deliberado.
- **No hay entidad "llave física"/inventario**: el schema modela el préstamo, no un catálogo de llaves con ciclo de vida propio — si el negocio requiere rastrear la llave física entre préstamos, ese requerimiento no está cubierto.
