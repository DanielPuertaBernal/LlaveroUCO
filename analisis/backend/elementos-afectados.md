# Módulo `elementos-afectados`

## 1. Propósito

Catálogo administrable de lo que puede dañarse en un aula: silla, ventana, puerta, tablero, proyector, aire acondicionado. Alimenta [`novedades`](./novedades.md), que hasta la migración 023 solo podía registrar **que** algo se dañó, no **qué**.

El problema que resuelve: el elemento afectado vivía en `novedades.descripcion`, un `varchar(500)` libre. "silla rota", "silla dañada" y "se partió una silla" eran tres valores distintos para la base, así que `/novedades/estadisticas` podía agrupar por estado y categoría y nada más. No había forma de contar cuántas ventanas rotas hay en un bloque ni de priorizar mantenimiento por tipo de elemento.

## 2. Modelo de datos

Tabla `elementos_afectados` (migración `023_elementos_afectados.js`).

| Columna | Tipo | Detalle |
|---|---|---|
| `id`, `created_at`, `updated_at`, `deleted_at` | — | columnas universales |
| `clave` | text NOT NULL | CHECK `clave = lower(clave)`; único entre los no borrados |
| `nombre` | text NOT NULL | lo que se muestra |
| `descripcion` | text | |
| `activo` | bool NOT NULL | default `true` |
| `orden` | int NOT NULL | default `0` |

En `novedades`, la 023 agrega `elemento_afectado_id` (FK, nullable) y `cantidad_afectada` (int NOT NULL, default 1, CHECK `> 0`).

`elemento_afectado_id` es nullable a propósito: las novedades anteriores a la migración no tienen elemento, y categorías como `demora_entrega` o `perdida` no lo necesitan.

**Catálogo y no enum**: un CHECK con valores fijos habría exigido migración y deploy para agregar "persiana". El catálogo lo resuelve con un alta desde la UI.

**`orden` en vez de alfabético**: el Select del formulario de novedades ordena por `orden`, para que lo más reportado quede arriba. La semilla numera de 10 en 10 y deja "Otro" en 999; lo que se crea desde la UI entra en 1000.

## 3. Semilla

`elementoAfectado.service.js` siembra el catálogo al arrancar desde `server.js`, con el mismo patrón memoizado de `ubicacion.service.js`: una promesa guardada evita reseeds concurrentes, y se limpia si falla para poder reintentar.

Son 14 elementos iniciales, no una lista cerrada — la idea es que mantenimiento agregue lo que falte.

## 4. API

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/elementos-afectados` | autenticado; `?incluir_inactivos=true` solo admin |
| `POST` | `/api/elementos-afectados` | admin |
| `PATCH` | `/api/elementos-afectados/:id` | admin |
| `DELETE` | `/api/elementos-afectados/:id` | admin |

`resolverId(idOClave)` acepta el uuid o la clave, para que el cliente no tenga que hacer un lookup previo. El filtro de listado de novedades usa la **clave**, no el id: es estable y legible en la URL.

## 5. Puntos de inflexión

- **Las estadísticas suman `cantidad_afectada`, no cuentan filas.** Un reporte de "3 sillas rotas" es una novedad pero tres sillas. Contar filas le diría a mantenimiento que pida una silla.
- **Borrar está bloqueado por la base.** `elementos_afectados` tiene `trg_block_soft_delete` contra `novedades.elemento_afectado_id`: si alguna novedad lo referencia, el borrado falla. El camino correcto es `activo = false` — deja de aparecer en el formulario y el histórico sigue resolviendo el nombre.
- **`clave` mutable vía PATCH**: se usa como filtro de API. Renombrarla rompe los enlaces guardados sin que nada lo detecte.

## 6. Riesgos y observaciones

- **Sin tests.**
- **No hay ABM de `orden` en la UI**: se puede editar por API pero la hoja de administración no lo expone; los elementos nuevos se apilan al final.
- **La UI del catálogo vive dentro de la página de novedades**, no como sección propia. Es coherente con dónde se usa, pero no sigue el patrón de los otros catálogos.
