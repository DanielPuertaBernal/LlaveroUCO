# Carga inicial de bloques y salones

Carga inicial del catálogo de `bloques`, `tipos_silleteria` y `salones` (tablas previamente vacías). Los rangos y capacidades vienen de la información suministrada directamente por el usuario (administración de espacios físicos).

## Resumen

| Bloque | Rango de salones | Cantidad | Capacidad | Tipo de silletería |
|---|---|---|---|---|
| M | 202–211, 301–310, 401–410 (prefijo `M`) | 30 | 30 | De Mesas |
| COLEGIO | 105, 201–206+208–209, 301–306+308–309, 401–405+408–409 (prefijo `CO`) | 24 | 40 | Silla Universitaria |
| J | J1–J5, J7–J15 (sin J6, reservado como Centro de Simulación), JPROY | 15 | 40 | Silla Universitaria |
| I | I1 | 1 | 30 | De Mesas |
| D | D1–D4 | 4 | 25 | Silla Universitaria |
| E | E1–E4 | 4 | 15 | Silla Universitaria |

**Total: 6 bloques, 2 tipos de silletería, 78 salones.**

Notas:
- Bloque COLEGIO y M no incluyen el salón `X07`/`X07` de cada piso en algunos casos según lo indicado (ej. COLEGIO salta 207, 307, 406, 407) — se respetó tal cual el rango dado.
- `J6` no se incluyó en este lote (es un caso especial, "Centro de Simulación", fuera del patrón genérico de silletería universitaria).
- Los nombres de salón no llevan guion (`M202`, no `M-202`), siguiendo la misma convención de normalización que usa el importador de programación (`aula.replace(/-/g, '')`).

## Segunda carga: aulas especiales/laboratorios sin match en la carga inicial

Tras la carga inicial, 29 aulas presentes en `programaciones.aula` no tenían `salon_id` resuelto porque el catálogo `salones` estaba vacío al momento de importar la programación (ver sección de backfill más abajo). El usuario fue confirmando bloque para cada una; capacidad y tipo de silletería quedan **`NULL`, pendientes de confirmar** — se cargó así a propósito para no bloquear el resto con datos inventados.

| Aula (`salones.nombre_salon`) | Bloque | Nota |
|---|---|---|
| ANATOMIA | EDC *(bloque nuevo, "Edificio de Ciencia")* | |
| BOTANICA | EDC | |
| COMPU L2 | EDC | |
| CONTROL | EDC | |
| DISEÑO A | EDC | Alias: la variante `DISEÑO.A` en `programaciones.aula` también enlaza a este mismo salón |
| EDC | EDC | Salón genérico llamado igual que el bloque |
| FISICA | EDC | |
| REDES | EDC | |
| CPA | BLOQUE E | |
| LAB.PROD | BLOQUE E | |
| LP_TALLE | BLOQUE E | |
| P1 INNOVA | INNOVAMATER *(bloque nuevo)* | Alias: la variante `P1 INNOV` también enlaza a este mismo salón |
| P.BVC | INNOVAMATER | |
| MULTIMED | BLOQUE M | |
| FRANCISC | COLEGIO | |
| *(sin salón nuevo)* | — | `JPRO` en `programaciones.aula` es el mismo salón físico que `JPROY` (ya cargado en la primera vuelta) — solo se vinculó `salon_id`, no se creó un salón nuevo |

**Resultado**: 2 bloques nuevos (EDC, INNOVAMATER), 15 salones nuevos, 139 filas de `programaciones` vinculadas (111 por coincidencia directa de nombre + 28 por los 3 alias de escritura). Cobertura total de `salon_id` en `programaciones`: 1178 de 1597 filas (antes de esta carga: 1039).

**Sigue sin bloque asignado** (no forman parte de ningún catálogo cargado todavía): `AUDITORIO`, `COMUNICA`, `CONSULT`, `HIDRAULI`, `LAB L1`, `LABORATORIO`, `MICO`. Además `NO REQUIERE AULA` y `PENDIENTE` son placeholders del Excel de programación, no salones físicos — quedan fuera del catálogo salvo que se indique lo contrario.

### SQL ejecutado (segunda carga)

