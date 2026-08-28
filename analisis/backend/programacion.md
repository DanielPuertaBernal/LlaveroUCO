# Módulo `programacion`

## 1. Propósito

Gestiona la programación académica regular (horario de clases de docentes por salón) que alimenta el sistema de préstamo de llaves NFC. Comparte colección Mongo y schema con `reservas_semestrales` (ver módulo dedicado) mediante un campo discriminador `tipo`.

## 2. Modelo de datos

Herencia por tabla: una cabecera común `programaciones` más una tabla por subtipo que comparte la PK. `tipo` discrimina cuál aplica.

### `programaciones` — cabecera

`semestre_id` → `programacion_semestres`, `docente_id` → `comunidad` (+ `docente_nombre` snapshot), `salon_id` → `salones` (+ `aula` snapshot), `dia`, `horario` (texto "07:00 A 09:00"), `hora_inicio`/`hora_fin` (`time`), `facultad`, `materia`, `codigo_materia`, `grupo`, `nivel_grupo`, `estudiantes_prematriculados`, `estudiantes_matriculados`, `total_estudiantes`, `observaciones`.

Dos flags de negocio:

| Columna | Qué significa |
|---|---|
| `es_intensivo` | curso intensivo (migración 019) |
| `sin_entrega_llave` | ocupa el aula pero no se le entrega llave al docente — el caso de las clases del colegio dictadas en aulas de la universidad (migración 020) |

### Subtipos

- **`programaciones_regulares`**: solo la PK; la programación académica normal.
- **`programaciones_semestrales`**: reserva recurrente de todo el semestre. `consecutivo`, `grupo_id` (agrupa las franjas de una misma solicitud), `cancelada` + `fecha_cancelacion` + `motivo_cancelacion`, `creado_manualmente`, `tipo_solicitante`, `responsable_id`/`responsable_nombre`, `bloque_id`.
- **`programaciones_fantasma`**: grupos virtuales sin salón real. `fantasma_de_programacion_id` y `fantasma_de_codigo_materia` apuntan a la programación de la que derivan.

### `programacion_semestres`

`codigo_raw` y `codigo` (normalizado), `anio`, `periodo`, `fecha_inicio`/`fecha_fin` (`date`), `fecha_carga`, `cargado_por`, `total_registros`.

### Vista `v_programaciones`

Une la cabecera con sus subtipos para que las consultas de lectura no repitan los JOIN. Se recrea en la migración 021; cualquier cambio de columnas en `programaciones` obliga a recrearla.

Las columnas `time` vuelven a la app como `"HH:MM"`: `pg.client.js` registra un parser para el OID 1083 que descarta los segundos, que no se usan en ningún cálculo.

## 3. Diagrama de clases / dependencias

```mermaid
classDiagram
    class ProgramacionRoutes
    class ProgramacionController
    class ProgramacionService {
        +importarDesdeExcel()
        +listarPorDia(dia)
        +eliminarSemestre()
        +exportar()
        +validarFantasma() vincularFantasma() desvincularFantasma()
    }
    class ProgramacionRepository {
        +findByDia() findByDocumento() bulkInsert()
    }
    class SemestreRepository
    class ProgramacionSchema
    class ReservasSemestralesService

    ProgramacionRoutes --> ProgramacionController --> ProgramacionService
    ProgramacionService --> ProgramacionRepository --> ProgramacionSchema
    ProgramacionService --> SemestreRepository
    ProgramacionService --> ReservasSemestralesService : eliminar cascada, exportar combinado
    LlaveContext ..> ProgramacionRepository : findByDia (resolución NFC)
    MonitorService ..> ProgramacionRepository : findByDocumento
    SalonService ..> ProgramacionRepository : distinctAulas
    ReservaService ..> ProgramacionSchema : bypass repository, consulta directa
    ReservasSemestralesRepository ..> ProgramacionSchema : misma colección, tipo='semestral'
```

## 4. Flujos principales

### 4.1 Carga masiva por Excel

