# Módulo `auth`

## 1. Propósito

Centraliza autenticación/autorización de la API: emisión y verificación de JWT (access + refresh), gestión de sesiones de refresh persistidas en el propio documento de usuario, y middlewares de guardia de rutas (`requireAuth`, `requireAdmin`, `requireAux`) usados por prácticamente todos los demás features. Define el único modelo Mongoose `Usuario` (colección `usuarios`), que el feature `usuarios/` reutiliza por re-exportación.

## 2. Modelo de datos

`src/features/auth/auth.schema.js`, colección `usuarios`, `versionKey: false` (líneas 86-87).

| Campo | Tipo / reglas | Línea |
|---|---|---|
| `usuario` | String, required, **unique**, trim, min 3/max 50 | 29-36 |
| `nombre` | String, required, trim, min 2 | 37-42 |
| `email` | String, required, **unique**, trim, lowercase, regex `/^\S+@\S+\.\S+$/` | 43-50 |
| `contacto` | String, default `''` | 51-55 |
| `rol` | String, enum `Object.values(ROLES)`, required | 56-60 |
| `hash_password` | String, required, **`select:false`** | 61-65 |
| `activo` | Boolean, default `true` | 66-69 |
| `numero_documento` | String, default `''` | 70-74 |
| `sesiones` | `[sesionSchema]`, default `[]`, **`select:false`** | 75-79 |
| `fecha_creacion` | Date, default `Date.now` | 80-83 |

`sesionSchema` (subdocumento, sin `_id`, líneas 15-25): `token_hash` (required), `user_agent`, `ip`, `created_at`, `expires_at` (required), `revoked_at`.

`ROLES` (líneas 10-13): `ADMIN:'admin_programacion'`, `AUX:'auxiliar_programacion'`. `passwordSchema` (Zod, líneas 93-100): min 8, max 72, requiere mayúscula, minúscula, dígito y carácter especial. Índices: solo los implícitos de `unique` en `usuario`/`email` — sin índice sobre `sesiones.token_hash`.

## 3. Diagrama de clases / dependencias

```mermaid
classDiagram
    class AuthRoutes {
        POST /login
        POST /logout
        GET /me
        POST /refresh
    }
    class AuthController
    class AuthService {
        +login(usuario, password, context)
        +refresh(refreshToken, context)
        +logout(userId, refreshToken)
        +hashPassword(password)
        +verifyPassword(password, hash)
        +getMe(userId)
        -_signAccessToken(user)
        -_signRefreshToken(userId)
        -_persistRefreshSession(user, token, ctx)
    }
    class AuthRepository {
        +findByUsername(username)
        +addRefreshSession(userId, data, max)
        +findActiveRefreshSession(userId, hash)
        +revokeRefreshSession(userId, hash)
        +revokeAllRefreshSessions(userId)
    }
    class AuthMiddleware {
        +verifyToken()
        +requireRole(...roles)
        +requireAdmin
        +requireAuth
        +requireAux (sin consumidores)
    }
    class UsuarioSchema

    AuthRoutes --> AuthController
    AuthController --> AuthService
    AuthService --> AuthRepository
    AuthRepository --> UsuarioSchema
    AuthMiddleware ..> UsuarioRepository : findById (revalida activo)
    UsuarioService ..> AuthService : hashPassword/verifyPassword
    UsuarioService ..> AuthRepository : sesiones
    NfcGateway ..> AuthMiddleware : reimplementa verifyToken (sin check activo)
```

## 4. Flujos principales

### 4.1 Login

```mermaid
sequenceDiagram
    participant C as Cliente
    participant R as auth.routes
    participant S as AuthService
    participant Repo as AuthRepository
    participant DB as MongoDB

    C->>R: POST /login {usuario,password}
    R->>R: authLimiter (10/15min) + validate(loginSchema)
    R->>S: login(usuario,password,context)
    S->>Repo: findByUsername (select +hash_password)
    alt no existe o !activo
        S-->>C: 401 "Usuario o contraseña incorrectos" (mensaje genérico)
    end
    S->>S: bcrypt.compare(password, hash)
    alt no coincide
        S-->>C: 401 mismo mensaje genérico
    end
    S->>S: _signAccessToken (JWT 8h) + _signRefreshToken (JWT 7d, jti único)
    S->>Repo: addRefreshSession (guarda SHA-256 del refresh, no el token en claro; máx 5 sesiones)
    S-->>C: {token, refreshToken, usuario}
```

### 4.2 Refresh con rotación y detección de reuso

```mermaid
sequenceDiagram
    participant C as Cliente
    participant S as AuthService
    participant UsuarioRepo as UsuarioRepository
    participant AuthRepo as AuthRepository

    C->>S: refresh(refreshToken)
    S->>S: jwt.verify(refreshToken, JWT_REFRESH_SECRET)
    S->>UsuarioRepo: findById(payload.sub)
    alt usuario inexistente/inactivo
        S-->>C: 401
    end
    S->>AuthRepo: findActiveRefreshSession(userId, hash(token))
    alt sesión no encontrada (token ya usado/revocado)
        S->>AuthRepo: revokeAllRefreshSessions(userId)
        note right of AuthRepo: detección de reuso — fuerza re-login completo
        S-->>C: 401
    else sesión válida
        S->>AuthRepo: revokeRefreshSession (single-use)
        S->>S: firma nuevo access + nuevo refresh
        S->>AuthRepo: addRefreshSession (nueva)
        S-->>C: {token, refreshToken}
    end
```

