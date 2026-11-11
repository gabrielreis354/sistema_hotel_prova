import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute.js';

// Sem DOM nos testes: a função roda direto, com o store simulado. O que garante a remontagem é a
// `key` do elemento devolvido. Sem ela, a troca de usuário vinda de outra aba deixava na tela os
// dados do usuário anterior (🔴 do qa-redteam, docs/qa/redteam_logout-varias-abas_09nov2026.md).
const session = vi.hoisted(() => ({ token: null as string | null, user: null as { id: string } | null }));

vi.mock('../stores/auth.js', () => ({
  useAuthStore: (select: (s: typeof session) => unknown) => select(session),
}));

const render = () => ProtectedRoute() as ReactElement;

describe('ProtectedRoute', () => {
  beforeEach(() => {
    session.token = 'token';
    session.user = { id: 'a-1' };
  });

  it('sem token, manda para o login', () => {
    session.token = null;

    expect(render().type).toBe(Navigate);
  });

  it('remonta as telas quando o usuário muda', () => {
    const doHotelA = render().key;

    session.user = { id: 'b-1' };

    expect(doHotelA).toBe('a-1');
    expect(render().key).toBe('b-1');
  });

  it('não remonta quando só o token do mesmo usuário é renovado', () => {
    const antes = render().key;

    session.token = 'token-renovado';

    expect(render().key).toBe(antes);
  });
});
