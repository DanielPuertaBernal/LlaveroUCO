# Documentación técnica — AulaSync

Auditoría y trazado de flujos/dependencias del sistema. Nota: este documento describe el estado del proyecto en una etapa previa (arquitectura MongoDB + ESP32/NFC). Desde entonces el backend fue migrado por completo a PostgreSQL, se agregó login institucional Office 365 con el rol "portería", y el firmware ESP32/NFC fue retirado en favor de lectores RFID USB tipo teclado emulado — se conserva como referencia histórica de la auditoría original.

- [Arquitectura general](./arquitectura-general.md) — cómo se conectaban los repos, flujo NFC end-to-end (histórico)
- [Backend — índice de módulos](./backend/README.md)
- [Frontend — índice de features](./frontend/README.md)
- [Firmware Lectores](./lectores/firmware.md) — histórico, el firmware ESP32 fue retirado del proyecto
- [Deuda técnica e inconsistencias](./deuda-tecnica.md) — consolidado de riesgos y hallazgos de la auditoría
- [Estrategia de migración de stack](./estrategia-migracion/README.md) — plan original de migración a PostgreSQL (ya ejecutado)

Cada módulo/feature tiene su propio archivo con: propósito, modelo de datos, diagramas de dependencias y flujos (Mermaid), puntos de inflexión (lógica de negocio no obvia) y observaciones de auditoría.
