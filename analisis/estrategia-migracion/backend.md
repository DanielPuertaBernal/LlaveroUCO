# Backend: Express/MongoDB → PostgreSQL/Django Ninja

**Estado**: en definición.

## Mapeo de arquitectura

| Actual (Express) | Nuevo (Django Ninja) |
|---|---|
| `src/features/<dominio>/` (routes → controller → service → repository → schema) | Django app por dominio, **monolito modular** con 5 capas fijas por módulo — ver convención abajo |
| Sin carpeta `models/` central, schema Mongo por feature | `models.py` por app, con migraciones de Django |
| Auth JWT propio (`usuario`+`password` con bcrypt) | Login federado con **Office 365** (Microsoft Entra ID) + `django-ninja-jwt` para las llamadas a la API — ver detalle abajo |
| Socket.io (namespace `/nfc`, tiempo real) | **Se retira, no se porta.** Confirmado que Socket.io se usaba exclusivamente para NFC (ver [hardware-lectura.md](./hardware-lectura.md)); con el lector USB local ya no hace falta push servidor→navegador. Django Ninja no necesita Channels para esto. |

Los 15 módulos ya documentados en [../backend/](../backend/) son el inventario base para trazar el mapeo 1:1 dominio → app Django: auth, usuarios, comunidad, programacion, llaves, reservas, reservas_semestrales, equipos, prestamos, nfc, monitores, notificaciones, novedades, configuracion, catalogos.

## Convención de capas por módulo (monolito modular)

**Decidido**: arquitectura de monolito modular tanto en backend como en frontend (Angular ya lo tiene por diseño con feature modules, ver [frontend.md](./frontend.md); no cambia nada ahí). En el backend, **todos** los módulos (Django apps) siguen las mismas 5 capas fijas, sin excepción:

| Archivo | Responsabilidad |
|---|---|
| `model.py` | Modelos ORM (Postgres) |
| `repository.py` | **Única** capa que toca el ORM — lectura y escritura juntas, con métodos de intención (`obtener_prestamos_pendientes()`, `crear_prestamo()`), no wrappers genéricos tipo `find(id)`/`save()` |
| `domain.py` | Funciones puras: cálculo de estado, builders, matching — sin DB, sin I/O. Es lo primero que se testea (TDD) porque no requiere mockear nada |
| `service.py` | Orquesta `domain` + `repository`, envuelve `transaction.atomic()` donde haga falta. **Es la única API pública del módulo** — lo único que otro módulo puede importar |
| `controller.py` (router Ninja) | HTTP puro: valida request, llama a `service`, formatea response. Sin lógica de negocio |

**Regla dura, sin excepción**: ningún módulo importa el `model.py` o `repository.py` de otro módulo — solo su `service.py`. Esta regla existe porque es exactamente lo que habría prevenido el bug más grave que encontró la auditoría: `reserva.service.js` hoy importa el schema `Llave` directamente y duplica la lógica de construir un préstamo con comportamiento distinto al de `llave.domain.js` (`tiempo_retraso_devolucion` queda hardcodeado diferente) — dos implementaciones del mismo caso de uso que divergen silenciosamente. Con `repository.py` como única puerta de entrada al modelo, y `service.py` como única API cruzando módulos, ese bypass deja de ser posible por accidente.

Esto reemplaza la micro-arquitectura de `llaves` de hoy (`context/domain/workflows/read-model/write-model`, que la auditoría confirmó que no era CQRS real, solo convención de nombres de archivo — ver [../backend/llaves.md](../backend/llaves.md)): `context.js`+`workflows.js`+`write-model.js` se consolidan en `service.py`, `read-model.js` se absorbe en `repository.py`, `domain.js` se porta casi tal cual.

## Modelo de datos: sin migración de datos históricos, arranque limpio

**Decidido**: la app se levanta **desde cero**. No hay migración de datos de la MongoDB actual — ni histórico de préstamos/reservas, ni usuarios, ni catálogos. El esquema Postgres se diseña limpio, sin necesidad de mapear `ObjectId` → `serial`/`uuid` ni preservar referencias de datos viejos.

- Los catálogos (bloques, tipos de silletería, salones, ubicaciones) se diseñan desde el inicio con FKs reales — no hay que "arreglar" el problema de texto plano actual, simplemente no se repite.
- **El único dato externo que entra al sistema nuevo es Comunidad** (docentes/estudiantes), vía una integración ETL: un sistema externo empuja los registros (nombre, tipo, código de carnet) a un endpoint del backend. El código de carnet llega **en texto plano** (sin hash — decidido así, no es necesario para el alcance de Llavero), y el endpoint se protege con **API key** — esto reemplaza y resuelve directamente el hallazgo de la auditoría de que `POST /api/comunidad/sync` hoy es público sin autenticación (ver deuda técnica abajo).
- **Implicación para la lectura NFC/HID** (ver [hardware-lectura.md](./hardware-lectura.md)): el valor que entrega el lector USB al tapear se compara directamente contra el `id_carnet` almacenado en Comunidad, sin paso de hasheo intermedio.

