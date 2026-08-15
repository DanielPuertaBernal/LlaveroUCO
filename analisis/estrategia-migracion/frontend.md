# Frontend: React/Vite → Angular

**Estado**: en definición.

## Mapeo de arquitectura

| Actual (React) | Nuevo (Angular) |
|---|---|
| `src/features/<dominio>/` con `XxxPage.jsx` + `xxxApi.js` co-localizados | Feature module o standalone components por dominio, con su servicio de datos co-localizado |
| React Query (server-state) | **TanStack Query for Angular** (`@tanstack/angular-query-experimental`) — ver detalle abajo |
| Zustand (`authStore`, `nfcStore`) | Solo `authStore` se porta, como servicio Angular con `signal`/`computed`. `nfcStore` desaparece — ver detalle abajo |

Las 17 features ya documentadas en [../frontend/](../frontend/) son el inventario base para el mapeo: auth, perfil, catalogos, programacion, gestion-salones, reservas-semestrales, nfc, llaves, historial, equipos, prestamos, monitores, notificaciones, novedades, comunidad, configuracion, usuarios.

## Librería de componentes UI: PrimeNG

**Decidido**: se integra **PrimeNG** como librería de componentes, reemplazando el kit custom hecho a mano hoy en `shared/components/ui/` (`Button`, `FormField`, `Select`, `StatusBadge`, `DataTable`, `SheetContent`). Además de dar consistencia visual real (hoy hay parches manuales de tema, ej. commit `style(swal): tema unificado con variables CSS del diseño en todos los popups`), resuelve de fábrica un bug ya documentado: `p-table` pagina/filtra contra el servidor, arreglando gratis el filtro de historial de `llaves` que hoy se hace en memoria (ver `llaves.md` §5).

Mapeo orientativo: `Button`→`p-button`, `FormField`/`Select`→componentes de formulario de PrimeNG, `StatusBadge`→`p-tag`, `DataTable`→`p-table`, `SheetContent`→`p-sidebar`/`p-drawer`.

Va acompañado de un **rediseño de UX** — motivado por evidencia concreta, no solo percepción: `PrestamosPage.jsx` es un componente único que mezcla préstamo+devolución+búsqueda de persona+carrito+historial, y la búsqueda de persona está duplicada en 4 páginas distintas con posible comportamiento divergente. **Decidido**: se revisa vista por vista a medida que se construye en Angular (no una fase de diseño separada previa) — así se viene trabajando ya en el prototipo (`roles-y-vistas.md`).

## Indicador de tiempo restante antes de mora

**Decidido**: para `llaves`/`prestamos`, en vez de un reloj analógico decorativo, un **`p-knob`** de PrimeNG (medidor circular 0-100%, sin librería adicional) mostrando qué tan cerca está un préstamo de entrar en mora, con color progresivo (verde→amarillo→rojo) según el porcentaje transcurrido del límite configurado (`configuracion` ya permite editar el umbral de mora, ver módulo `configuracion` en el backend actual).

Esto es también la oportunidad de resolver una duplicación ya detectada: el cálculo de tiempo transcurrido/restante (`calcularTiempoTranscurrido`) hoy está **implementado dos veces** (`NotificacionesTab.jsx` y `EnviarTab.jsx`, ambos en el frontend actual) — en Angular se consolida en un solo servicio/pipe compartido, no se repite.

## Estado cliente: sin NgRx, un solo store real

Revisado el código: solo hay 2 stores Zustand en toda la app.

- **`nfcStore` desaparece por completo.** Todos sus campos de cola (`intencionActiva`, `enCola`, `posicionCola`, `expiraEn`) son código muerto tras retirar Socket.io y la cola de turnos (ver [hardware-lectura.md](./hardware-lectura.md)). Lo que queda (`ultimaLectura`, `ultimoResultado`, `ultimoCarnet`, `lecturas`) no necesita ser estado global — es el mismo caso que `barcodePrestamo` en `PrestamosPage.jsx`: estado local del componente que tiene el campo de lectura, no algo que otras páginas consulten.
- **`authStore` sí se porta** — es el único estado genuinamente global (identidad/sesión en toda la app). Tiene lógica real a preservar: hidratación (`isHydrating`/`hasHydrated`), persistencia de solo el `refreshToken` (no el access token), y `restoreSession()` (refresh + `/auth/me` al arrancar la app para restaurar sesión sin re-loguear). Con Office 365/MSAL (ver [backend.md](./backend.md)), MSAL maneja la sesión de Microsoft por su lado, pero este mecanismo de refresh/hidratación del JWT propio de la API sigue haciendo falta igual.

