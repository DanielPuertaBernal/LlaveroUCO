# Testing y TDD — LlaveroUCO

Análisis de exploración SDD (2026-08-23) sobre la adopción de tests automatizados en el monorepo. Cubre `LlaveroBack` y `LlaveroFront`.

## Estado actual

- Cero infraestructura de tests en ambos paquetes: sin `test` script, sin dependencias de testing, sin ficheros `*.test.*`/`*.spec.*` en código propio.
- Sin CI (`.github/workflows` no existe) y sin hooks pre-commit (solo los `.sample` por defecto de git).
- Backend: Node/CommonJS, Express 4, Knex/PostgreSQL, pnpm. Sin linter configurado.
- Frontend: React 18 + Vite 5, ESLint 8 ya configurado. Lockfile duplicado (`pnpm-lock.yaml` + `package-lock.json`, deuda no relacionada con testing).
- El modo Strict TDD está activo a nivel de usuario, pero no hay runner instalado en ningún paquete — hoy no se puede aplicar TDD real a ningún cambio.

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

1. Backend — funciones puras: `date.helper.js`, `normalize.helper.js`.
2. Backend — `llave.domain.js` (lógica de negocio pura).
3. Backend — `llave.workflows.js` vía su seam de DI existente.
4. Backend — suite smoke con `supertest` sobre `src/app.js` (health check, 404, guard de auth).
5. Frontend — Vitest + RTL, empezando por un util compartido y luego una feature de alto tráfico.

Se deja fuera de este primer ciclo, por mayor esfuerzo y menor ROI inicial: tests de integración de repositorios Knex/PostgreSQL y wiring de CI.

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

`sdd-propose` para el cambio: añadir Vitest a ambos paquetes, `supertest`/RTL, y primera suite de tests unitarios (`date.helper.js`, `normalize.helper.js`, `llave.domain.js`).
