# Estrategia de migración de stack — AulaSync → Llavero

**Estado**: en definición (borrador vivo, se actualiza a medida que se toman decisiones).

**Decidido**: el sistema nuevo se llama **Llavero** (no "AulaSync") — el nombre anterior apuntaba a "Sync" (tiempo real vía Socket.io), que se retira por completo en esta migración (ver [hardware-lectura.md](./hardware-lectura.md)), y a "Aula", cuando el sistema cubre bastante más que salones (llaves, equipos, comunidad, reservas). *Llavero* nombra el objeto físico que Porteros/Auxiliares ya usan a diario, sin depender de una decisión de arquitectura que puede volver a cambiar. Los repos actuales (`AulaSyncBackend`, `AulaSyncFrontend`, `AulaSyncLectores`) mantienen su nombre porque son el sistema legado que se retira, no el nuevo.

## Objetivo

Migrar el sistema actual (AulaSync) a un stack nuevo bajo el nombre **Llavero**, y reemplazar el mecanismo de lectura NFC basado en ESP32 por un lector USB genérico tipo teclado (HID/keyboard-wedge).

| | Actual | Nuevo |
|---|---|---|
| Backend | Express + MongoDB + Socket.io | PostgreSQL + Django Ninja |
| Frontend | React + Vite | Angular |
| Lectura de credencial | Firmware ESP32 + RC522 (red, `X-Device-Key`) + lector USB por servidor (SerialPort, cola FIFO) | Lector USB genérico (HID) que escribe el valor leído directamente en el campo con foco del navegador |

Contexto previo de la aplicación actual: [Deuda técnica e inconsistencias](../deuda-tecnica.md) y [Arquitectura general](../arquitectura-general.md). Varios de los riesgos ya detectados ahí son motivadores directos de esta migración (ver notas en cada documento).

## Documentos de esta carpeta

- [backend.md](./backend.md) — Express/MongoDB → PostgreSQL/Django Ninja
- [frontend.md](./frontend.md) — React/Vite → Angular
- [hardware-lectura.md](./hardware-lectura.md) — ESP32/RC522 → lector USB HID
- [fases-y-decisiones-abiertas.md](./fases-y-decisiones-abiertas.md) — roadmap tentativo y preguntas sin resolver
- [roles-y-vistas.md](./roles-y-vistas.md) — matriz vista × rol (Admin/Auxiliar/Portero), insumo para los mockups en draw.io

## Principios guía (a confirmar con el equipo)

- La migración es también oportunidad de cerrar deuda técnica ya identificada (transacciones, integridad referencial, endpoints sin auth), no solo un cambio de tecnología 1:1.
- Ningún dato ni funcionalidad se retira sin verificar primero si tiene consumidor real (varios módulos actuales tienen código huérfano — no migrar lo muerto).
- El repo `AulaSyncLectores` (firmware ESP32) queda fuera del alcance final: se planea su retiro, no su migración.