```sql
-- Bloques nuevos
INSERT INTO bloques (id, nombre_bloque) VALUES
  ('01a017b7-a386-7cd4-aa8b-109d73979bb3', 'EDC'),
  ('01a017b7-a387-7c3b-84eb-a21b8a5c0086', 'INNOVAMATER');

-- Salones nuevos (capacidad_estudiantes y tipo_silleteria_id quedan NULL, pendientes de confirmar)
INSERT INTO salones (id, nombre_salon, bloque_id, capacidad_estudiantes, tipo_silleteria_id) VALUES
  ('01a017b7-a387-7c3b-84eb-a21c265a8e4d', 'ANATOMIA', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a21db13e1595', 'BOTANICA', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a21e69561ed8', 'COMPU L2', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a21f92213bcf', 'CONTROL', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a2209ba0313d', 'DISEÑO A', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a221f40f3ab0', 'EDC', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a222a82bbd38', 'FISICA', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a223d3f07131', 'REDES', '01a017b7-a386-7cd4-aa8b-109d73979bb3', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a22428f7844f', 'CPA', '01a017a9-bfc9-7324-b348-ee7349e4efe7', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a22562f01a7c', 'LAB.PROD', '01a017a9-bfc9-7324-b348-ee7349e4efe7', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a22642382875', 'LP_TALLE', '01a017a9-bfc9-7324-b348-ee7349e4efe7', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a227cd9d4e17', 'P1 INNOVA', '01a017b7-a387-7c3b-84eb-a21b8a5c0086', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a228ff8a9e6c', 'P.BVC', '01a017b7-a387-7c3b-84eb-a21b8a5c0086', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a229c5889463', 'MULTIMED', '01a017a9-bfc8-7fe3-bca3-748370858bd7', NULL, NULL),
  ('01a017b7-a387-7c3b-84eb-a22a80652d5a', 'FRANCISC', '01a017a9-bfc8-7fe3-bca3-74a20732b141', NULL, NULL);

-- Backfill de programaciones.salon_id (match directo por nombre de aula)
UPDATE programaciones p SET salon_id = s.id FROM salones s WHERE s.nombre_salon = p.aula AND p.salon_id IS NULL AND p.deleted_at IS NULL AND s.deleted_at IS NULL;

-- Backfill de programaciones.salon_id por alias de escritura (mismo salón físico, distinto texto en el Excel)
UPDATE programaciones SET salon_id = (SELECT id FROM salones WHERE nombre_salon = 'DISEÑO A' AND deleted_at IS NULL) WHERE aula = 'DISEÑO.A' AND salon_id IS NULL AND deleted_at IS NULL;
UPDATE programaciones SET salon_id = (SELECT id FROM salones WHERE nombre_salon = 'P1 INNOVA' AND deleted_at IS NULL) WHERE aula = 'P1 INNOV' AND salon_id IS NULL AND deleted_at IS NULL;
UPDATE programaciones SET salon_id = (SELECT id FROM salones WHERE nombre_salon = 'JPROY' AND deleted_at IS NULL) WHERE aula = 'JPRO' AND salon_id IS NULL AND deleted_at IS NULL;
```

## SQL ejecutado

