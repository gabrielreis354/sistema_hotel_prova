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
            exclude: ['**/node_modules/**', 'tests/**', '_web.js', 'command.js', 'bootstrap/**']
            // NOTA: os thresholds (meta TCC: 60%) serão habilitados no passo de CI,
            // depois que a suíte de testes elevar a cobertura acima da meta.
        }
    }
});
