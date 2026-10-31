import { defineConfig } from 'vitest/config';

// Mesmo estilo do core (services/core-service/vitest.config.js): um banco de teste compartilhado,
// arquivos estritamente sequenciais (cada um limpa as tabelas no beforeAll).
export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 60000,
        globalSetup: ['./tests/setup/globalSetup.js'],
        setupFiles:  ['./tests/setup/env.js'],
        pool: 'forks',
        singleFork: true,
        isolate: false,
        fileParallelism: false,
        sequence: { concurrent: false },
        reporters: ['verbose'],
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary'],
            include: ['app/**', 'routes/**', 'middlewares/**', 'database/**', 'bootstrap/**'],
            exclude: ['**/node_modules/**', 'tests/**', '_web.js', 'command.js'],
            // Meta do TCC: 60%.
            thresholds: { statements: 60, lines: 60, functions: 60, branches: 55 }
        }
    }
});
