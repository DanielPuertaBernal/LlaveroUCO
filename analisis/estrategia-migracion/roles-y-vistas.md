# Roles y vistas — insumo para mockups (draw.io)

**Estado**: borrador inicial, a confirmar antes de empezar los mockups vista por vista / rol por rol.

**Roles confirmados**: **Admin**, **Auxiliar**, **Portero**. Los dos últimos ya tienen ubicación asignada (ver [hardware-lectura.md](./hardware-lectura.md)): Auxiliar 1/2 y Admin → oficina principal; Portero 1 → portería superior; Portero 2 → portería inferior.

## Línea base: cómo funciona el acceso hoy (verificado en código)

Hoy solo existen 2 roles (`admin_programacion`, `auxiliar_programacion`) y el patrón es consistente en todo el backend:

- **12 módulos** (bloques, tipos de silletería, salones, ubicaciones, programación, reservas, reservas semestrales, comunidad, configuración, notificaciones, novedades, usuarios) restringen **escritura a Admin**, con **lectura abierta a cualquier autenticado**.
- **5 módulos operativos del día a día** (equipos, llaves, monitores, nfc, préstamos) **no distinguen rol en absoluto** hoy — cualquier autenticado los opera completo.

Con el rol **Portero** nuevo (que no existía) y la asociación rol↔ubicación ya decidida, este patrón binario (Admin vs. el resto) ya no alcanza — hace falta decidir, módulo por módulo, si Portero ve lo mismo que Auxiliar o un subconjunto más chico, y si la ubicación asignada limita qué registros ve (ej. ¿un Portero de portería superior ve llaves de todas las ubicaciones o solo la suya?).

## Matriz vista × rol (hipótesis inicial, a confirmar)

Basada en el patrón actual + lo ya decidido en esta estrategia. `✅` = acceso completo, `👁️` = solo lectura, `❌` = sin acceso, `❓` = a definir con el equipo.

| Vista (17 features actuales) | Admin | Auxiliar | Portero | Nota |
|---|---|---|---|---|
| Login (Office 365) | ✅ | ✅ | ✅ | Todos entran por Office 365 (ya decidido) |
| Perfil | ✅ | ✅ | ✅ | Cada quien ve/edita el suyo |
| Catálogos (bloques, salones, ubicaciones, tipos de silletería) | ✅ CRUD | 👁️ | ❓ (inferido ❌) | "Llaves y equipos... pero no todo lo demás" — se infiere sin acceso, confirmar |
| Programación (gestión) | ✅ CRUD (import Excel) | 👁️ | ❓ (inferido ❌) | Conserva su propio flujo (carga masiva) — no se fusiona con las otras dos |
| Reservas semestrales (gestión) | ✅ CRUD (alta por grupo) | ✅ (mismo nivel que Admin) | ❓ (inferido ❌) | Conserva su propio flujo — no se fusiona. **Corregido**: Auxiliar gestiona reservas, no solo consulta |
| Reservas individuales (gestión) | ✅ CRUD (aprobar/rechazar) | ✅ (mismo nivel que Admin) | ❓ (inferido ❌) | Conserva su propio flujo — no se fusiona. **Corregido**: Auxiliar gestiona reservas, no solo consulta |
| **Disponibilidad de salón (calendario)** | ✅ | 👁️ | ❓ | **Decidido**: componente compartido (FullCalendar) que superpone las 3 fuentes por color, embebido en los 3 flujos de creación de arriba y disponible como vista de consulta suelta. Resuelve el bug de "libre en una pantalla, ocupado en otra" con una sola fuente visual+lógica de verdad (mismo validador que backend.md) |
| **Llaves** | ✅ | ✅ | ✅ | **Confirmado**: prestar y recibir/devolver, sin importar ubicación (la ubicación solo etiqueta la transacción, no filtra) |
| **Préstamos (equipos)** | ✅ | ✅ | 👁️ + solo Devolución | **Corregido**: a diferencia de Llaves, Portero **solo recibe/devuelve equipos, no los presta**. La pestaña "Nuevo préstamo" no aparece para Portero, solo "Devolución" |
| **Monitores** | ✅ | ✅ | ❌ | **Confirmado**: Portero no ve Monitores. Es una función de Auxiliar/Admin — otorga permiso a estudiantes u otras personas para reclamar la llave de un profesor en su nombre, no es operación diaria de portería |
| Historial | ✅ (incluye lo de Porteros) | ✅ (incluye lo de Porteros) | 👁️ (solo lo propio) | **Confirmado**: Portero ve su propio historial; Auxiliar y Admin ven todo, incluido lo que hizo cada Portero |
| Comunidad | 👁️ (incluye contacto: correo y teléfono) | 👁️ (incluye contacto: correo y teléfono) | ❌ | **Corregido**: Portero **no** ve el directorio de Comunidad — identifica personas exclusivamente por el lector NFC/HID embebido en Llaves/Préstamos, no navegando este listado. Auxiliar y Admin sí ven datos de contacto (`correo`, `numero_contacto` — campos ya existentes en el modelo actual, `comunidad.controller.js`), útiles para gestión administrativa que Portero no hace |
| Notificaciones | ✅ (enviar manual, reenviar, descartar) | ✅ (mismo nivel que Admin) | ❌ | **Resuelto**: no hay razón para restringir aquí — lo sensible (umbrales, intervalos, máx. recordatorios) ya vive aparte en Configuración (admin-only). Enviar/reenviar/descartar es comunicación operativa, mismo tipo de tarea que Auxiliar ya hace en Novedades |
| Novedades (pantalla de gestión) | ✅ CRUD (incluye definir la solución) | 👁️ + cambiar estado abierta→cerrada (nada más) | ❌ (pantalla de gestión) | **Confirmado**: Auxiliar ve y puede cerrar una novedad, pero no decide la solución — eso es exclusivo de Admin. Portero no ve esta pantalla, pero sí puede **adjuntar una novedad al devolver** (ver fila Llaves/Préstamos) |
| Configuración | ✅ | ❌ (hipótesis) | ❌ (hipótesis) | Config del sistema, probablemente solo Admin |
| Usuarios | ✅ | ❌ (hipótesis) | ❌ (hipótesis) | Gestión de cuentas, probablemente solo Admin ve esta vista |
| ~~Gestión de salones~~ | — | — | — | Ya descartada como código huérfano (ver frontend.md) |
| ~~NFC (página de estado)~~ | — | — | — | Su propósito actual (estado de cola/socket en tiempo real) queda obsoleto con el lector HID (ver hardware-lectura.md) — probablemente no existe como vista propia en el rediseño, se vuelve parte del formulario de cada flujo |

