# Deuda técnica e inconsistencias — LlaveroUCO

Estado verificado contra el código y la base, no contra la auditoría original. Detalle por módulo en [backend/](./backend/) y [frontend/](./frontend/).

## Abierto

| Hallazgo | Riesgo | Dónde |
|---|---|---|
| **Cero cobertura de tests** en los dos repos: no hay archivos de test ni script `test` en ningún `package.json` | Alto | todo el proyecto |
| Lógica de solapamiento de horarios duplicada entre `reservas` y `reservas_semestrales`, más una tercera lectura en `notificacion.scheduler` | Medio | `reserva.service.js`, `reservas_semestrales.service.js` |
| Búsqueda de persona por documento/carnet repetida en cuatro páginas, con orden de resolución distinto en cada una | Medio | `PrestamosPage`, `MonitoresPage`, `ReservasPage`, `ReservasSemestralesPage` |
| Bypass de capas: varios repositorios consultan tablas de otros features en vez de pasar por el repositorio dueño | Medio | ver `llaves.md` §7, `reservas_semestrales.md` §6 |
| `configuracion_bloques` sin CHECK: el tope de `max(1440)` minutos vive solo en Zod | Bajo | un seed o script puede dejar valores fuera de rango |
| `validarOperacion` en `ubicacion.service.js` es código muerto y aparenta ser un gate de autorización | Bajo | ver [catálogos](./backend/catalogos.md) §4 |
| `notificaciones.notificacion_admin_enviada` y `novedades.prestamo_id`: columnas que ningún flujo lee ni escribe | Bajo | |
| Solo se puede reportar una novedad sobre una llave con préstamo activo | Bajo | una llave rota en el tablero no tiene dónde engancharse |

## Resuelto

| Hallazgo original | Qué pasó |
|---|---|
| Sin transacciones en `llaves` | `knex.transaction()` en `llave.write-model.js` y `llave.workflows.js` |
| `POST /api/comunidad/sync` público | Protegido con `requireApiKey('COMUNIDAD_SYNC_API_KEY')` + `syncLimiter` |
| Autorización ADMIN solo en cliente | `requireAdmin` en las rutas de `novedades` y `usuarios` |
| Relaciones entre catálogos por texto plano, sin integridad referencial | FK reales; borrado en blando protegido por `trg_block_soft_delete` en 14 tablas |
| Sin índice sobre `sesiones.token_hash` | `ux_usuario_sesiones_token_hash`, único parcial |
| `AlertTriangle` sin import en `NotificacionesTab.jsx` | El archivo era código muerto; eliminado |
| Código huérfano: `LlavesPage.jsx`, `NotificacionesTab.jsx` | Eliminados; `/llaves` ya redirigía a `/gestion-salones` |
| Hooks y endpoints sin consumidor | Removidos de `llavesApi` (`pendientes`, `hoy`, `exportarHistorial`) y de `reservasSemestralesApi` (4 hooks) |
| Sin máquina de estados en `novedades` | `RANGO_ESTADO` impide retroceder (migración 016) |
| `reportado_por` spoofeable desde el body | Se deriva de `req.user` en el controller |

Los endpoints de backend que respaldaban los métodos removidos siguen existiendo (`/llaves/pendientes`, `/llaves/dia`, `/llaves/historial/exportar`): se retiró el cliente, no el servicio.

## Obsoleto

Desapareció con el retiro del gateway NFC y los lectores ESP32:

- Autenticación de dispositivo por clave compartida `X-Device-Key`.
- `socket.off()` sin handler específico anulando listeners de otros consumidores del socket singleton.

## Falso

- `ConfiguracionPage.jsx` no es huérfana: está enrutada en `/configuracion`.

## Priorización sugerida

1. **Tests.** Es el único item de riesgo alto que queda y bloquea todo lo demás: sin red, cualquier unificación de lógica duplicada se hace a ciegas. Empezar por `llaves` y `prestamos`, que son los de concurrencia real.
2. Unificar la búsqueda de persona en un hook compartido — cuatro copias con criterios distintos ya produjeron un bug (buscar por documento antes que por carnet devolvía la persona equivocada).
3. Unificar el solapamiento de horarios.
4. Cerrar el bypass de capas.
5. Borrar `validarOperacion` y las columnas muertas.
