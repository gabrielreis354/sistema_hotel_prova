import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devProxy, readComposePorts, type DevProxyEnv } from './src/devProxy';

// .env da raiz do repositório, o mesmo do docker-compose: NGINX_PORT e BACKEND_HOST_PORT dizem onde
// o nginx e o core estão publicados. O caminho sai da pasta deste arquivo, não da pasta de onde o
// Vite foi chamado (🟡-2 do qa-redteam de 14/11). Variável de ambiente na linha de comando vence o
// .env (ex.: `NGINX_PORT=8088 pnpm --filter app-pms dev`). Regras do proxy em src/devProxy.ts.
export const COMPOSE_ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));

export function composePorts(): DevProxyEnv {
  const fromFile = existsSync(COMPOSE_ENV_FILE) ? readComposePorts(readFileSync(COMPOSE_ENV_FILE, 'utf8')) : {};
  const { NGINX_PORT, BACKEND_HOST_PORT } = process.env;
  return {
    ...fromFile,
    ...(NGINX_PORT ? { NGINX_PORT } : {}),
    ...(BACKEND_HOST_PORT ? { BACKEND_HOST_PORT } : {}),
  };
}

export default defineConfig(({ command }) => {
  if (command === 'serve' && !existsSync(COMPOSE_ENV_FILE)) {
    console.warn(`[app-pms] ${COMPOSE_ENV_FILE} não existe: proxy com as portas padrão (nginx :80, core :3000).`);
  }
  return {
    plugins: [react()],
    server: { port: 5173, proxy: devProxy(composePorts()) },
  };
});
