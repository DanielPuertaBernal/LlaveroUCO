# Fases tentativas y decisiones abiertas

**Estado**: borrador inicial — orden y alcance de fases sujeto a revisión.

## Fases propuestas

1. **Fase 0 — Cerrar decisiones abiertas.** Resolver las preguntas listadas más abajo antes de comprometer diseño de datos o de UI.
2. **Fase 1 — Modelado de datos Postgres.** A partir de los 15 módulos backend ya documentados, diseñar el esquema relacional limpio (incluye integridad referencial de catálogos desde el inicio). **Sin migración de datos históricos** — la app arranca desde cero; el único dato externo es la integración ETL de Comunidad (API key, carnet en texto plano, ver [backend.md](./backend.md)).
3. **Fase 2 — Backend Django Ninja.** Construir módulo por módulo, empezando por los de mayor riesgo detectado (`llaves`, `prestamos`) para validar pronto el manejo de transacciones.
4. **Fase 3 — Frontend Angular.** En paralelo o después del backend.
5. **Fase 4 — Piloto de lector USB HID.** Probar el nuevo flujo de lectura en un aula/mesa real antes de generalizarlo, con el ESP32 aún activo como respaldo.
6. **Fase 5 — Corte y retiro.** Apagar ESP32/backend/frontend legacy una vez validado el piloto y lanzado el sistema nuevo.

## Decisiones abiertas (consolidado)

De [backend.md](./backend.md) — **✅ sin decisiones abiertas**:
- ~~Mantener JWT propio vs. adoptar solución Django-nativa~~ — **resuelto**: login federado con Office 365 (Entra ID) para todos los roles, sin fallback local + `django-ninja-jwt` propio para la API. Aprovisionamiento: admin precrea el `Usuario` (rol+ubicación), Office 365 solo lo vincula por email al primer ingreso.
- ~~Qué hacer con el realtime~~ — **resuelto**: se retira, no se porta (ver hardware-lectura.md).
- ~~Conservar o simplificar la separación CQRS de `llaves`~~ — **resuelto**, y generalizado a los 15 módulos: monolito modular con 5 capas fijas por módulo (`model/repository/domain/service/controller`), `service.py` como única API pública entre módulos. Ver [backend.md](./backend.md#convención-de-capas-por-módulo-monolito-modular).
- ~~Convivencia (strangler fig) vs. corte directo (big-bang)~~ — **resuelto**: no aplica como pregunta de migración de datos, porque no hay datos que migrar (arranque desde cero). Se lanza el sistema completo cuando esté listo; cualquier lanzamiento por etapas sería solo por razones operativas, no arquitectónicas.
- ~~Tablas separadas o compartidas para Programación/Reservas semestrales~~ — **resuelto**: tablas separadas por módulo (compartir tabla violaría la regla de monolito modular ya definida); el validador de disponibilidad compartido las consulta vía sus `service.py`, no por almacenamiento compartido.
- ~~Consumidores de `X-Device-Key` fuera del ESP32~~ — **verificado en código**: uno solo (`POST /api/nfc/lectura`), se retira sin reemplazo.

De [frontend.md](./frontend.md) — **✅ sin decisiones abiertas**:
- ~~Librería de server-state en Angular~~ — **resuelto**: TanStack Query for Angular (16 archivos ya usan el patrón queryKey/invalidateQueries/refetchInterval de React Query, se porta casi 1:1).
- ~~Manejo de estado cliente~~ — **resuelto**: sin NgRx. Solo `authStore` se porta (único store global real, como `AuthService` con signals); `nfcStore` desaparece por completo (era todo cola de turnos ya descartada, o estado que pasa a ser local del componente).
- ~~Si se revisa el UX/UI actual o se replica 1:1~~ — **resuelto: se revisa**, ya en marcha (PrimeNG, flujos consolidados de Llaves/Préstamos, búsqueda de persona unificada, calendario de disponibilidad compartido, indicador de mora). Vista por vista a medida que se construye, sin fase de diseño separada previa.

De [hardware-lectura.md](./hardware-lectura.md) — **✅ sin decisiones abiertas**:
- ~~Convención de foco de campo~~ — **resuelto**: campo dedicado + foco por código, portando el patrón ya usado en `PrestamosPage.jsx` para código de barras de equipos.
- ~~Cola de turnos por lector compartido~~ — **resuelto**: ya no aplica, cada puesto tiene su propio lector.
- ~~Tiempo real multi-usuario~~ — **resuelto**: no se lleva al stack nuevo. Verificado que Socket.io hoy solo se usa para NFC en toda la app; sin dispositivo remoto que empujar al navegador, no hay razón para mantenerlo. Si surge un caso real de tablero compartido a futuro, se evalúa aparte.
- ~~Qué valor exacto entrega el lector elegido~~ — **resuelto**: ID numérico de 0 a 15 dígitos. Define la validación del campo en Angular; se compara directamente contra Comunidad (sin hash — carnet en texto plano).
- ~~Alcance real de lo que hace el ESP32 hoy más allá de leer la tarjeta~~ — **revisado** (`ESP32_RFID.ino`): sin LED/buzzer, pero sí tiene antirrebote (ya cubierto por el patrón de código de barras), cola offline persistente con reintentos (se pierde con el modelo browser-only, a menos que se decida replicar), y ubicación fija por dispositivo + `evento_id` para deduplicar.
- ~~¿Se necesita cola/resiliencia offline en el navegador?~~ — **resuelto**: no, por ahora. Si falla el envío se muestra error y la persona reintenta manualmente.
- ~~¿Cómo se captura la ubicación de la lectura sin el dispositivo fijo?~~ — **resuelto**: asociación rol/usuario ↔ ubicación (ej. Auxiliar 1/2 y Admin → oficina principal, Portero 1 → portería superior, Portero 2 → portería inferior). Requiere campo/relación de ubicación en el modelo de usuario/rol del backend nuevo.

De [roles-y-vistas.md](./roles-y-vistas.md) — **✅ todas las preguntas cerradas** (Portero: llaves+préstamos completo, sin Monitores, historial acotado a lo propio, puede adjuntar novedad al devolver; Auxiliar: acceso a Notificaciones/Novedades; Comunidad: solo consulta para todos).

## Fuera de alcance (confirmado)

- Migración del firmware de `AulaSyncLectores` a otro stack — se retira, no se porta.

## Pendiente real restante en toda la estrategia

- ~~Nivel exacto de Auxiliar en Novedades~~ — **resuelto**: ve y puede cambiar estado abierta→cerrada; decidir la solución es exclusivo de Admin.
- ~~Nivel exacto de Auxiliar en Notificaciones~~ — **resuelto**: administra igual que Admin (enviar manual, reenviar, descartar); lo sensible ya está aparte en Configuración (admin-only).

**No queda ninguna decisión abierta en toda la estrategia de migración a Llavero.**