**Decisión**: con un solo store global real, `NgRx` es sobre-ingeniería — un `AuthService` de Angular con `signal`/`computed` (equivalente directo a Zustand) alcanza, portando `restoreSession()` a un `APP_INITIALIZER` o guard de arranque.

## Server-state: TanStack Query for Angular

16 archivos ya usan `useQuery`/`useMutation` con `invalidateQueries` por `queryKey` y `refetchInterval` de polling (ej. `llavesApi.js`, `PrestamosPage.jsx`). Reimplementar eso a mano con RxJS puro en 16+ sitios es reinventar cache/invalidación que ya funciona hoy. **TanStack Query for Angular** (mismo equipo que React Query) es casi un calco conceptual — mismo `queryKey`, `invalidateQueries`, `refetchInterval` — y reduce el riesgo de reescritura frente a RxJS puro o al `resource()` nativo de Angular (más nuevo, con menos historial de invalidación por key).

## Qué no migrar (código huérfano ya detectado)

Del [consolidado de deuda técnica](../deuda-tecnica.md), no tiene sentido portar a Angular:

- `features/llaves/LlavesPage.jsx` y `NotificacionesTab.jsx` (no enrutados)
- `configuracion/ConfiguracionPage.jsx` (ya reemplazado por `notificaciones/tabs/ConfiguracionTab.jsx`)
- `gestion-salones/GestionSalonesPage.jsx` (wrapper trivial de 5 líneas sobre `reservas`)
- Endpoints/hooks sin consumidor: aprobar/rechazar de reservas individuales, 4 hooks de `reservasSemestralesApi`

Confirmar en cada caso contra el backend nuevo (Django Ninja) antes de decidir si el endpoint subyacente tampoco se porta.

## Deuda técnica que esta migración debe resolver

- **Autorización de rol ADMIN validada solo en cliente** (`novedades`, `usuarios`) → en Angular, el guard de rutas sigue siendo solo UX; la migración de backend a Django Ninja debe garantizar que **cada** endpoint sensible valide el rol server-side, sin excepciones.
- **Lógica de búsqueda de persona por documento/carnet/NFC duplicada** en `PrestamosPage`, `MonitoresPage`, `ReservasPage`, `ReservasSemestralesPage` → extraer un servicio compartido único desde el diseño inicial de Angular, no repetirla en 4 componentes.
- **Auth**: hoy el access token vive solo en memoria (Zustand) y el refresh token en `localStorage`, con deduplicación de refresh concurrente en el interceptor de axios. Decidir el equivalente en Angular (interceptor HTTP + servicio de auth) preservando esa misma garantía de no disparar refresh duplicado.

## Impacto del cambio de lector NFC (ver hardware-lectura.md)

El socket NFC actual (`socket.off()` sin handler específico, riesgo de anular listeners de otros consumidores del socket singleton) probablemente deja de ser necesario si la lectura pasa a ser un input de teclado normal en el navegador del propio usuario. Ver detalle y preguntas abiertas en [hardware-lectura.md](./hardware-lectura.md).

## Pendiente de definir

- ~~¿Se mantiene diseño visual/UX actual 1:1 o se aprovecha la migración para revisarlo?~~ — **resuelto: se revisa, no se replica 1:1.** Ya en marcha, no en teoría: PrimeNG reemplaza el kit custom, `Llaves`/`Préstamos` se rediseñan como flujo único con lector HID + carrito (en vez del mega-componente actual), la búsqueda de persona se unifica en un solo componente (hoy duplicada en 4 páginas), aparece el calendario de disponibilidad compartido para Programación/Reservas/Semestrales, y el indicador de mora (`p-knob`). Ver el prototipo navegable en `roles-y-vistas.md` y el mockup interactivo ya publicado. Definición de vistas restantes (Notificaciones, Novedades, Catálogos, Programación, Reservas, Configuración, Usuarios) sigue el mismo criterio caso por caso, no hace falta una fase de diseño separada previa.
- ~~Estrategia de convivencia con el frontend React durante la transición~~ — **resuelto**, igual que en backend: al no haber datos ni sistema en vivo que proteger (la app se levanta desde cero, ver [backend.md](./backend.md)), no hay corte progresivo que orquestar entre React y Angular. Se lanza Angular completo cuando esté listo.

`frontend.md` no tiene decisiones abiertas pendientes.
