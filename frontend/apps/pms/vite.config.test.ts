import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPOSE_ENV_FILE, composePorts } from './vite.config';

// Ligação do proxy no vite.config.ts (🟢-1 do qa-redteam de 14/11): os dois 🟡 daquela rodada
// passavam pela suíte, porque só a função pura tinha teste.
const repoEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env');

describe('vite.config — de onde vêm as portas do proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('o .env é o da raiz do repositório, qualquer que seja a pasta de onde o Vite foi chamado', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'pms-cwd-'));
    vi.spyOn(process, 'cwd').mockReturnValue(elsewhere);
    expect(COMPOSE_ENV_FILE).toBe(repoEnv);
  });

  it('variável de ambiente na linha de comando vence o .env', () => {
    vi.stubEnv('NGINX_PORT', '9099');
    vi.stubEnv('BACKEND_HOST_PORT', '3999');
    expect(composePorts()).toMatchObject({ NGINX_PORT: '9099', BACKEND_HOST_PORT: '3999' });
  });
});
