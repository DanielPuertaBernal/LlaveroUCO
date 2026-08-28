# Módulo `usuarios`

## 1. Propósito

Gestiona los usuarios internos del sistema (staff con acceso a AulaSync: administradores y auxiliares de programación) — distinto de `comunidad` (personas externas: docentes/estudiantes/empleados). Un usuario del sistema puede vincularse opcionalmente a un registro de `comunidad` vía `numero_documento`. El comentario de cabecera (`usuario.service.js:3-4`) indica que es un puerto desde una aplicación Python previa (`auth_service.py`).

## 2. Modelo de datos

Comparte la tabla `usuarios` con [`auth`](./auth.md), donde está documentada en detalle. Este módulo es el CRUD administrativo sobre ella; `auth` maneja login, sesiones y rotación de tokens.

Lo que conviene tener presente acá:

| Columna | Detalle relevante para el CRUD |
|---|---|
| `rol` | CHECK: `admin_programacion`, `auxiliar_programacion`, `superadmin`, `porteria` |
| `proveedor_auth` | `local` u `office365`. Las de Office 365 tienen `hash_password` NULL |
| `hash_password` | nullable; nunca se devuelve en las respuestas |
| `activo` | desactivar en vez de borrar es el camino normal |
| `numero_documento` | vínculo opcional a `comunidad`, sin FK |

Los usuarios con rol `porteria` tienen además permisos por bloque en `portero_bloques` — ver [porteros](./porteros.md).

Únicos parciales sobre `usuario` y `email`, solo entre filas no borradas.

## 3. Diagrama de clases / dependencias

```mermaid
classDiagram
    class UsuarioRoutes
    class UsuarioController {
        +listar()
        +crear()
        +cambiarEstado()
        +editarPerfil()
        +cambiarContrasena()
        +obtener()
        +vincularComunidad()
    }
    class UsuarioService {
        +listarUsuarios()
        +crearUsuario(datos)
        +cambiarEstado(username, activo, actual)
        +editarPerfil(username, datos)
        +cambiarContrasena(username, actual, nueva)
        +obtenerUsuario(username)
        +vincularComunidad(username, documento)
    }
    class UsuarioRepository {
        +findAll()
        +findByUsername()
        +findById()
        +findByEmail()
        +create()
        +updateByUsername()
        +setActivo()
        +updatePassword()
        +checkDuplicates()
    }
    class UsuarioSchema
    class AuthRepository
    class AuthService
    class ComunidadRepository

    UsuarioRoutes --> UsuarioController
    UsuarioController --> UsuarioService
    UsuarioService --> UsuarioRepository
    UsuarioService --> AuthRepository : sesiones, hash_password
    UsuarioService --> AuthService : hashPassword/verifyPassword
    UsuarioService --> ComunidadRepository : enriquecer/vincular
    UsuarioRepository --> UsuarioSchema
    AuthMiddleware ..> UsuarioRepository : findById (verifica activo en cada request)
```

## 4. Flujos principales

### 4.1 Creación de usuario

```mermaid
sequenceDiagram
    participant C as UsuarioController
    participant S as UsuarioService
    participant Repo as UsuarioRepository
    participant Auth as AuthService

    C->>S: crearUsuario({usuario,nombre,email,contacto,password,rol,numero_documento})
    S->>Repo: checkDuplicates(usuario,email) (Promise.all)
    alt usuario o email ya existen
        S-->>C: 409 ApiError.conflict
    end
    S->>Auth: hashPassword(password)
    note right of Auth: valida política fuerte (8+, mayús/minús/número/especial) y bcrypt.hash(SALT_ROUNDS=12)
    S->>Repo: create({..., rol: rol||AUX, activo:true, hash_password})
    Repo-->>S: usuario (sin hash_password)
    S-->>C: 201 usuario creado
```

### 4.2 Desactivación de usuario (soft delete + revocación de sesiones)

```mermaid
sequenceDiagram
    participant C as UsuarioController
    participant S as UsuarioService
    participant Repo as UsuarioRepository
    participant AuthRepo as AuthRepository

    C->>S: cambiarEstado(username, activo=false, usuarioActual)
    alt username === usuarioActual
        S-->>C: 400 ApiError.badRequest (autoprotección)
    end
    S->>Repo: setActivo(username, false)
    alt no existe
        S-->>C: 404
    end
    S->>AuthRepo: revokeAllRefreshSessions(updated._id)
    note right of AuthRepo: corta acceso inmediato, no solo bloquea logins futuros
    S-->>C: 200 usuario actualizado
```

### 4.3 Cambio de contraseña propia

