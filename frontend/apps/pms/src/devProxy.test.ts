import { describe, expect, it } from 'vitest';
import { devProxy } from './devProxy.js';

// 🔴-1 do ensaio de 14/11 (docs/qa/ensaio_roteiro_14112026.md): o proxy mandava /api/analytics ao
// core, que desde a H.3 não serve os indicadores — o painel do gerente e os alertas do painel Hoje
// davam 404. Os indicadores só existem atrás do nginx do compose.
describe('devProxy — proxy do Vite em desenvolvimento', () => {
  it('/api/analytics vai para o nginx, e vem antes da regra geral /api', () => {
    const proxy = devProxy({});
    const keys = Object.keys(proxy);
    expect(keys.indexOf('/api/analytics')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('/api/analytics')).toBeLessThan(keys.indexOf('/api'));
    expect(proxy['/api/analytics'].target).toBe('http://localhost:80');
  });

  it('o resto da API continua indo direto ao core na porta 3000', () => {
    expect(devProxy({})['/api'].target).toBe('http://localhost:3000');
  });

  it('respeita NGINX_PORT e BACKEND_HOST_PORT do .env do compose', () => {
    const proxy = devProxy({ NGINX_PORT: '8088', BACKEND_HOST_PORT: '3100' });
    expect(proxy['/api/analytics'].target).toBe('http://localhost:8088');
    expect(proxy['/api'].target).toBe('http://localhost:3100');
  });

  it('tira o prefixo /api nos dois caminhos: as rotas do core e do nginx são montadas na raiz', () => {
    const proxy = devProxy({});
    expect(proxy['/api/analytics'].rewrite('/api/analytics/occupancy?date=2026-11-14')).toBe('/analytics/occupancy?date=2026-11-14');
    expect(proxy['/api'].rewrite('/api/reservations/1')).toBe('/reservations/1');
  });

  it('porta inválida no .env cai no padrão em vez de gerar um alvo quebrado', () => {
    const proxy = devProxy({ NGINX_PORT: 'abc', BACKEND_HOST_PORT: '' });
    expect(proxy['/api/analytics'].target).toBe('http://localhost:80');
    expect(proxy['/api'].target).toBe('http://localhost:3000');
  });
});
