import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { API_URL, APP_URL, portOf } from './src/env';

const FRONTEND_ROOT = fileURLToPath(new URL('..', import.meta.url));
const apiPort = portOf(API_URL);

export default defineConfig({
  testDir: './tests',
  // Um roteiro só, em série: cada passo usa o que o anterior gravou.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Cada passo tem folga para as esperas do outbox e do analytics (passo 7).
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: APP_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Vite do app-pms com o proxy /api inteiro no nginx do compose (o mesmo caminho da produção):
  // as duas portas lidas pelo vite.config.ts apontam para o nginx de E2E_API_URL. Se já houver um
  // servidor respondendo em E2E_APP_URL, ele é reaproveitado.
  webServer: {
    command: `pnpm --filter app-pms exec vite --host ${new URL(APP_URL).hostname} --port ${portOf(APP_URL)} --strictPort`,
    cwd: FRONTEND_ROOT,
    url: `${APP_URL}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { NGINX_PORT: apiPort, BACKEND_HOST_PORT: apiPort },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
