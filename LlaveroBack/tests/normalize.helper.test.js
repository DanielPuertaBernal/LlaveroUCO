import { describe, it, expect } from 'vitest';
import normalize from '../src/shared/utils/normalize.helper.js';

const {
  normalizeString,
  removeDiacritics,
  normalizeLookupKey,
  normalizeDocumento,
  normalizeCarnet,
  normalizeKey,
} = normalize;

describe('normalizeString', () => {
  it('recorta espacios', () => {
    expect(normalizeString('  hola  ')).toBe('hola');
  });

  it('convierte null y undefined en cadena vacía en vez de "null"', () => {
    expect(normalizeString(null)).toBe('');
    expect(normalizeString(undefined)).toBe('');
  });

  it('acepta números sin romperse', () => {
    expect(normalizeString(123)).toBe('123');
  });
});

describe('removeDiacritics', () => {
  it('quita tildes conservando la letra base', () => {
    expect(removeDiacritics('Muñetón')).toBe('Muneton');
    expect(removeDiacritics('José Ramírez')).toBe('Jose Ramirez');
  });

  it('deja intacto lo que no tiene diacríticos', () => {
    expect(removeDiacritics('Aula A-301')).toBe('Aula A-301');
  });
});

describe('normalizeLookupKey', () => {
  it('hace comparables dos escrituras del mismo nombre', () => {
    expect(normalizeLookupKey('MUÑETÓN')).toBe(normalizeLookupKey('muneton'));
  });
});

describe('normalizeDocumento', () => {
  // El Excel institucional entrega los documentos como números, y XLSX los
  // materializa con cola decimal ("70950450.0"). Sin recortarla, el mismo
  // documento no calza contra el que ya está en base.
  it('quita la cola decimal que deja el Excel', () => {
    expect(normalizeDocumento('70950450.0')).toBe('70950450');
    expect(normalizeDocumento('70950450.000')).toBe('70950450');
  });

  it('no toca un documento ya limpio', () => {
    expect(normalizeDocumento('70950450')).toBe('70950450');
  });

  it('no confunde un punto interno con la cola decimal', () => {
    expect(normalizeDocumento('1.234')).toBe('1.234');
  });
});

describe('normalizeCarnet', () => {
  // El ETL manda el carnet como número, así que nunca trae ceros a la
  // izquierda. Un registro cargado a mano que sí los traiga jamás calzaría
  // contra el ETL ni contra lo que lee el lector.
  it('quita los ceros a la izquierda', () => {
    expect(normalizeCarnet('000435558331')).toBe('435558331');
  });

  it('hace equivalente el carnet manual y el del ETL', () => {
    expect(normalizeCarnet('00435558331')).toBe(normalizeCarnet('435558331'));
  });

  it('conserva un cero cuando el valor era solo ceros', () => {
    expect(normalizeCarnet('0000')).toBe('0');
  });

  it('devuelve cadena vacía sin inventar un cero', () => {
    expect(normalizeCarnet('')).toBe('');
    expect(normalizeCarnet('   ')).toBe('');
  });
});

describe('normalizeKey', () => {
  it('produce una clave estable de catálogo', () => {
    expect(normalizeKey('Aire Acondicionado')).toBe('aire_acondicionado');
    expect(normalizeKey('Pared / piso / techo')).toBe('pared_piso_techo');
  });

  it('quita tildes antes de armar la clave', () => {
    expect(normalizeKey('Iluminación')).toBe('iluminacion');
  });

  it('no deja guiones bajos colgando en los extremos', () => {
    expect(normalizeKey('  ¡Ventana!  ')).toBe('ventana');
  });

  it('colapsa separadores consecutivos en uno solo', () => {
    expect(normalizeKey('Toma   ---   eléctrica')).toBe('toma_electrica');
  });

  it('devuelve cadena vacía cuando no queda nada utilizable', () => {
    expect(normalizeKey('!!!')).toBe('');
  });
});