## Deuda técnica que esta migración debe resolver (no arrastrar)

Del [consolidado de deuda técnica](../deuda-tecnica.md):

- **Sin transacciones en `llaves`** (riesgo real de doble préstamo concurrente) → Postgres da transacciones ACID; el `service.py` debe usarlas explícitamente. **Corrección**: `prestamos` (equipos) ya usa transacciones Mongo hoy (`prestamo.service.js`, `crear()`/`registrarDevolucion()`) — no arrastra este riesgo, solo hay que preservar el mismo cuidado al portarlo.
- ~~**`POST /api/comunidad/sync` público sin autenticación**~~ — **resuelto**: el endpoint nuevo de Comunidad recibe los datos del ETL externo protegido con **API key** (ver arriba).
- **Varios módulos accediendo a schemas de otros módulos saltándose el repository** → con Django, cada app debe acceder a modelos de otra app solo a través de su capa de servicio pública, no importando el ORM de otra app directamente.
- **Lógica de solapamiento de horarios triplicada** (`programacion`/`reservas`/`reservas_semestrales`) → unificar en un único service/validador compartido durante la migración, no triplicarlo de nuevo. Detalle real (ver `documentacion/backend/{programacion,reservas,reservas_semestrales}.md`): `programacion` (clases oficiales, `tipo='programacion'`) y `reservas_semestrales` (franjas recurrentes no oficiales, `tipo='semestral'`, más un tercer tipo `'fantasma'` para grupos derivados) hoy **comparten la misma colección Mongo** con `tipo` como discriminador manual — no son módulos independientes, son 3 vistas de una misma tabla. `reservas` (individuales, con fecha calendario y flujo de aprobación/check-in NFC) es colección separada, pero para validar disponibilidad de un salón tiene que cruzar contra **las otras dos** igual.

  **Decidido**: **tablas separadas por módulo** en Postgres, no una tabla compartida con discriminador. Compartir tabla entre `programacion` y `reservas_semestrales` violaría la regla de monolito modular ya definida arriba (cada app es dueña exclusiva de su `model.py`/`repository.py`; una tabla compartida entre dos apps rompe ese aislamiento). `fantasma` se modela como caso interno de `programacion` (son grupos derivados de una clase real de ese mismo módulo, vía `fantasma_de`), no de `reservas_semestrales`. El validador de disponibilidad compartido (ver "Relación... con `llaves`" arriba) resuelve conflictos consultando las 3 tablas a través de sus propios `service.py` — no necesitan compartir almacenamiento para compartir lógica de validación.
- **Cero cobertura de tests** → arrancar el backend nuevo con TDD desde el primer módulo (especialmente `llaves`/`prestamos`, donde está el riesgo de concurrencia).

## Llaves y Préstamos: dos tipos de devolución, no una genérica

Puntualizado explícitamente para que no se difumine al construir Llavero: **"devolución" no es un concepto único con dos variantes de formulario — son dos dominios con reglas distintas**, confirmado en el código actual:

| | Llaves | Préstamos (equipos) |
|---|---|---|
| Unidad | Una llave = binaria (`en_prestamo` → `entregado`), sin parcialidad | Colección de ítems (bafles, PCs, cables de red, etc.) — cada uno se devuelve individualmente |
| Devolución | Todo o nada | **Parcial de fábrica**: se puede devolver 2 de 3 equipos; el préstamo queda `parcialmente_devuelto` hasta que se devuelva el último (`completamente_devuelto`) |
| Modelo de datos | Un documento `Llave` que transiciona de estado | Documento `Prestamo` + colección separada `Devolucion` (un registro por cada acto de devolución, con el detalle de qué ítems volvieron) |
| Notificaciones | Endpoint dedicado (`POST /notificaciones/devolucion-llaves`) | Genérico |
| Módulo compartido | Ninguno — dominios completamente separados (ya confirmado en `llaves.md`: "No existe módulo `prestamos` compartido con `llaves`") |

En el diseño de Django/Postgres esto se traduce en: `llaves` y `prestamos` son dos apps separadas (ya decidido en la convención de capas), cada una con su propio `service.py` de devolución — no hay un `DevolucionService` genérico compartido entre ambas, porque las reglas (parcialidad, modelo de ítems) son distintas de raíz.

## Relación entre Programación, Reservas semestrales y Reservas individuales con `llaves`

Más allá de competir por el mismo salón (arriba), hay una segunda relación que el diseño de `llaves`/`Llavero` debe preservar con cuidado:

