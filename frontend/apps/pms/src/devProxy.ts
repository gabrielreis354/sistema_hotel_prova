/**
 * Proxy do Vite em desenvolvimento: o navegador chama /api/... na mesma origem (sem CORS) e o Vite
 * encaminha tirando o prefixo /api, porque as rotas do core e do nginx são montadas na raiz.
 *
 * Desde a H.3, os indicadores (/analytics/*) são servidos pelo analytics-service, que só é
 * alcançável pelo nginx do compose. O resto da API vai direto ao core. Sem a regra própria, o
 * painel do gerente e os alertas do painel Hoje davam 404 (🔴-1 do ensaio de 14/11). O nginx
 * devolve ao core o /analytics/internal-consumption (decisão L-1).
 *
 * As portas vêm do mesmo .env da raiz que o docker-compose usa. A ordem das chaves importa: o
 * Vite usa a primeira regra que casa, então /api/analytics vem antes de /api.
 */
export type DevProxyEnv = { NGINX_PORT?: string; BACKEND_HOST_PORT?: string };

const PORT_KEYS = ['NGINX_PORT', 'BACKEND_HOST_PORT'] as const;

/**
 * Só as duas portas do .env do compose, e nada mais. O `loadEnv` do Vite foi descartado: com o
 * NODE_ENV=production do .env da raiz, ele punha VITE_USER_NODE_ENV no processo e no
 * import.meta.env, e todo `dev` mostrava um aviso falso de configuração (🟡-1 do qa-redteam de 14/11).
 */
export function readComposePorts(envText: string): DevProxyEnv {
  const env: DevProxyEnv = {};
  for (const raw of envText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!(PORT_KEYS as readonly string[]).includes(key)) continue;
    const value = line.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    env[key as (typeof PORT_KEYS)[number]] = value;
  }
  return env;
}

type ProxyRule = { target: string; changeOrigin: true; rewrite: (path: string) => string };

const stripApi = (path: string) => path.replace(/^\/api/, '');

function port(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

export function devProxy(env: DevProxyEnv): Record<'/api/analytics' | '/api', ProxyRule> {
  return {
    '/api/analytics': {
      target: `http://localhost:${port(env.NGINX_PORT, 80)}`,
      changeOrigin: true,
      rewrite: stripApi,
    },
    '/api': {
      target: `http://localhost:${port(env.BACKEND_HOST_PORT, 3000)}`,
      changeOrigin: true,
      rewrite: stripApi,
    },
  };
}
