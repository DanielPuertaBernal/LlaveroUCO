# LlaveroBackend

Backend del sistema de control de llaves y salones de la Universidad Católica de Oriente (Node/Express, PostgreSQL + Knex, arquitectura feature-first).

- Autenticación: login local (JWT) + login institucional con Office 365 (Azure AD), dominios `uco.edu.co`/`uco.net.co`.
- Roles: `admin_programacion`, `auxiliar_programacion`, `porteria` (acceso restringido por bloque asignado).
- Identificación de tarjetas: lectores RFID USB tipo teclado emulado, sin servidor de por medio (ya no hay ESP32 ni WebSocket).
- Migrado completamente de MongoDB a PostgreSQL.
