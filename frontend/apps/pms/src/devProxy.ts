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
