// Solo dígitos y letras — para documentos de identidad y carnets
export const soloAlfanumerico = (v) => v.replace(/[^a-zA-Z0-9]/g, '');

// Alfanumérico + espacio y unos pocos caracteres especiales de nombre — para
// códigos de inventario, salones y bloques (ej. "INV-M-303-001", "J-101",
// "Bloque M", "Aula 202 (Anexo)")
export const soloAlfanumericoConGuion = (v) =>
  v.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙñÑüÜ\s\-._()&]/g, '');

// Solo letras, espacios, tildes, ñ, diéresis y guión — para nombres de personas
export const soloNombre = (v) => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙñÑüÜ\s\-']/g, '');

// Texto general sin caracteres HTML — para motivo, materia y comentarios
export const sinHTML = (v) => v.replace(/[<>]/g, '');

// Solo dígitos — para documento, carnet, teléfono/contacto y otros campos numéricos
export const soloNumeros = (v) => v.replace(/\D/g, '');

// Límites de longitud usados en toda la app — mantener estos valores como única fuente
// de verdad para no repetir números mágicos por formulario.
export const LONGITUD_MAXIMA = {
  documento: 15,
  contacto: 10,
  carnet: 15,
};

// soloNumeros + tope de longitud en un solo paso, para usar directo en onChange.
export const soloNumerosConTope = (v, tope) => soloNumeros(v).slice(0, tope);

// Formato de correo razonable para validar en submit (no exhaustivo RFC 5322, suficiente para UX).
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const esCorreoValido = (v) => REGEX_CORREO.test(String(v || '').trim());
