# Testing y TDD — LlaveroUCO

Análisis de exploración SDD (2026-08-23) sobre la adopción de tests automatizados en el monorepo. Cubre `LlaveroBack` y `LlaveroFront`. Estado de ejecución actualizado el 2026-08-28.

## Estado actual

Los pasos 1 a 4 de la secuencia de abajo están hechos. El backend tiene Vitest y
**139 tests en 7 archivos** bajo `LlaveroBack/tests/`, verdes tanto con
`TZ=America/Bogota` como con `TZ=UTC`.

- `vitest.config.mjs` fija `env: { TZ: 'America/Bogota' }` para que la suite no
  dependa de la zona de la máquina (el host de desarrollo está en -05, el
  contenedor en UTC). Los tests son ESM contra fuente CommonJS vía interop.
- Escribir los tests destapó un bug real de zona horaria: seis helpers de fecha
  y varios call sites leían el reloj LOCAL del proceso para razonar sobre el
  horario académico, que siempre es Bogotá. Ver la sección "Zona horaria".
- CI en `.github/workflows/ci.yml`: el backend corre en matriz `TZ`
  (`America/Bogota` y `UTC`, la zona del contenedor de despliegue) y el frontend
  hace lint + build. Siguen sin existir hooks pre-commit.
- Frontend: sigue sin runner de tests. Es el paso 6, pendiente.
- Backend: Node/CommonJS, Express 4, Knex/PostgreSQL, pnpm. Sin linter configurado.
- Frontend: React 18 + Vite 5. ESLint 8 estaba instalado pero **sin archivo de
  configuración** — `pnpm lint` fallaba con "couldn't find a configuration file",
  o sea que nunca había corrido. Ya tiene `.eslintrc.cjs`, cero errores y 27
  advertencias de `exhaustive-deps` topadas en CI con `--max-warnings`.
- El lockfile duplicado de `LlaveroFront` (pnpm + npm) se resolvió: se eliminó
  `package-lock.json` y se fijó `packageManager: pnpm@11.22.0` en ambos paquetes.

## Objetivos de mayor valor para empezar (backend)

| Objetivo | Por qué es buen punto de partida |
|---|---|
| `src/shared/utils/date.helper.js` | Funciones puras, con casos de borde de timezone/medianoche ya documentados en comentarios — alto valor, sin mocks |
| `src/shared/utils/normalize.helper.js` | Normalización de strings, funciones puras triviales de testear |
| `src/features/llaves/llave.domain.js` | Lógica de negocio pura (merge de clases consecutivas, préstamos encadenados), sin acceso a BD |
| `src/features/llaves/llave.workflows.js` | Ya usa inyección de dependencias manual (`createLlaveWorkflows(deps)`) — permite testear la orquestación NFC de préstamo/devolución con fakes, sin mockear Knex |
| `src/app.js` | La app Express se exporta sin `.listen()` (solo `src/server.js` escucha) — forma exacta que necesita `supertest` para tests de rutas/middleware sin servidor ni BD real |
| Repositorios (Knex) | Requieren BD de test real o mocking del query builder — mayor esfuerzo, prioridad baja, se deja para después |

Frontend: features bajo `src/features/*` y sus `*Api.js` son candidatos a React Testing Library + MSW, una vez exista el runner.

## Comparativa de runners

| Opción | Pros | Contras | Esfuerzo |
|---|---|---|---|
| **Vitest en ambos paquetes** | Un solo mental model, frontend lo obtiene casi gratis vía Vite ya presente, API compatible con Jest, funciona bien con CJS en backend | "Tomado prestado" en backend (no hay Vite ahí) | Bajo / Bajo-Medio |
| Jest (backend) + Vitest (frontend) | Jest es el estándar tradicional en Node/Express | Dos toolchains/configs distintas que mantener | Bajo cada uno / Medio en conjunto |
| `node:test` (backend) + Vitest (frontend) | Cero dependencia nueva en backend, combina bien con `supertest` | Ergonomía de mocking más débil, menos familiar | Bajo / Bajo |

`supertest` (backend) y `@testing-library/react` (frontend) son aditivos sin importar el runner elegido.

## Recomendación y secuencia

**Vitest en ambos paquetes** + `supertest` (backend) + React Testing Library (frontend).

1. ~~Backend — funciones puras: `date.helper.js`, `normalize.helper.js`.~~ Hecho (`fe3de8e`), 42 tests.
2. ~~Backend — `llave.domain.js` (lógica de negocio pura).~~ Hecho (`8b68107`), 40 tests.
3. ~~Backend — `llave.workflows.js` vía su seam de DI existente.~~ Hecho (`14d4f92`), 38 tests con fakes para las 19 dependencias inyectadas.
4. ~~Backend — suite smoke con `supertest` sobre `src/app.js` (health check, 404, guard de auth).~~ Hecho, 14 tests.
5. Backend — repositorios contra una base de test desechable. **Pendiente.**
6. Frontend — Vitest + RTL, empezando por un util compartido y luego una feature de alto tráfico. **Pendiente.**