```mermaid
sequenceDiagram
    participant Admin
    participant S as ProgramacionService
    participant Repo as ProgramacionRepository
    participant DB as MongoDB

    Admin->>S: importarDesdeExcel(archivo)
    S->>S: parsea Excel, mapea columnas (MAPEO)
    S->>S: exige semestre único por archivo, valida fechas
    S->>S: normaliza aulas (quita guiones: M-303→M303)
    S->>S: _unificarHorarios: consolida bloques consecutivos mismo docente/aula/materia/grupo
    S->>Repo: bulkInsert(semestre, registros)
    Repo->>DB: transacción: deleteMany(tipo='programacion', semestre) + insertMany
    note right of DB: preserva fantasmas ya vinculados vía Set de claves codigo_materia|grupo
    S->>Repo: upsert metadatos de semestre
```

### 4.2 Resolución NFC "clase actual" (consumida por `llaves`)

```mermaid
flowchart TD
    A[llave.context.js: resolverContextoNFC] --> B[programacionRepository.findByDia -- TODAS las clases del día]
    B --> C[filtra por numero_documento del carnet escaneado]
    C --> D{tiene clases o reservas propias hoy?}
    D -->|sí| E[resolverContextoDocente]
    D -->|no| F[resolverContextoMonitor: busca delegación]
    note1[No hay comparación contra la hora actual del reloj -- solo filtrado por día]
```

## 5. Puntos de inflexión

- **No existe función central "clase en curso"**: el sistema filtra clases por día completo, no por franja horaria activa respecto a la hora actual. La única lógica horaria real (`llave.domain.js:34-47`, `horarioCubiertoPorPrestamo`) compara contra préstamos ya procesados hoy (evita duplicados), no contra el reloj.
- **Lógica de solapamiento de horarios triplicada**: reimplementada de forma independiente en `reservas_semestrales.service.js` (`validarConflictos`, `salonesDisponibles`, `disponibilidadPorDia`), en `reserva.service.js` (`_buscarConflictos`, `disponibilidad`, `salonesDisponibles`) y parcialmente en `programacion.service.js` — sin abstracción compartida.
- **Sin manejo de festivos/calendario académico**: `getDiaActual()` usa `new Date().getDay()` crudo; un feriado martes sigue mostrando clases de "Martes".
- **Relación bidireccional con `reservas_semestrales`**: `programacion.service.js` orquesta borrado en cascada y exportación combinada llamando a `reservasSemestralesService`; a su vez `reservas_semestrales` usa `programacion.semestre.repository` y el schema `Programacion` directamente.
- **Dos routers montados bajo el mismo prefijo `/api/programacion`** (`programacionRoutes` y `reservasSemestralesRoutes`) — no es error, son namespaces disjuntos (`/`, `/semestres`, `/dia/:dia` vs `/semestres/:codigo/reservas-semestrales`, `/reservas-semestrales/*`).

## 6. Dependencias externas/cruzadas

**Usa**: `reservas_semestrales.service.js` (cascada/exportación), `llave.repository.js` (`findByFecha`), `shared/utils/excel.parser`, `date.helper`, `normalize.helper`.

**Lo usan**:
- `llaves` — `llave.context.js` (`findByDia`, resolución NFC), `llave.read-model.js` (`findByDia`, auto-corrección de historial).
- `monitores` — `monitor.service.js` (`findByDocumento`).
- `salones` — `salon.service.js` (`distinctAulas`, detecta aulas sin registrar).
- `reservas` — `reserva.service.js` importa `Programacion` schema directamente (bypass del repository).
- `reservas_semestrales` — `Programacion` schema + `programacion.semestre.repository`.

## 7. Riesgos y observaciones de auditoría

- **Vacío de diseño real**: sin filtro de "clase en curso" por hora — un docente con clase a las 7am podría reclamar la llave de una clase de las 18h el mismo día sin que el backend lo distinga por hora.
- **Sin manejo de festivos/calendario académico.**
- **Lógica de disponibilidad de salón triplicada** entre 2-3 módulos sin abstracción compartida — riesgo de divergencia futura.
- **Sin cobertura de tests** confirmada (CodeGraph: "no covering tests found").
- **Código muerto**: `_esRegistroValido` (`programacion.service.js:447-449`) definido pero nunca invocado.
- **Parámetros fantasma en API**: `fecha_inicio_vigencia`/`fecha_fin_vigencia` se extraen del request pero no se usan en el destructuring del service — posible resto de refactor incompleto.
- **Bypass de repository**: `reserva.service.js` importa `Programacion` schema directamente en vez de pasar por `programacion.repository.js`.
- **Acoplamiento fuerte de colección compartida**: `tipo` como único discriminador entre datos semánticamente distintos — frágil ante queries futuras sin ese filtro.
