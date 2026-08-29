# Pendientes

Estado al 2026-08-28, `main` en `da955f1`. Cada item de acá fue verificado
contra el código en esa fecha, no heredado de un documento anterior — el
análisis en `analisis/` se había desactualizado y afirmaba cosas que ya no eran
ciertas. Si algo de esta lista se resuelve, moverlo a
[`analisis/deuda-tecnica.md`](./analisis/deuda-tecnica.md) §Resuelto.

## Riesgo alto

### 1. El frontend no tiene un solo test

`LlaveroFront` no tiene runner, ni configuración de tests, ni un solo archivo
`*.test.*`. El backend tiene 139 tests corriendo en CI; el frontend, nada.

Esto bloquea todo lo demás de esta lista que toque el front. Refactorizar siete
páginas sin cobertura es exactamente el error que el resto del documento intenta
evitar.

**Camino**: Vitest + React Testing Library. Vite ya está, así que Vitest entra
casi gratis. Empezar por un util compartido (sin renderizado, sin mocks) y
después una feature de alto tráfico. Ver la secuencia en
[`analisis/testing-tdd.md`](./analisis/testing-tdd.md).

## Riesgo medio

### 2. Búsqueda de persona duplicada en siete páginas

El mismo lookup por documento/carnet está copiado, con **orden de resolución
distinto en cada copia**, en:

`PrestamosPage`, `MonitoresPage`, `ReservasPage`, `ReservasSemestralesPage`,
`ProgramacionPage`, `HistorialPage`, `ComunidadPage`.

Esa divergencia ya produjo un bug: buscar por documento antes que por carnet
devolvía la persona equivocada. Siete copias son siete oportunidades de que
vuelva a pasar.

**Depende del punto 1.** No tocar antes.

### 3. Solapamiento de horarios calculado en tres lugares

`reserva.service.js`, `reservas_semestrales.service.js` y
`notificacion.scheduler.js` resuelven el mismo problema por separado.

Es el mismo patrón que causó el bug de zona horaria que se arregló en esta
tanda: conocimiento copiado en vez de nombrado. Cuando la respuesta vive en
comentarios duplicados y no en una función con nombre, el próximo que escribe
código no la encuentra — y no la encontró.

### 4. Los 20 módulos `*Api.js` del front repiten el mismo patrón

Veinte archivos bajo `LlaveroFront/src/features/*/` repiten
`{listar, crear, actualizar, eliminar}` más sus hooks de TanStack Query.
Candidato a una factory `createCrudResource()`.

**Depende del punto 1.**

### 5. Bypass de capas entre repositorios

Varios repositorios consultan tablas de otros features en vez de pasar por el
repositorio dueño. Detalle en `analisis/backend/llaves.md` §7 y
`analisis/backend/reservas_semestrales.md` §6.

### 6. Veintisiete advertencias de `exhaustive-deps`

Están topadas en CI con `pnpm lint --max-warnings 27`, así que no pueden crecer.
Son efectos que necesitan pensarse de a uno, no un `// eslint-disable` masivo.

**Ese número baja, nunca sube.**

## Riesgo bajo

### 7. `validarOperacion` es código muerto que aparenta ser un gate de autorización

`ubicacion.service.js:126`. Verificado: la única otra mención en todo el
backend es un comentario en `llave.service.js:64` que describe la validación
anterior. Nadie la llama.

Un método muerto con nombre de control de acceso es peor que no tenerlo — el
próximo que lea el archivo va a asumir que algo está protegido.

### 8. Columnas sin flujo que las maneje

- `novedades.prestamo_id`: verificado, solo aparece en un comentario de
  `novedad.repository.js:37`. Ningún código la lee ni la escribe.
- `notificaciones.notificacion_admin_enviada`: está en la lista blanca de
  columnas actualizables de `novedad.repository.js:71`, o sea que es escribible
  por la vía genérica de update, pero ningún flujo la maneja de verdad.

### 9. `configuracion_bloques` sin CHECK en base

El tope de `max(1440)` minutos vive solo en Zod. Un seed o un script que escriba
directo puede dejar valores fuera de rango.

### 10. Solo se puede reportar una novedad sobre una llave con préstamo activo

Una llave rota que está en el tablero no tiene dónde engancharse.

### 11. Tests de repositorio

Requieren una base de datos desechable o mocking pesado del query builder.
Excluidos a propósito del ciclo de testing actual por ROI. Van después del
frontend.

### 12. Sin hooks pre-commit

CI ya corre en cada push y PR, así que esto es comodidad, no protección: acorta
el ciclo de feedback pero no cambia lo que llega a `main`.

## Entorno

### 13. `LlaveroFront/dist/` es propiedad de root

Sobra de un build de Docker que escribió en el bind mount. `pnpm build` local
falla al intentar limpiarlo:

```
EACCES: permission denied, rmdir '.../LlaveroFront/dist/assets'
```

El build en sí compila bien (verificado con `--outDir` a otra ruta, 3291
módulos). CI no lo sufre porque hace checkout limpio.

```bash
sudo rm -rf LlaveroFront/dist
```

### 14. El bundle del front pasa los 2.5 MB

`index-*.js` sale en 2,526 kB (631 kB gzip) y Vite avisa en cada build.
Candidatos a `import()` dinámico: `xlsx` (429 kB) y `jspdf`, que solo se usan en
exportaciones.