## Cómo usar esto para los mockups

Cuando pasen a draw.io, la unidad de mockup natural es **vista × rol donde el acceso difiere** — no hace falta mockear 3 versiones de una pantalla si los 3 roles ven exactamente lo mismo (ej. Login, Perfil). Priorizar los `❓` de la tabla antes de dibujar, para no mockear una pantalla y descubrir después que ese rol no debía verla.

## Preguntas para cerrar antes de mockups

1. ~~¿Portero opera `llaves`/`préstamos` igual que Auxiliar?~~ — **resuelto**: sí, prestar y recibir, sin importar ubicación. `Monitores` queda **confirmado fuera** (es función de Auxiliar/Admin: otorgar permiso a alguien para reclamar la llave de un profesor en su nombre).
2. ~~¿La ubicación filtra los datos que ve?~~ — **resuelto**: no, solo etiqueta la transacción.
3. ~~¿Auxiliar tiene acceso a Notificaciones/Novedades?~~ — **resuelto**: sí a ambas; nivel exacto (ver vs. administrar) se define en el mockup.
4. ~~¿Comunidad necesita edición manual?~~ — **resuelto**: no, solo consulta para todos los roles.
5. ~~¿Portero puede adjuntar novedad al devolver?~~ — **resuelto**: sí, como parte del flujo de devolución.
6. ~~¿Portero ve `Historial` de lo que él procesó?~~ — **resuelto**: sí, acotado a lo propio; Auxiliar/Admin ven todo.

**Todas las preguntas de esta matriz están cerradas**, incluida la de Notificaciones (Auxiliar administra igual que Admin — ver arriba).

## Correcciones tras probar el prototipo por rol

- **Préstamos (equipos)**: Portero solo devuelve, no presta — a diferencia de Llaves, donde sí hace ambas. Corregido en el prototipo (pestaña "Nuevo préstamo" oculta para Portero).
- **Comunidad**: Portero no tiene esta vista — identifica personas por el lector NFC/HID dentro de Llaves/Préstamos, no por un directorio navegable. Corregido en el prototipo (ya no aparece en su menú).
- **Comunidad — datos de contacto**: Auxiliar y Admin ven `correo` y `numero_contacto` (teléfono) de cada persona, campos ya existentes en el modelo actual. Corregido en el prototipo.
- **Reservas (individuales y semestrales)**: Auxiliar gestiona igual que Admin (crear, aprobar/rechazar, alta por grupo) — no es solo consulta como se había dejado en el borrador inicial. Corregido en el prototipo (acciones ya no ocultas para Auxiliar en la vista de Reservas).
