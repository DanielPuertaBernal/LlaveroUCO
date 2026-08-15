# Módulo `reservas`

## 1. Propósito

Gestiona reservas puntuales (ad-hoc, de una fecha/horario específico) de salones. Cubre validación de disponibilidad, creación con entrega opcional de llave física, aprobación/rechazo administrativo, cancelación, edición, consulta de disponibilidad por slots, y sincronización automática de estados vencidos con generación de notificaciones. Es el punto de integración entre "reservas" y "llaves/NFC".

## 2. Modelo de datos

`src/features/reservas/reserva.schema.js:4-42`, colección `reservas`, `timestamps:true`, `versionKey:false`.

| Campo | Detalle | Línea |
|---|---|---|
| `solicitante_documento`, `solicitante_nombre` | required, indexado | 6-7 |
| `nombre_bloque`, `nombre_salon` | required, indexados | 8-9 |
| `fecha` | Date, required, indexado | 10 |
| `hora_inicio`/`hora_fin` | String "HH:MM", required | 11-12 |
| `motivo` | default `''` | 13 |
| `estado` | enum `['pendiente','aprobada','rechazada','cancelada','completada','no_reclamada']`, default `'pendiente'`, indexado | 14-19 |
| `entregar_llave` | Boolean, default `true` | 20 |
| `llave_entregada` | Boolean, default `false` | 21 |
| `llave_prestamo_id` | ObjectId ref `Llave` | 22 |
| `checkin_estado` | enum `['entregado_oficina','pendiente_nfc','nfc_anticipado','nfc_en_tiempo','nfc_retraso','no_show']`, default `'pendiente_nfc'`, indexado | 23-28 |
| `checkin_canal` | enum `['oficina','nfc','']` | 29 |
| `tipo_solicitante` | enum `['docente','estudiante']`, default `'docente'` | 31 |
| `responsable_documento`/`responsable_nombre` | cuando solicitante es estudiante | 32-33 |
| `aprobado_por`, `creado_por_rol` | | 34-35 |

**Índice compuesto único parcial** (líneas 44-47): `{nombre_salon, fecha, hora_inicio}` único solo entre `estado in [pendiente, aprobada]` — impide duplicar `hora_inicio` exacta, **no** solapamientos parciales.

## 3. Diagrama de clases / dependencias

```mermaid
classDiagram
    class ReservaRoutes
    class ReservaController
    class ReservaService {
        +crear() +validar() +aprobar() +rechazar()
        +cancelar() +editar() +listar()
        +disponibilidad() +disponibilidadSmart() +salonesDisponibles()
        -_buscarConflictos()
        -_registrarDevolucionAutomaticaPorCancelacion()
    }
    class ReservaRepository {
        +findConflictos() +bulkCompletarVencidas() +sincronizarEstadosVencidos()
    }
    class ReservaSchema
    class ProgramacionSchema
    class LlaveSchema
    class SalonSchema
    class NotificacionSchema
    class ComunidadRepository
    class ConfiguracionService

    ReservaRoutes --> ReservaController --> ReservaService
    ReservaService --> ReservaRepository --> ReservaSchema
    ReservaService --> ProgramacionSchema : conflictos vs clases fijas/semestrales
    ReservaService --> LlaveSchema : crea/consulta préstamo de llave
    ReservaService --> ComunidadRepository : enriquecer correos
    ReservaService --> SalonSchema : salones disponibles
    ReservaRepository --> NotificacionSchema : notificación no-reclamada
    ReservaRepository --> ConfiguracionService : flag notificaciones_activas
    LlaveWorkflows ..> ReservaRepository : checkin NFC pendiente
    NotificacionScheduler ..> ReservaService : sincronizarEstadosVencidos (cron 5min)
    ReservasSemestralesService ..> ReservaSchema : bypass repository
```

## 4. Flujos principales

### 4.1 Creación de reserva

```mermaid
sequenceDiagram
    participant C as Cliente
    participant S as ReservaService
    participant Repo as ReservaRepository
    participant Llave as Llave (schema)

    C->>S: crear(datos)
    S->>S: valida hora_fin > hora_inicio
    alt !forzar
        S->>S: _buscarConflictos (reservas + programacion regular + semestrales)
        alt conflicto
            S-->>C: 409 con detalle del primer conflicto
        end
    end
    S->>Repo: create(reserva)
    alt entregar_llave !== false (default true)
        S->>Llave: create(préstamo) — checkin_estado='entregado_oficina'
        note right of Llave: si solicitante es estudiante con responsable válido, la llave queda a nombre del docente responsable
    else entregar_llave === false
        S->>S: checkin_estado='pendiente_nfc' (entrega diferida vía NFC)
    end
```

### 4.2 Sincronización de estados vencidos (cron cada 5 min)

