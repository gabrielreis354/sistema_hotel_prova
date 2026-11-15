import { defineConfig } from 'vitest/config';

// Testes de lógica pura do app (filtros, mapeamentos). Ambiente node — testes de componente
// com DOM entram depois com jsdom, quando houver o primeiro caso que justifique. Os `.test.tsx`
// renderizam em HTML (react-dom/server), sem DOM, para provar o que a tela mostra (T-09.1).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'vite.config.test.ts'],
  },
});
