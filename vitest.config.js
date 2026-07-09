import { defineConfig } from 'vitest/config';

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
        sequence: { concurrent: false },
        reporters: ['verbose'],
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'html'],
            // Cobrir apenas o código de aplicação (controllers, rotas, middlewares, models, utils).
            include: ['app/**', 'routes/**', 'middlewares/**', 'database/**'],
            // Fora: entrypoints, bootstrap e o próprio harness de testes.
            exclude: ['**/node_modules/**', 'tests/**', '_web.js', 'command.js', 'bootstrap/**'],
            // Meta do TCC: 60% de cobertura. O CI (e `npm run test:coverage`) falha abaixo disso.
            // Cobertura atual bem acima (~77% stmts / ~80% lines) — margem confortável.
            thresholds: {
                statements: 60,
                lines: 60,
                functions: 60,
                branches: 55
            }
        }
    }
});
