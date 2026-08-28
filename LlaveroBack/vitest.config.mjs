import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Solo tests propios: `include` por defecto barrería node_modules.
    include: ['tests/**/*.test.js'],
    // Los tests de esta primera tanda son de funciones puras y no tocan la
    // base. Cuando entren los de repositorio harán falta hooks de setup.
    globals: false,
  },
});