- **Para la resolución automática de NFC ("¿esta persona tiene clase hoy?"), Programación y Reservas semestrales se tratan como equivalentes** — `llave.context.js` consulta `findByDia` de ambas indistintamente para decidir si habilita entrega automática de llave al pasar el carnet.
- **Reservas individuales NO participa de esa resolución automática** — tiene su propio flujo de check-in NFC separado (`checkin_estado`), no pasa por "¿tiene clase hoy?".
- **Acoplamiento de ciclo de vida**: como Programación y Semestrales comparten colección física hoy, borrar un semestre en Programación cascada y borra las Reservas semestrales vinculadas — no es solo una relación de datos parecidos, están atadas en su borrado. El diseño nuevo debe decidir explícitamente si esa cascada se mantiene.
- **Riesgo compartido por Programación y Semestrales** (no tanto por Individuales): la resolución es por **día**, no por franja horaria activa — no hay comparación contra la hora actual del reloj, así que un docente con clase a las 7am podría, en teoría, reclamar la llave de una clase de las 6pm el mismo día. Reservas individuales, al tener check-in con fecha+hora concreta, no tiene este problema de la misma forma. Esto es una oportunidad de mejora real para `Llavero`, no solo un detalle de paridad con el sistema actual.

## Autenticación: Office 365 (Entra ID) reemplaza el paso de credenciales, no el JWT propio

**Decidido**: todos los roles (admin, aprendices, porteros, etc.) inician sesión con **Office 365**, sin fallback de usuario/password local. Esto reemplaza el paso de verificación de credenciales de hoy (bcrypt contra `hash_password`), pero **no** elimina la necesidad de emitir un JWT propio — Office 365 solo resuelve "quién es esta persona", el resto de la arquitectura de auth (access+refresh, rotación, detección de reuso, tope de sesiones, revalidación de `activo`) se conserva igual que hoy, ahora vía `django-ninja-jwt`.

Flujo:

1. Angular usa MSAL (`@azure/msal-angular`) para redirigir al login de Office 365 del tenant de la UCO. Microsoft autentica y devuelve un ID token a Angular.
2. Angular envía ese ID token a un endpoint del backend (reemplaza el body `{usuario, password}` de `POST /auth/login` de hoy).
3. Django Ninja valida el token de Microsoft: firma contra el JWKS público (`login.microsoftonline.com/{tenant}/discovery/v2.0/keys`), emisor/tenant y audiencia (App Registration en Azure).
4. Con la identidad confirmada, el backend busca el `Usuario` local vinculado (por email/`oid` de Microsoft) y valida que esté `activo` — igual que la revalidación que ya hacen hoy en cada request.
5. El backend emite su propio access+refresh JWT (`django-ninja-jwt`); Angular usa ese bearer token para todo lo demás, sin cambios respecto al patrón actual.

Consecuencias en el modelo de datos:
- `hash_password` y la política de contraseñas (Zod `passwordSchema`) **se retiran por completo** — nadie loguea con password local.
- `loginSchema`/`LoginRequest` (hoy `{usuario, password}`) se reemplaza por `{id_token}` de Microsoft.
- El campo que identifica al usuario pasa a ser el email institucional (o `oid` de Microsoft), no el `usuario` de hoy.

**Decidido**: aprovisionamiento por precreación — un admin crea el `Usuario` local (con su rol y ubicación) de antemano, y el login de Office 365 solo lo vincula/activa por email en el primer ingreso. No hay autoaprovisionamiento de cuentas nuevas sin rol asignado.

## Modelo de usuario/rol: ubicación asignada

Con el retiro del ESP32, la ubicación de una lectura NFC ya no viene de un dispositivo fijo por puerta — se deriva de una **asociación rol/usuario ↔ ubicación** (ej. Auxiliar 1/2 y Admin → oficina principal, Portero 1 → portería superior, Portero 2 → portería inferior; ver [hardware-lectura.md](./hardware-lectura.md)). El modelo de usuario/rol en Postgres necesita un campo o relación de ubicación asignada, y el flujo de lectura valida "qué usuario autenticado envió esto y cuál es su ubicación" en vez de `X-Device-Key` por dispositivo.

## Convivencia con el sistema actual: no aplica como migración de datos

**Decidido**: al no haber datos que migrar, la pregunta de "strangler-fig vs. big-bang" deja de ser sobre continuidad de datos en vivo — no hay riesgo de doble escritura entre Mongo y Postgres porque Postgres no hereda nada de Mongo. El sistema nuevo se construye completo y se lanza cuando esté listo; Express/Mongo se apaga en ese momento (no hay corte progresivo de datos que orquestar). Si se decide lanzar por etapas, sería por razones operativas (capacitación del equipo, validar módulos de menor riesgo primero) y no por necesidad arquitectónica de evitar romper datos compartidos.

## Autenticación de dispositivos NFC: se retira sin reemplazo

**Verificado en código**: `X-Device-Key`/`ESP32_DEVICE_KEY` tiene **un solo consumidor** en todo el backend — `POST /api/nfc/lectura` (`nfc.middleware.js`), exclusivo del ESP32. Ningún otro endpoint lo usa, así que se retira por completo junto con el ESP32, sin necesidad de mecanismo de reemplazo para otro consumidor.

`backend.md` no tiene decisiones abiertas pendientes.