```mermaid
sequenceDiagram
    participant S as UsuarioService
    participant AuthRepo as AuthRepository
    participant Auth as AuthService

    S->>AuthRepo: findByUsername (con hash_password vía select('+hash_password'))
    S->>Auth: verifyPassword(passwordActual, hash)
    alt no coincide
        S-->>S: 401 ApiError.unauthorized
    end
    S->>Auth: hashPassword(passwordNueva)
    S->>AuthRepo: updatePassword + revokeAllRefreshSessions
    note right of AuthRepo: fuerza re-login en todos los dispositivos
```

## 5. Puntos de inflexión

- **No hay hard delete**: no existe `delete`/`remove` en controller, service, repository ni routes — el único mecanismo es `activo: false`.
- **Doble estándar de validación de password**: el Zod de rutas (`crearUsuarioSchema`, `usuario.routes.js:13-21`, y `contrasenaSchema:33-36`) solo exige `min(6)`, pero `authService.hashPassword` exige 8+ con complejidad — una petición puede pasar la validación de ruta y fallar después en el service con un mensaje distinto (inconsistencia de contrato, no bug de seguridad).
- **Autoprotección de desactivación**: un usuario no puede desactivarse a sí mismo (`usuario.service.js:80-82`), pero no hay endpoint para cambiar el rol de un usuario existente una vez creado — el rol es inmutable vía API tras la creación.
- **`editarPerfil` no permite tocar `rol` ni `activo`** — protección implícita contra escalación de privilegios vía ese endpoint (reforzada porque usa `requireAuth`, no `requireAdmin`).
- **Password nunca se retorna**: 3 capas — `select:false` en schema, destructuring explícito en `create()`/`updateByUsername()` del repositorio, y `_sanitizeUser` en `auth.service.js`.
- **Revocación de sesiones como efecto colateral** ante eventos sensibles: desactivación de cuenta y cambio de password.
- **Vinculación con comunidad**: pasar `numero_documento` vacío desvincula; si no está vacío, valida que exista en `comunidad` antes de asociar (`usuario.service.js:163-167`).
- **`checkDuplicates` no es atómico con `create`**: ventana de carrera teórica bajo alta concurrencia, mitigada por índices únicos de Mongo pero sin captura explícita de la excepción de duplicado en `crearUsuario` (podría propagar como 500 en vez de 409 bajo condición de carrera).

## 6. Dependencias externas/cruzadas

**Usa**: `auth.repository` (sesiones, hash visible), `auth.service` (hash/verify password), `comunidad.repository` (enriquecimiento y vinculación).

**Lo usan**:
- `src/app.js:15` monta las rutas.
- `auth.service.js:7` — `usuarioRepository.findById()` en `refresh()` y `getMe()`.
- `auth.middleware.js:8,33-36` — `usuarioRepository.findById()` en `verifyToken()`, valida que el usuario del JWT siga activo en cada request. **Acoplamiento bidireccional** con `auth` (auth depende de usuarios.repository y usuarios depende de auth.repository/service).
- Otros módulos **no importan `usuarios` directamente**; consumen `req.user`, poblado por `auth.middleware` desde el JWT. La trazabilidad de quién gestionó una operación sí es FK real (`gestionado_por_usuario_id` en `registros_llaves`, `prestamos` y `devoluciones`, más `gestionado_por_devolucion_usuario_id`); lo que queda denormalizado son campos de texto libre como `auxiliar_prestamista` y `enviado_por`.

## 7. Riesgos y observaciones de auditoría

- **Sin tests**: no existe ningún archivo `.test.js`/`.spec.js` en todo el repositorio.
- **Doble estándar de validación de password** entre capa de ruta (Zod) y capa de servicio — ver §5.
- **Sin rate limiting** en `PATCH /contrasena`.
- **No hay endpoint para cambiar rol** de un usuario existente — funcionalidad ausente o decisión de diseño no documentada.
- **Sin auditoría de cambios**: no hay `creado_por`/`actualizado_por`/`fecha_actualizacion` en el schema — solo `fecha_creacion`. Cambios de estado, perfil, password y vinculación no dejan rastro persistente de qué admin los ejecutó.
- **Acoplamiento bidireccional `auth` ↔ `usuarios`** dificulta el aislamiento real del vertical slice.
- **`numero_documento` sin índice ni unicidad** pese a usarse como clave de vinculación cruzada — riesgo de performance y de que dos usuarios queden vinculados al mismo registro de comunidad.
- **`checkDuplicates` no atómico con `create`** — ver §5.
- **Trazabilidad mixta**: la autoría de las operaciones es FK real desde la migración 009, pero conviven campos de texto libre heredados (`auxiliar_prestamista`, `enviado_por`, `cargado_por`) que no apuntan a ningún usuario.