### 4.3 verifyToken (middleware de cada request protegida)

```mermaid
flowchart TD
    A[Authorization: Bearer token] -->|falta/no Bearer| E1[401 Token no proporcionado]
    A --> B[jwt.verify sin algorithms explícito]
    B -->|TokenExpiredError| E2[401 Token expirado]
    B -->|otro error| E3[401 Token inválido]
    B --> C{payload.type === 'access'?}
    C -->|no| E3
    C -->|sí| D[usuarioRepository.findById]
    D --> F{usuario existe y activo?}
    F -->|no| E4[401]
    F -->|sí| G[req.user = payload]
    G --> H[next: requireRole si aplica]
```

## 5. Puntos de inflexión

- **Mensajes genéricos en login**: usuario inexistente e inactivo dan el mismo error que password incorrecto — correcto para evitar enumeración de usuarios.
- **Rate limiting asimétrico**: `authLimiter` 10/15min en `/login`, `refreshLimiter` 20/15min en `/refresh`; `/logout` **no tiene limiter**.
- **Revalidación de `activo` en cada request**: `verifyToken` consulta la BD en cada petición (no solo confía en el JWT), por lo que desactivar un usuario invalida su acceso a la API REST inmediatamente — pero el JWT en sí sigue siendo válido hasta expirar si se usa fuera del middleware (ver riesgo en §7).
- **Reuso de refresh token detectado → revoca TODAS las sesiones** (defensa estándar contra robo/replay de refresh token).
- **Rotación single-use**: cada refresh invalida el token usado y emite uno nuevo.
- **Tope de sesiones concurrentes**: `JWT_MAX_SESSIONS` (default 5) — purga sesiones revocadas/expiradas en cada login/refresh sin dejar rastro histórico.
- **Logout no invalida el access token** (JWT stateless, comentario explícito en el código) — solo revoca refresh. El access sigue válido hasta 8h.
- **Cálculo de expiración de sesión frágil**: `_resolveRefreshExpiryDate` solo distingue sufijo `'h'` vs. todo lo demás como días — si `JWT_REFRESH_EXPIRES_IN` se configura en minutos/semanas, el `expires_at` guardado queda desalineado del `expiresIn` real usado por `jwt.sign`.
- **Password nunca se re-valida contra política fuerte en login** (solo en creación/cambio) — correcto, para no romper logins existentes.

## 6. Dependencias externas/cruzadas

**Usa**: `usuarios/usuario.repository.js` (`findById` en `refresh` y en `verifyToken`).

**Lo usan**:
- `src/app.js` monta `/api/auth`.
- `usuarios/usuario.service.js` — `hashPassword`/`verifyPassword`.
- `usuarios/usuario.schema.js` re-exporta `Usuario`, `ROLES`, `passwordSchema`.
- **17 módulos** consumen `requireAuth` (prácticamente todas las rutas del sistema); **12 módulos** consumen `requireAdmin`.
- `requireAux` está definido pero **sin consumidores** en todo el repo.
- `shared/websocket/nfc.gateway.js` **reimplementa** la verificación JWT para el canal Socket.IO en vez de reutilizar `verifyToken` — ver riesgo §7.

## 7. Riesgos y observaciones de auditoría

- **Divergencia de seguridad HTTP vs WebSocket**: `nfc.gateway.js` valida firma/tipo del JWT pero **no consulta la BD ni valida `activo`** — un usuario desactivado con access token aún vigente (hasta 8h) puede seguir conectado al canal NFC/WebSocket aunque ya no pueda usar la API REST.
- **Duplicación de lógica de verificación JWT** en 2 lugares (`auth.middleware.js` y `nfc.gateway.js`), con constantes `JWT_ISSUER`/`JWT_AUDIENCE` repetidas literalmente en 3 archivos.
- **`jwt.verify` sin restricción explícita de `algorithms`** en los 3 puntos donde se usa — no es una vulnerabilidad crítica con `jsonwebtoken@^9`, pero es una desviación de buena práctica defensiva.
- **`_resolveRefreshExpiryDate` frágil ante formatos no-horas/días** en la env var de expiración de refresh.
- **`requireAux` código muerto** — o feature pendiente de aplicar en rutas que hoy solo distinguen `requireAuth`/`requireAdmin`.
- **`/logout` sin rate limiter** — inconsistencia menor frente al resto del módulo.
- **Sin auditoría histórica de sesiones**: sesiones revocadas/expiradas se purgan del array en cada login/refresh sin dejar rastro.
- **Búsqueda de sesión O(n) en memoria** sobre el array embebido en vez de query indexada — impacto mínimo dado el tope de 5 sesiones.
- **Puntos positivos confirmados**: no hay secretos hardcodeados (`.env.example` solo placeholders); manejo de errores async correcto vía `express-async-errors` + `error.handler.js`.
