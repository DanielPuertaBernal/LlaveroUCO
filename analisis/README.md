# Documentación técnica — LlaveroUCO

Trazado de flujos y dependencias del sistema: qué hace cada módulo, con qué tablas trabaja y dónde vive la lógica de negocio que no se deduce leyendo el código de a un archivo.

**Stack actual**: PostgreSQL (Knex, sin ORM), Express, React + Vite. Autenticación con Office 365 y rol `porteria`. Los lectores son RFID USB tipo teclado emulado, conectados al navegador de cada operador.

- [Arquitectura general](./arquitectura-general.md) — repos, capas y flujo de identificación end-to-end
- [Backend — índice de módulos](./backend/README.md)
- [Frontend — índice de features](./frontend/README.md)
- [Deuda técnica e inconsistencias](./deuda-tecnica.md) — riesgos abiertos
- [Testing y TDD](./testing-tdd.md) — adopción de tests automatizados y secuencia recomendada

Cada módulo/feature tiene su propio archivo con: propósito, modelo de datos, diagramas de dependencias y flujos (Mermaid), puntos de inflexión (lógica de negocio no obvia) y observaciones.

## Historia del stack

Dos migraciones grandes ya ejecutadas explican por qué hay código con nombres que no cuadran con lo que hacen:

- **MongoDB → PostgreSQL**. Los modelos Mongoose (`*.schema.js`) fueron reemplazados por repositorios sobre Knex. Varias columnas conservan el nombre del campo Mongo original para no romper el contrato HTTP, y algunos repositorios traducen entre el payload de negocio y las columnas reales (`novedad.repository.js`, `llave.repository.js`).
- **ESP32/NFC → lectores RFID USB**. El gateway serie sobre Socket.IO fue retirado; cada operador lee su propia tarjeta en el navegador. La migración 009 acompañó ese cambio moviendo la autorización de portería de `ubicaciones_operativas` a permisos por bloque (`portero_bloques`).

