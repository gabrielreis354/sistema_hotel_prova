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
    }
});
