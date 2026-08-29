# LlaveroUCO

Sistema de control de llaves, salones y equipos de la Universidad Católica de Oriente.

## Estructura

- `LlaveroBack/` — API REST (Node/Express + PostgreSQL). Ver [README](./LlaveroBack/README.md).
- `LlaveroFront/` — Aplicación web (React + Vite). Ver [README](./LlaveroFront/README.md).
- `analisis/` — Documentación técnica y auditoría del sistema (parte histórica, previa a la migración a PostgreSQL).
- `PENDIENTES.md` — Trabajo pendiente, priorizado por riesgo. Ver [pendientes](./PENDIENTES.md).

## Stack

- Backend: Node.js, Express, PostgreSQL, Knex.
- Frontend: React, Vite, Tailwind, TanStack Query.
- Autenticación: login local (JWT) + Office 365 (Azure AD) para cuentas institucionales (`uco.edu.co`, `uco.net.co`).
- Identificación de tarjetas: lectores RFID USB tipo teclado emulado (sin hardware ESP32/WebSocket).

Este repositorio consolida en un solo lugar el trabajo que antes vivía en repos separados (`AulaSyncBackend`, `AulaSyncFrontend`).
