/**
 * ESLint 8 (formato eslintrc). El paquete es `"type": "module"`, así que este
 * archivo debe ser `.cjs` para que ESLint pueda cargarlo con `require`.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    // El proyecto usa el runtime automático de JSX: no hace falta importar React.
    'react/react-in-jsx-scope': 'off',
    // Los componentes no declaran propTypes; el contrato vive en Zod y en el uso.
    'react/prop-types': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
