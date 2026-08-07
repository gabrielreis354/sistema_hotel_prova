import { defineConfig } from 'vitest/config';

// Testes de lógica pura do app (filtros, mapeamentos). Ambiente node — testes de componente
// com DOM entram depois com jsdom, quando houver o primeiro caso que justifique.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