```mermaid
flowchart TD
    A[notificacion.scheduler cada 5min] --> B[reservaService.sincronizarEstadosVencidos]
    B --> C[bulkCompletarVencidas]
    C --> D{llave_entregada?}
    D -->|sí| E[estado = completada]
    D -->|no, entregar_llave=false| F{hubo checkin NFC?}
    F -->|sí| E
    F -->|no| G[estado = no_reclamada, checkin_estado=no_show]
    D -->|no, entregar_llave!=false, nunca marcada| G
    G --> H[configuracionService.obtenerPorBloque activo?]
    H -->|sí y hay correo| I[crea/upsert Notificacion tipo reserva_no_reclamada]
    H -.->|error| J["catch vacío -- se pierde silenciosamente"]
```

## 5. Puntos de inflexión

- **Detección de conflictos triple**: reservas activas del mismo salón (filtro en memoria tras traer candidatas), programación académica fija (`Programacion tipo='programacion'`), y reservas semestrales (`Programacion tipo='semestral', i_cancelada≠1`) — las tres fuentes en la misma función `_buscarConflictos`.
- **Aritmética de minutos para solapamiento** (`toMin`) — fix deliberado documentado en comentario para evitar comparación lexicográfica de strings de hora.
- **Aprobar/rechazar solo admin, desde `pendiente`** — sin efectos secundarios (no libera slot explícitamente, no dispara notificación).
- **Cancelar/editar sin control de propiedad**: cualquier usuario `requireAuth` puede cancelar o editar la reserva de **cualquier otro** solicitante — no se compara `req.user` contra `solicitante_documento`.
- **Cancelación con devolución automática de llave**: si `llave_entregada`, busca el préstamo por `llave_prestamo_id` o, en fallback, por `aula+documento+fecha` (compatibilidad con reservas antiguas) y lo marca devuelto si está `en_prestamo`.
- **`disponibilidadSmart`**: si hay clase programada pero la llave no fue reclamada, marca el slot como disponible (`motivo:'programacion_sin_llave'`) — asume que el docente no llegó.
- **Transiciones automáticas por vencimiento**: `pendiente`/`aprobada` → `completada` o `no_reclamada` según si hubo entrega/checkin — no hay transición manual a esos estados ni reversión desde `rechazada`/`cancelada`/`completada`/`no_reclamada`.
- **Sin validación de fecha pasada al crear** (sí se valida en `editar`) — inconsistencia.
- **Sin límite de anticipación máxima** para reservar.
- **Notificaciones automáticas solo en `no_reclamada`**: aprobar/rechazar no dispara ninguna notificación.

## 6. Dependencias externas/cruzadas

**Usa**: `Programacion` schema (conflictos), `Llave` schema (crear/consultar/actualizar préstamo), `comunidadRepository` (correos), `Salon` schema, `Notificacion` schema, `configuracionService`.

**Lo usan**:
- `llaves` — `llave.workflows.js` usa `reservaRepository` (`findReservaPendienteNFCByDocumento`, `findReservaById`, `marcarReservaCheckinNFC`) — integración central de check-in NFC.
- `notificaciones` — `notificacion.scheduler.js` invoca `sincronizarEstadosVencidos()` cada 5 min.
- `notificaciones` — `notificacion.service.js` importa el modelo `Reserva` directamente (bypass de repository).
- `reservas_semestrales` — importa el modelo `Reserva` directamente para calcular salones ocupados por reservas puntuales — **relación bidireccional** confirmada.

## 7. Riesgos y observaciones de auditoría

- **Sin cobertura de tests** (CodeGraph: "no covering tests found" para `ReservaService`, `ReservaController`, `_fechaHoraFinReserva`).
- **Autorización insuficiente en cancelar/editar** — cualquier usuario autenticado puede modificar reservas ajenas.
- **Sin validación de fecha pasada al crear.**
- **Sin límite de anticipación máxima.**
- **`findConflictos` sin filtro de fecha en la query Mongo**: trae todas las reservas activas del salón y filtra en memoria comparando zona horaria — no escala bien.
- **Efecto colateral de escritura en operación de lectura**: `listar()` siempre ejecuta `sincronizarEstadosVencidos()` — cada `GET /reservas` puede escribir en BD y crear notificaciones, con riesgo de condición de carrera con el cron paralelo.
- **Manejo de errores silencioso** (`catch(_){}`) en generación de notificación de no-reclamo.
- **Bypass de repository**: `notificacion.service.js` y `reservas_semestrales.service.js` importan el modelo `Reserva` directamente.
- **Índice único parcial no evita solapamientos parciales** — toda la protección real recae en lógica de aplicación, sin transacción ni bloqueo optimista: ventana de condición de carrera entre check y create bajo concurrencia.
