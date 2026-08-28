# Feature `ocupacion`

## 1. Propósito

Dashboard de ocupación de aulas: cuánto se usa cada salón, por jornada, día, facultad y bloque, sobre la programación académica real más las reservas semestrales activas.

Reemplazó un cálculo cliente-side que exigía subir un Excel a mano. Los datos ya viven en `programaciones`; el endpoint `GET /api/programacion/ocupacion` los agrega y el front solo filtra y presenta.

## 2. Origen de los datos

`programacion.service.js:obtenerOcupacion(semestre)` recorre las franjas y devuelve, por aula:

| Campo | Contenido |
|---|---|
| `diurna` / `nocturna` | horas ocupadas por día de la semana |
| `est_diurna` / `est_nocturna` | estudiantes por día |
| `horasPorFacultad` | horas acumuladas por facultad |
| `porFacultad` | las mismas horas, desglosadas por jornada |
| `bloque` | bloque del aula |

Además arma un listado de `docentes` con su carga semanal, aulas, materias y franjas.

Se excluyen las programaciones `fantasma` (grupos virtuales sin salón) y las semestrales canceladas. El domingo no tiene servicio y queda fuera del cálculo.

**Corte de jornada**: una franja es nocturna si empieza a las 18:00 o después, salvo el sábado, que se cuenta entero como diurno.

## 3. Capacidad semanal

```
HOURS_DIURNA_MF   = 11    →  WEEKLY_DIURNA   = 11×5 + 11 = 66 h/aula
HOURS_NOCTURNA_MF = 4     →  WEEKLY_NOCTURNA = 4×5       = 20 h/aula
                             TOTAL_WEEKLY_HOURS          = 86 h/aula
```

Diurna 7:00-18:00 de lunes a sábado; nocturna 18:00-22:00 de lunes a viernes.

## 4. El KPI global y sus dos lecturas

Este es el punto de inflexión del feature. **Las jornadas no comparten denominador**: la diurna tiene más del triple de horas disponibles. Así que "cuánto del global es diurna" tiene dos respuestas distintas y sirven para cosas distintas.

| Métrica | Contra qué mide | ¿Suma el global? |
|---|---|---|
| `tasaDiurna` / `tasaNocturna` | cada jornada contra su propia capacidad (66 h / 20 h) | **No** |
| `aporteDiurna` / `aporteNocturna` | ambas contra las mismas 86 h | **Sí** |

```
global           67.44 %
tasa   diurna    60.61 %   nocturna 90.00 %   ← no suman
aporte diurna    46.51 %   nocturna 20.93 %   ← suman el global
```

Mostrar solo el aporte induce a error: una nocturna al 90 % de capacidad aporta pocos puntos simplemente porque abarca menos horas, y leer eso como "la nocturna casi no pesa" esconde una jornada sin lugar disponible. La UI muestra las dos lecturas a la vez.

## 5. Filtros y alcance

Facultad y bloque son filtros globales: afectan la matriz, el análisis, la carga docente y el KPI. Al filtrar por facultad, `horasDiurna`/`horasNocturna` leen de `porFacultad[facultad]` en vez del total del aula — la tabla muestra solo lo que esa facultad ocupa, no lo que ocupa el salón entero.

La selección de aulas dentro de la pestaña Matriz **no** altera el KPI global.

## 6. Vistas

- **Matriz**: heatmap aula × día. Umbrales ≤ 40 % verde, 40-75 % ámbar, > 75 % rojo.
- **Análisis**: top de aulas más ocupadas, promedio por bloque y horas por facultad, todo sobre el conjunto ya filtrado.
- **Carga docente**: horas semanales, materias, aulas y facultades por docente, con paginación y búsqueda.
- **Detalle de aula**: reparto por facultad y franjas.

Los docentes se agrupan por una clave que ignora el orden de las palabras del nombre: la programación regular y las reservas semestrales vienen de Excels distintos que no siguen el mismo orden "APELLIDOS NOMBRES", y agrupar por el string exacto partía al mismo docente en dos filas.

## 7. Export

Excel con una hoja por vista: `Ocupacion`, `Por Jornada` (horas ocupadas, horas posibles, % ocupación y % del global), `Por Facultad`, `Por Bloque` y `Docencia`. Las listas del export son completas, no el top 8 que muestran los gráficos.

## 8. Riesgos y observaciones

- **Las horas de jornada son constantes del front**, no configuración: cambiar el horario de servicio exige tocar código, aunque los umbrales de mora sí son configurables por bloque.
- **Sin tests**, incluido el cálculo de porcentajes.
- **El corte de jornada está duplicado**: el backend decide `esNocturna` al agregar y el front redefine las capacidades semanales. Si uno cambia sin el otro, los porcentajes quedan mal sin que nada falle.