Se deja fuera de este primer ciclo, por mayor esfuerzo y menor ROI inicial: tests de integración de repositorios Knex/PostgreSQL y wiring de CI.

## Zona horaria (bug encontrado al escribir los tests)

Toda la operación ocurre en hora de Bogotá (UTC-5, sin DST), pero el proceso no
corre necesariamente ahí: el contenedor de despliegue arranca en UTC. Se
encontraron y corrigieron tres capas del mismo defecto:

| Commit | Qué leía mal el reloj |
|---|---|
| `3dbaf56` | Seis helpers de `date.helper.js` y el workflow NFC usaban `getHours()`/`getDay()` — un reclamo de las 07:20 se leía como 12:20 y fabricaba 320 minutos de retraso |
| `4975abd` | Las reservas se anclaban con `new Date("2026-03-02T14:00")` sin offset, adelantándolas cinco horas y rompiendo la ventana de cancelación |
| `c38fd27` | Los filtros de reportes armaban `T00:00:00`/`T23:59:59.999` sin offset, corriendo el rango del día |

`date.helper.js` es hoy el único lugar donde un instante se traduce a
fecha/hora de negocio y viceversa:

- `fechaEnBogota(fecha)` → `"YYYY-MM-DD"`
- `horaEnBogota(fecha)` → `"HH:MM"`
- `minutosDelDiaEnBogota(fecha)` → entero
- `instanteEnBogota(fechaStr, horaStr)` → `Date | null`
- `rangoDelDiaEnBogota(fechaStr)` → `[Date, Date] | null`

**Regla**: no usar `getHours()`/`getMinutes()`/`getDay()` ni construir
`T00:00:00` a mano para lógica de horario. Hoy no queda ninguno fuera del helper.

`tests/date.helper.tz.test.js` y `tests/reserva.service.tz.test.js` fuerzan
`TZ=UTC` con `vi.stubEnv` y afirman las respuestas de Bogotá. Hacen lo contrario
que la config a propósito: fijar `TZ` hace honestos a los tests, no al código.

## Hallazgos de duplicación / simplificación (informativo, sin tocar código)

| Hallazgo | Riesgo/Nota |
|---|---|
| ~15 archivos `*Api.js` en frontend (`salonesApi.js`, `bloquesApi.js`, etc.) repiten el mismo patrón `{listar,crear,actualizar,eliminar}` + hooks TanStack Query | Medio — candidato a factory compartida `createCrudResource()` |
| `salon.repository.js` sobreescribe `create`/`update` con lógica de resolución de FK (`_resolveBloqueId`, `_resolveTipoSilleteriaId`) | Bajo por ahora — solo un archivo tiene este patrón, watch-item, no es duplicación real todavía |
| `date.helper.js` mantiene variantes paralelas string/entero-minutos por cada cálculo | No es duplicación a eliminar — es intencional (columnas int en Postgres vs strings formateados para cliente); sí duplica la superficie de tests por cálculo |
| Lockfile duplicado en `LlaveroFront` (pnpm + npm) | Afectará cualquier tooling de CI/test a nivel raíz que se añada después |

## Trabajo futuro separado

El refactor de duplicación de hooks CRUD del frontend (`createCrudResource()`) queda como **cambio SDD separado y posterior**, independiente de la introducción de testing. No se aborda en el mismo ciclo para no mezclar "añadir infraestructura de tests" con "refactorizar código existente sin cobertura previa".

## Riesgos

- Strict TDD Mode activo sin runner instalado — establecerlo debería ser su propio work unit antes de aplicar TDD a cualquier cambio funcional.
- Sin CI: una suite nueva no se hará cumplir en PRs hasta añadir un workflow aparte.
- `LlaveroBack/.codegraph/` está desactualizado/vacío, no utilizable en la sesión de exploración.
- Testing de capa de repositorio (Knex/Postgres) requiere BD de test desechable o mocking pesado — excluido deliberadamente del primer paso.

## Siguiente paso

**Frontend con Vitest + RTL** (paso 6 de la secuencia). Es lo único de riesgo
alto que queda: el backend ya tiene red y CI la ejecuta, el frontend no tiene
ninguna cobertura, y la deuda de duplicación que hay ahí (la búsqueda de persona
repetida en siete páginas) no se puede tocar sin ella.

Después, en orden: bajar las 27 advertencias de `exhaustive-deps`, y los tests
de repositorio (paso 5), que siguen requiriendo una base desechable.
