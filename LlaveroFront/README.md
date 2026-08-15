# LlaveroFrontend

Frontend del sistema de control de llaves y salones de la Universidad Católica de Oriente (React + Vite + Tailwind, TanStack Query, React Router, Zustand).

- Login institucional con Office 365 (Azure AD) — el usuario solo ingresa su correo, la contraseña se valida en el portal de Microsoft.
- Panel de administración de "Porteros": asigna a cada usuario de portería qué bloques y qué operaciones (identificación, préstamo/devolución de llaves, préstamo de equipos) puede gestionar.
- Identificación de tarjeta vía lector RFID USB tipo teclado emulado (sin WebSocket/ESP32).
