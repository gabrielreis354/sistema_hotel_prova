import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { devProxy } from './src/devProxy';

// .env da raiz do repositório, o mesmo do docker-compose: NGINX_PORT e BACKEND_HOST_PORT dizem
// onde o nginx e o core estão publicados. Caminho relativo a esta pasta, de onde o Vite roda
// (`pnpm --filter app-pms dev`). Regras do proxy em src/devProxy.ts.
const REPO_ROOT = '../../..';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: devProxy(loadEnv(mode, REPO_ROOT, ['NGINX_PORT', 'BACKEND_HOST_PORT'])),
  },
}));
