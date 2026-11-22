// O hook liga a trava do papel: com dublês do useQuery e da sessão, dá para ver as opções que ele
// entrega ao React Query sem renderizar nada (🟡 do qa-redteam de 16/11: apagar o `enabled` do
// hook não quebrava teste nenhum).
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ user: null as null | { role: string } }));
vi.mock('../../stores/auth.js', () => ({
  useAuthStore: (select: (s: typeof session) => unknown) => select(session),
}));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQuery: (options: unknown) => options,
}));

import { useMyTenant } from './queries.js';

const optionsFor = (role: string | null) => {
  session.user = role ? { role } : null;
  return useMyTenant() as unknown as { enabled?: boolean; queryKey: unknown };
};

describe('useMyTenant — o hook aplica o papel', () => {
  it('garçom e sessão vazia: consulta desligada', () => {
    expect(optionsFor('WAITER').enabled).toBe(false);
    expect(optionsFor(null).enabled).toBe(false);
  });

  it('admin e recepção: consulta ligada na chave do hotel', () => {
    expect(optionsFor('ADMIN')).toMatchObject({ enabled: true, queryKey: ['tenant', 'me'] });
    expect(optionsFor('RECEPTIONIST').enabled).toBe(true);
  });
});