```sql
-- Tipos de silletería
INSERT INTO tipos_silleteria (id, nombre) VALUES
  ('01a017a9-bf95-78b3-9404-78eaad31587e', 'De Mesas'),
  ('01a017a9-bfc5-7f81-a10e-edf5f9d0b220', 'Silla Universitaria');

-- Bloques
INSERT INTO bloques (id, nombre_bloque) VALUES
  ('01a017a9-bfc8-7fe3-bca3-748370858bd7', 'M'),
  ('01a017a9-bfc8-7fe3-bca3-74a20732b141', 'COLEGIO'),
  ('01a017a9-bfc9-7324-b348-ee5cace6bdb8', 'J'),
  ('01a017a9-bfc9-7324-b348-ee6c1e5c0f6b', 'I'),
  ('01a017a9-bfc9-7324-b348-ee6eb0f6bd6e', 'D'),
  ('01a017a9-bfc9-7324-b348-ee7349e4efe7', 'E');

-- Salones
INSERT INTO salones (id, nombre_salon, bloque_id, capacidad_estudiantes, tipo_silleteria_id) VALUES
  ('01a017a9-bfc8-7fe3-bca3-74844faeae7c', 'M202', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-7485f1bd6c24', 'M203', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-7486e9103c50', 'M204', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-74877d983d46', 'M205', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-7488fe0c1612', 'M206', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-748924ada08f', 'M207', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-748ae320fd82', 'M208', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-748b9b2c9c3c', 'M209', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-748c9cb3dd35', 'M210', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-748d4e898f00', 'M211', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-748e3021d4a9', 'M301', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-748f2b4336e9', 'M302', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-74903390a492', 'M303', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-7491592229c0', 'M304', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749273e7ae92', 'M305', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749349b952fe', 'M306', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749480d64afa', 'M307', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-7495f304645b', 'M308', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-74960613f005', 'M309', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-7497df52d898', 'M310', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-7498abbcdf42', 'M401', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-74990a03bfa8', 'M402', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749abebd7845', 'M403', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749b56bd5fe3', 'M404', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749c4bd0a5e1', 'M405', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749db3cdaafd', 'M406', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749ee02e9609', 'M407', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-749fe17f11b9', 'M408', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-74a0b61d5a9c', 'M409', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-74a1ab8bf03c', 'M410', '01a017a9-bfc8-7fe3-bca3-748370858bd7', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc8-7fe3-bca3-74a325f5a519', 'CO105', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74a433d9227c', 'CO201', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74a519f200b8', 'CO202', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74a6b2bb4453', 'CO203', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74a74b43d152', 'CO204', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74a8d0566d71', 'CO205', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74a94e925696', 'CO206', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74aaffffa019', 'CO208', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74ab7f197ccf', 'CO209', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74acf4941a7a', 'CO301', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74ad5bac0e60', 'CO302', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74aedf2ff614', 'CO303', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74af452d4b4d', 'CO304', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74b0e1072a97', 'CO305', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74b16aa12ed3', 'CO306', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74b246ac18f7', 'CO308', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc8-7fe3-bca3-74b3e2f3defc', 'CO309', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee5549077d98', 'CO401', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee56b58892c6', 'CO402', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee57f8e49e17', 'CO403', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee586cc59e84', 'CO404', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee59140494e3', 'CO405', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee5a97922c24', 'CO408', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee5ba6b98d84', 'CO409', '01a017a9-bfc8-7fe3-bca3-74a20732b141', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee5dae376256', 'J1', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee5eeaf7f66d', 'J2', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee5f14969196', 'J3', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee609c990531', 'J4', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee616db07dc5', 'J5', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee62cbba9dd2', 'J7', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee63785a437a', 'J8', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee646b073de1', 'J9', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee6576d859a7', 'J10', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee66378be448', 'J11', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee67bb6c6134', 'J12', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee686ff22652', 'J13', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee69dc5dc5fd', 'J14', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee6a6f1405c3', 'J15', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee6b8caa7f06', 'JPROY', '01a017a9-bfc9-7324-b348-ee5cace6bdb8', 40, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee6d8f42ab69', 'I1', '01a017a9-bfc9-7324-b348-ee6c1e5c0f6b', 30, '01a017a9-bf95-78b3-9404-78eaad31587e'),
  ('01a017a9-bfc9-7324-b348-ee6f5675a166', 'D1', '01a017a9-bfc9-7324-b348-ee6eb0f6bd6e', 25, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee70814b2603', 'D2', '01a017a9-bfc9-7324-b348-ee6eb0f6bd6e', 25, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee71544dbdf2', 'D3', '01a017a9-bfc9-7324-b348-ee6eb0f6bd6e', 25, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee727cd07298', 'D4', '01a017a9-bfc9-7324-b348-ee6eb0f6bd6e', 25, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee74981ca28c', 'E1', '01a017a9-bfc9-7324-b348-ee7349e4efe7', 15, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee757623cd3e', 'E2', '01a017a9-bfc9-7324-b348-ee7349e4efe7', 15, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee7649fd30fd', 'E3', '01a017a9-bfc9-7324-b348-ee7349e4efe7', 15, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220'),
  ('01a017a9-bfc9-7324-b348-ee776dfe1b50', 'E4', '01a017a9-bfc9-7324-b348-ee7349e4efe7', 15, '01a017a9-bfc5-7f81-a10e-edf5f9d0b220');
```
