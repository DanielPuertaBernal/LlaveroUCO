import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Solo tests propios: `include` por defecto barrería node_modules.
    include: ['tests/**/*.test.js'],
    // Los tests de esta primera tanda son de funciones puras y no tocan la
    // base. Cuando entren los de repositorio harán falta hooks de setup.
    globals: false,
    // El dominio de llaves razona en hora de Bogotá y varios helpers leen la
    // hora LOCAL del proceso. Sin fijar TZ, la suite pasa en la máquina del
    // desarrollador (-05) y falla en el contenedor/CI (UTC).
    env: { TZ: 'America/Bogota' },
  },
});
