import { defineConfig } from 'vitest/config';

// Testes de lógica pura rodam em node; os de componente declaram `// @vitest-environment jsdom`
// no topo do arquivo (.test.tsx), para não pagar o DOM onde não precisa.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
