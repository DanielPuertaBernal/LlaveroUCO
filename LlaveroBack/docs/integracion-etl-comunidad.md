# Integración ETL — Sincronización de Comunidad

Especificación para el equipo de la ETL institucional que envía datos de
estudiantes y empleados/RRHH hacia el backend de Llavero.

## Base URL

```
http://172.16.11.197:8080/api/comunidad
```

> **Nota:** la máquina corre bajo WSL2. Esa IP es interna al subsistema
> Linux y puede no ser alcanzable desde otras máquinas de la red sin
> configurar port forwarding en Windows (`netsh interface portproxy`) o
> exponer el puerto en el host. Confirmar la IP definitiva según cómo se
> despliegue finalmente (WSL2, servidor dedicado, etc.) antes de fijarla
> en el cliente de la ETL.

## Autenticación

Integración servidor-a-servidor, **sin JWT de usuario**. Se autentica con
una API key fija en el header:

```
X-Api-Key:0edfe4b571955205a678ebbe95eedc982f5958f76678ac1e97ec01a416215bd0
```

- El valor real de `COMUNIDAD_SYNC_API_KEY` se entrega al equipo de la ETL
  por un canal seguro (no por chat/correo plano).
- Si la variable de entorno no está configurada en el backend, el endpoint
  responde `503 Servicio no configurado` (fail closed).
- API key inválida o ausente → `401 { "ok": false, "message": "API key inválida o no proporcionada" }`.
- Los endpoints tienen rate limit (`syncLimiter`).

## Endpoints

### `POST /api/comunidad/sync/estudiantes`

Sincroniza registros desde el sistema fuente de estudiantes.

### `POST /api/comunidad/sync/empleados`

Sincroniza registros desde el sistema fuente de empleados/RRHH. Los datos
de empleado son autoritativos: si una persona existe como estudiante y
como empleado, este sync sobrescribe `facultad`, `correo`, `id_carnet` y
`numero_contacto`.

## Formato del body

Acepta un registro único o un arreglo:

```json
{
  "registros": [
    {
      "numero_documento": "1234567890",
      "nombre": "Juan Pérez",
      "facultad": "Ingeniería",
      "correo": "juan.perez@uco.edu.co",
      "id_carnet": "ABC123",
      "numero_contacto": "3001234567"
    }
  ]
}
```

O con un solo registro:

```json
{
  "registro": {
    "numero_documento": "1234567890",
    "nombre": "Juan Pérez",
    "facultad": "Ingeniería",
    "correo": "juan.perez@uco.edu.co",
    "id_carnet": "ABC123",
    "numero_contacto": "3001234567"
  }
}
```

### Campos

| Campo               | Requerido | Notas                                   |
|----------------------|-----------|------------------------------------------|
| `numero_documento`   | Sí        | string                                    |
| `nombre`             | Sí        | string                                    |
| `facultad`           | No        | string, `""` si se omite                  |
| `correo`             | No        | se normaliza a minúsculas                 |
| `id_carnet`          | No        | usado para búsqueda por carnet NFC        |
| `numero_contacto`    | No        | string                                    |

**No enviar `tipo`** — cada endpoint ya determina si el origen es
estudiante o empleado.

## Respuesta

```json
{
  "ok": true,
  "message": "Sincronización de estudiantes completada",
  "data": { "sincronizados": 1, "...": "..." }
}
```

## Referencia de código

- Rutas: `src/features/comunidad/comunidad.routes.js`
- Lógica de sync: `src/features/comunidad/comunidad.service.js` (`_syncPorFuente`, `_validarRegistroSinTipo`)
- Middleware de API key: `src/shared/middlewares/apiKey.middleware.js`
