# Lectura de credencial: ESP32/RC522 → lector USB HID

**Estado**: en definición — este es el cambio de mayor impacto arquitectónico de la migración, no un simple cambio de proveedor de hardware.

## Flujo actual (a retirar)

Según la auditoría ([arquitectura-general.md](../arquitectura-general.md)):

1. ESP32 + lector RC522 lee la tarjeta/credencial.
2. El ESP32 hace `POST /api/nfc/lectura` al backend, autenticado con una clave compartida por header `X-Device-Key` (sin JWT, sin identidad por dispositivo individual — riesgo ya detectado en la auditoría).
3. `LlaveService` decide préstamo/devolución según la `Programación` del día y si quien presenta la tarjeta es docente titular o monitor delegado.
4. El resultado se emite por Socket.io (namespace `/nfc`) al frontend, en tiempo real, a todos los clientes conectados.
5. Existe además un **segundo canal**: un lector USB conectado localmente al servidor por `SerialPort`, con un protocolo de "cola de intención" (TTL 60s, FIFO) para que varios usuarios de oficina compartan el mismo lector físico.

## Flujo nuevo (propuesto)

El nuevo lector es un dispositivo USB genérico tipo **teclado (HID / keyboard-wedge)**: al leer la credencial, el lector "teclea" el valor directamente en el campo que tenga el foco en el navegador (típicamente seguido de Enter), como si un usuario lo hubiera tipeado.

Esto cambia el flujo de raíz:

- **Ya no hay un dispositivo de red hablándole al backend.** La lectura ocurre client-side, en el navegador de cada puesto de trabajo, como cualquier input de formulario.
- El backend deja de recibir el evento NFC por un endpoint dedicado con auth de dispositivo (`X-Device-Key`); en su lugar, el frontend valida el valor tecleado y dispara la llamada API normal (autenticada con la sesión del usuario logueado, no con una credencial de dispositivo compartida). Esto de hecho **resuelve** el riesgo de auth de dispositivo compartida detectado en la auditoría.
- El **segundo canal actual** (lector USB por `SerialPort` en el servidor, con cola de intención compartida entre usuarios de oficina) probablemente **deja de tener sentido**: si cada puesto tiene su propio lector USB conectado directamente al navegador, ya no hace falta compartir un lector físico único vía servidor.

## Decidido: un lector por puesto de trabajo, tipo código de barras

Confirmado: será **un lector HID por equipo/estación**, no un lector compartido. Se comporta como un lector de código de barras (captura el valor del carnet y lo "pega" en un campo del formulario). Esto tiene precedente directo ya funcionando en la app: `PrestamosPage.jsx` (AulaSyncFrontend) ya resuelve exactamente este patrón para el código de barras de equipos:

- Un `<input>` normal del formulario, controlado por estado (`barcodePrestamo`), con una `ref` (`inputPrestamoRef`) para devolverle el foco a mano después de cada lectura.
- Un `useEffect` con debounce de 120ms sobre el valor del input: como el lector escribe muy rápido y luego se detiene, ese silencio de 120ms es la señal de "lectura completa" (a diferencia de un usuario tipeando, que es más lento e irregular).
- Normalización del código (`normalizarCodigoEscaneado`) y una `ref` de "último código procesado" (`ultimoScanPrestamoRef`) para no duplicar el registro si el campo no se alcanza a limpiar a tiempo.

Este patrón se porta directo a Angular (reactive forms + `debounceTime`/`distinctUntilChanged` de RxJS, equivalente conceptual al `useEffect`+`setTimeout` actual) para el campo de lectura de carnet/NFC. **No hace falta un listener global de teclado** — se resuelve con campo dedicado + foco gestionado por código, igual que hoy con equipos.

Consecuencia directa: como cada puesto tiene su propio lector, **el sistema de cola de turnos actual (`EN_COLA`, `POSICION_COLA`, `LECTOR_LIBRE`, `INTENCION_*`) deja de tener razón de ser** — ese mecanismo solo existía para coordinar el uso de un único lector físico compartido por varios usuarios de oficina (ver `useNFCSocket.js`), y ese problema desaparece con el hardware nuevo.

## Decidido: sin tiempo real en el stack nuevo

Verificado en el código: Socket.io se usa **exclusivamente** para NFC en toda la aplicación — no hay ningún `io.emit`/`.to(`/`.broadcast` fuera de `nfc.gateway.js`/`nfc.service.js` en el backend, y en frontend `MonitoresPage`, `ReservasPage` y `ReservasSemestralesPage` solo reusan `useNFCSocket` para el mismo flujo de identificación por carnet, sin funcionalidad de tiempo real propia. `notificaciones` ya funciona por polling (`refetchInterval`), no por push.

La razón de fondo por la que existe el socket no era solo la cola de turnos: es que el dispositivo lector está físicamente separado del navegador (ESP32 en red, o lector serial en el servidor), así que el servidor tiene que empujar el resultado porque el navegador no puede enterarse solo. Con el lector USB conectado directo al equipo del usuario, esa separación desaparece: el navegador recibe el valor como evento de teclado, sin viaje por el servidor.

