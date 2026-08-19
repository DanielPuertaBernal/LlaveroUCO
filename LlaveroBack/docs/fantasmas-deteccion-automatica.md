# Detección automática de grupos fantasma desde la programación

## Proceso de investigación

1. Se revisó la columna `OBSERVACIONES` de la hoja `DATOS TABLA` del Excel de programación (`PROGRAMACION 02-2026 - 04-08-2026 (1).xls`).
2. De 2164 filas, **107** tienen algo escrito en `OBSERVACIONES`. De esas, **34** siguen un patrón de código de materia (`^[A-Z]{2,4}\d{3,4}(\s*-\s*G\d+)?$`, ej. `ZOD0233`, `CNB0143 - G1`); las otras 73 son notas operativas de texto libre (`MOVILIDAD`, `VIRTUAL`, `CUADRAN HORA 9:30`, etc.) que **no** se tocan en este proceso.
3. Se verificaron dos casos contra el resto del archivo:

### Caso `ZOD0233`

Filas con `OBSERVACIONES = "ZOD0233"`:

| materia | MATERIA | grupo | día | aula | horario | TOTAL CORREGIDO |
|---|---|---|---|---|---|---|
| ANB0223 | BOTANICA GENERAL | 1 | MIERCOLES | BOTANICA | 14:00-16:00 | 12 |
| AFB0142 | MATEMÁTICAS I | 4 | MIERCOLES | BOTANICA | 14:00-16:00 | 0 |
| ANB0223 | BOTANICA GENERAL | 1 | MIERCOLES | BOTANICA | 16:00-18:00 | 0 |
| ACP0916 | PRACTICA | 1 | MIERCOLES | BOTANICA | 16:00-18:00 | 21 |

`materia = ZOD0233` existe aparte en el archivo: "BOTÁNICA GENERAL" grupo 1, con sesiones reales (J7 14-16h y BOTANICA 16-18h, `TOTAL CORREGIDO = 12` en ambas).

### Caso `CNB0143 - G1`

9 filas con esa observación (materias distintas: CNB0141, TBE0811, CAB0436, SEB0133, ISS0266, PSP0915). `materia = CNB0143` grupo `1` existe aparte como "BIOLOGIA" con salón real (M-310) y `TOTAL CORREGIDO = 15`.

## Contradicción encontrada — necesito resolverla antes de implementar

El sistema ya tiene un concepto de "fantasma" (`programaciones_fantasma`, flujo manual `vincularFantasma`/`validarFantasma` en `programacion.service.js`). Su regla actual (`validarFantasma`, condición 1) dice: **un grupo NO puede marcarse como fantasma si ya tiene un aula asignada** — porque un fantasma es, por definición, un duplicado administrativo sin espacio físico propio (sus estudiantes ya se cuentan en el grupo "principal").

Pero en el caso `ZOD0233`, la fila `ANB0223` (que trae la observación) **sí tiene aula (`BOTANICA`) y sí tiene estudiantes reales (`TOTAL CORREGIDO = 12`)** — no es un duplicado sin salón, es una clase que aparenta ocupar un salón real, en el mismo horario que `ZOD0233`.

Esto no encaja con "estos registros son fantasmas de esta materia" en el sentido que ya maneja el sistema (duplicado sin salón, se fusiona su conteo de estudiantes en el principal). Podría significar algo distinto: por ejemplo, que varias materias **comparten/rotan la misma sesión de laboratorio** (`BOTANICA`) al mismo tiempo, y `OBSERVACIONES` referencia el "ancla" del bloque compartido — no necesariamente que esas materias no cuenten como ocupación real del aula.

## Pregunta abierta — resuelta

¿"Fantasma" acá significa lo mismo que ya maneja el sistema (el grupo referenciado en `OBSERVACIONES` absorbe el conteo de estudiantes y las filas anotadas NO deberían contar como ocupación propia de aula), o es un concepto distinto (ej. "comparten laboratorio/sesión con")? **Respuesta del usuario: sí, es un duplicado administrativo** — se implementó bajo esa definición.

## Implementación

`programacion.service.js`:

- `_limpiarProgramacion` ahora mapea la columna `OBSERVACIONES`/`Observaciones`/`observaciones` del Excel al campo `observaciones` (antes no se leía en absoluto durante el import).
- `_detectarFantasmas(consolidados)` corre después de `_unificarHorarios`, antes de resolver FKs y de `bulkInsert`. Muta las filas detectadas: les pone `tipo = 'fantasma'` y `fantasma_de_codigo_materia = <código destino>`.
- `programacion.repository.js:bulkInsert` ahora respeta `r.tipo` en vez de forzar siempre `'regular'`, e inserta en `programaciones_fantasma` (con `fantasma_de_codigo_materia`) para las filas marcadas.
- Como el informe de ocupación (`findParaOcupacion`) ya excluye `tipo='fantasma'`, estas filas dejan de contar como horas de aula ocupada automáticamente — no hizo falta tocar esa parte.
- **Fuera de alcance a propósito**: no se suman los estudiantes de la fila fantasma al registro principal (eso sí lo hace el flujo manual existente, `vincularFantasma`, para quien lo necesite puntualmente). Esta detección automática solo clasifica `tipo`/`fantasma_de_codigo_materia`.

## Formato que reconoce el detector

Regex: `^([A-Z]{2,4}\d{3,4})(?:\s*-\s*G(\d+))?$` (insensible a mayúsculas), aplicado al valor de `OBSERVACIONES` ya recortado (trim).

| Patrón | Significado | Ejemplo real |
|---|---|---|
| `CODIGO` (solo el código de materia) | Fantasma de esa materia. Si esa materia tiene **un único grupo** en el archivo, se usa ese grupo automáticamente. Si tiene **más de un grupo posible**, queda ambiguo y la fila se deja sin tocar (no se adivina). | `ZOD0233` |
| `CODIGO - G<n>` (código + grupo explícito, con o sin espacios alrededor del guion) | Fantasma de esa materia, grupo `<n>` exacto — nunca ambiguo. | `CNB0143 - G1` |

Reglas de validación (ninguna se aplica a ciegas — todas verifican contra el resto del archivo antes de marcar algo):

1. El código extraído debe existir como `codigo_materia` real en el mismo lote de importación. Si no existe, la fila se deja como está (no es una referencia de fantasma real, o es un typo).
2. Si no trae `-G<n>` y la materia destino tiene más de un grupo, se registra un `logger.warn('Observación de fantasma ambigua...')` con el detalle y la fila queda intacta — requiere vínculo manual vía la UI existente (`vincularFantasma`) si corresponde.
3. Una fila nunca se auto-referencia (si el código+grupo resuelto es ella misma, se ignora).
4. Cualquier otro valor de `OBSERVACIONES` que no matchee el regex (texto libre: `MOVILIDAD`, `VIRTUAL`, `SALA DE REUNIONES`, `CUADRAN HORA 9:30`, etc.) se ignora por completo — no se toca tipo/clasificación de esas filas.

### Verificación contra el archivo real (`PROGRAMACION 02-2026 - 04-08-2026 (1).xls`)

- **31** filas detectadas y marcadas como fantasma.
- **3** ambiguas, dejadas intactas: `DLB0102` (grupos 1,2,3,4,5,6 posibles) y `ISO0916` x2 (grupos 1,2,3 posibles).
- **0** filas cuyo código no resuelve a ninguna materia real del archivo.
