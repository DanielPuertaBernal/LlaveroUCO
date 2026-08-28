# Deuda técnica e inconsistencias — AulaSync

Consolidado de los hallazgos de la auditoría (2026-08-06) sobre los 3 repos. Detalle por módulo en [backend/](./backend/) y [frontend/](./frontend/).

## Backend (AulaSyncBackend)

| Hallazgo | Riesgo |
|---|---|
| Cero cobertura de tests en todo el backend | Alto |
| ~~Sin transacciones en `llaves`~~ **Resuelto** | Ambos dominios usan transacciones: `llaves` encadena sus inserts en `knex.transaction()` (`llave.write-model.js`, `llave.workflows.js`) y `prestamos` hace lo propio en `crear()`/`registrarDevolucion()` |
| Lógica de solapamiento de horarios triplicada en `programacion`/`reservas`/`reservas_semestrales` | Medio — candidato a unificar |
| Relaciones entre catálogos por texto plano (nombre), sin integridad referencial | Medio |
| Varios módulos acceden a schemas de otros módulos saltándose la capa `repository` | Medio — bypass de capas |
| `POST /api/comunidad/sync` público, sin autenticación | Alto — endpoint abierto |
| Autenticación NFC de ESP32 por clave única compartida (`X-Device-Key`), sin identidad por dispositivo | Medio |

Resuelto correctamente (no es deuda): índice único `{numero_documento, aula, dia_entrega}` en `Llave` previene doble entrega el mismo día.

## Frontend (AulaSyncFrontend)

| Hallazgo | Riesgo |
|---|---|
| Bug real: `AlertTriangle` usado sin import en `NotificacionesTab.jsx:200` | Alto — rompe en runtime |
| Autorización de rol ADMIN aplicada solo en cliente (`novedades`, `usuarios`) | Alto — depende de que el backend valide también (verificar) |
| Riesgo en socket NFC: `socket.off()` sin handler específico puede anular listeners de otros consumidores del socket singleton | Medio |
| Código huérfano: `features/llaves/LlavesPage.jsx`, `NotificacionesTab.jsx` (no enrutados), `configuracion/ConfiguracionPage.jsx` (reemplazado), `gestion-salones/GestionSalonesPage.jsx` (wrapper trivial de 5 líneas) | Bajo — limpieza |
| Lógica de búsqueda de persona por documento/carnet/NFC duplicada en `PrestamosPage`, `MonitoresPage`, `ReservasPage`, `ReservasSemestralesPage` | Medio — candidato a hook compartido |
| Endpoints/hooks sin consumidor: aprobar/rechazar de reservas individuales, 4 hooks de `reservasSemestralesApi` | Bajo — limpieza |

Nota de diseño (no es deuda per se): access token solo en memoria (Zustand), refresh token en `localStorage`, con deduplicación de refresh concurrente en el interceptor de axios.

## Priorización sugerida

1. Fix inmediato: import faltante de `AlertTriangle` (rompe en runtime).
2. Cerrar `POST /api/comunidad/sync` sin auth.
3. Transacciones Mongo en `llaves` (condición de carrera real; `prestamos` ya las tiene).
4. Verificar que la autorización ADMIN del frontend tenga contraparte real en el backend.
5. Unificar lógica de solapamiento de horarios (3 copias) y búsqueda de persona (4 copias).
6. Limpieza de código huérfano y endpoints sin consumidor.
7. Tests: backend sin cobertura — priorizar `llaves`/`prestamos` por el riesgo de concurrencia.

## Pendiente

Este documento cubre lo capturado en la auditoría del backend y frontend. Falta pasar por el mismo tamiz **AulaSyncLectores** (firmware ESP32+RC522) — no se registraron riesgos específicos de ese repo en la auditoría inicial.