**Decisión**: no llevar tiempo real (Socket.io/Django Channels) al stack nuevo. La lectura y el resultado se resuelven con una llamada HTTP normal, igual que el resto del formulario. Si a futuro surge un caso real de pantalla compartida en vivo (ej. tablero de oficina), se evalúa como feature aparte y acotada, no por defecto.

## Decidido: el lector entrega un ID numérico de 0 a 15 dígitos

**Confirmado**: el lector elegido entrega un identificador **numérico, de 0 a 15 dígitos**. Esto define directamente la validación en el frontend (`normalizarCodigoEscaneado`-equivalente en Angular): solo dígitos, longitud máxima 15 — cualquier valor con letras o más largo se descarta como lectura inválida, no se envía.

Comunidad recibe el código de carnet **en texto plano** desde el ETL externo (ver [backend.md](./backend.md)), así que el valor que entrega el lector se compara directamente contra el `id_carnet` almacenado, sin necesidad de hashearlo.

## Lo que hace el firmware del ESP32 más allá de "leer y enviar" (revisado: `AulaSyncLectores/ESP32_RFID.ino`)

No hay LED ni buzzer ni ninguna forma de feedback físico en el dispositivo — el feedback que ve el usuario hoy viene 100% de la app (vía Socket.io). Pero sí hay tres piezas de lógica que la migración debe decidir si replica o descarta:

- **Antirrebote (3s, `DEBOUNCE_MS`)**: ignora la misma tarjeta si se vuelve a leer antes de 3 segundos. *Ya cubierto*: el patrón de código de barras que se va a portar (`PrestamosPage.jsx`) resuelve esto mismo con su propio debounce.
- **Cola offline persistente**: si el envío falla (sin WiFi, error 5xx/timeout), la lectura se guarda en la memoria flash del ESP32 (`Preferences`, sobrevive un reinicio) y se reintenta cada 15s hasta 5 veces, con hasta 25 lecturas en cola (`sincronizarPendientes`). Es decir: si el servidor no responde en el momento, la lectura no se pierde. **Con un lector USB conectado al navegador esto desaparece por completo** — no hay memoria persistente propia ni reintentos automáticos; si el navegador pierde red o se cierra la pestaña en el momento de la lectura, se pierde a menos que se construya algo aparte (ej. cola en IndexedDB, o simplemente aceptar que se muestra un error y la persona reintenta a mano).
- **Ubicación fija por dispositivo + idempotencia**: cada ESP32 tiene una `DEVICE_LOCATION` fija (ej. `"porteria_superior"`) que viaja con cada lectura, y genera un `evento_id` único (`ubicacion-uid-timestamp-random`) para que el servidor pueda deduplicar reintentos. En el modelo nuevo la "ubicación" ya no es implícita por el hardware — hay que decidir cómo se captura (config fija por puesto de trabajo, o derivada del usuario logueado).

**Decidido**: sin cola offline en el nuevo modelo. Si el envío falla, se muestra error y la persona reintenta manualmente — no se replica la persistencia/reintentos automáticos del ESP32.
- ~~¿Cómo se captura la ubicación de la lectura?~~ — **resuelto**, ver abajo.

## Decidido: ubicación por rol de usuario, no por dispositivo

Ya no hay un dispositivo fijo por puerta que determine la ubicación (`DEVICE_LOCATION` del ESP32). En su lugar, la ubicación se deriva de una **asociación rol/usuario ↔ ubicación**, definida de antemano:

- Auxiliar 1, Auxiliar 2, Admin → oficina principal
- Portero 1 → portería superior
- Portero 2 → portería inferior
- (etc., un rol/usuario puede tener su ubicación fija asignada)

Es decir: cuando un usuario logueado registra una lectura, la ubicación ya no viaja "porque el dispositivo la tenía fija" — se deriva de quién es el usuario y su ubicación asignada. Esto implica en el backend nuevo (Postgres/Django) que el modelo de usuario/rol necesita un campo o relación de ubicación asignada (ver [backend.md](./backend.md)), y que el flujo de lectura ya no valida "qué dispositivo envió esto" (`X-Device-Key`) sino "qué usuario autenticado envió esto y cuál es su ubicación".

Arquitectónicamente, lo que antes hacía el ESP32 como dispositivo independiente (capturar + adjuntar ubicación + enviar) pasa a ser lógica de una vista/servicio dentro del frontend: el componente de lectura toma el valor del lector USB, y la ubicación la resuelve del usuario autenticado, no de configuración de hardware.

**Precisión de UI (corregida en el prototipo tras revisión)**: la ubicación **no debe ser un campo visible/editable** en ningún formulario de entrega o devolución — ni siquiera como dropdown de solo-lectura. Se muestra como dato derivado (ej. un chip informativo junto al formulario), nunca como algo que la persona elige. La regla en una frase: si entrega/recibe un Portero, es porque fue en su portería; si entrega/recibe Auxiliar o Admin, es porque fue en la oficina — no hay ambigüedad que justifique dejarlo seleccionable.

## Impacto en `AulaSyncLectores` (repo firmware)

Este repo queda **fuera del alcance de migración**: se planea su retiro una vez el nuevo flujo esté validado en piloto, no su portabilidad a otro stack.
