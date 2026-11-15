import { fileURLToPath } from 'node:url';

/**
 * Configuração do roteiro, toda por variável de ambiente. Os padrões batem com o ambiente
 * isolado do ensaio (projeto compose `gesway-ensaio`, nginx em :8088) descrito no README.
 */

/** Vite do app-pms. O Playwright sobe um nesta porta, ou reaproveita o que já estiver no ar. */
export const APP_URL = (process.env.E2E_APP_URL ?? 'http://127.0.0.1:5273').replace(/\/$/, '');

/**
 * nginx do compose: o roteiro chama a API por ele (conferências e passo 6), e o Vite também
 * aponta o proxy /api para ele, como em produção (core e analytics atrás do mesmo nginx).
 */
export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8088').replace(/\/$/, '');

/** Projeto do compose onde os `docker compose exec` do passo 6 rodam. */
export const COMPOSE_PROJECT = process.env.COMPOSE_PROJECT_NAME ?? 'gesway-ensaio';

/**
 * Senha dos usuários do seed. O padrão é a senha documentada do seed de demonstração
 * (services/core-service/seed/seed_hotels.sql e `./start.sh seed`), que só existe em
 * ambiente semeado com ALLOW_SEED=1. Ambiente com outra senha: defina E2E_PASSWORD.
 */
export const PASSWORD = process.env.E2E_PASSWORD ?? 'senha123';

/** Raiz do repositório (onde está o docker-compose.yml), relativa a este arquivo. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Usuários do seed do Hotel Aurora usados no roteiro. */
export const USERS = {
  admin: 'admin@aurora.example',
  recep: 'recep1@aurora.example',
  garcom: 'garcom@aurora.example',
} as const;

/** Porta de uma URL, com o padrão do protocolo quando ela não diz. */
export function portOf(url: string): string {
  const u = new URL(url);
  return u.port || (u.protocol === 'https:' ? '443' : '80');
}
