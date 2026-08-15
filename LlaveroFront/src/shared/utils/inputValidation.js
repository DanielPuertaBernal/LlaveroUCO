// Solo dígitos y letras — para documentos de identidad y carnets
export const soloAlfanumerico = (v) => v.replace(/[^a-zA-Z0-9]/g, '');

// Solo letras, espacios, tildes, ñ, diéresis y guión — para nombres de personas
export const soloNombre = (v) => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙñÑüÜ\s\-']/g, '');

// Texto general sin caracteres HTML — para motivo, materia y comentarios
export const sinHTML = (v) => v.replace(/[<>]/g, '');
