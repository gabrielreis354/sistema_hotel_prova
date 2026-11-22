import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { login, loginErrorForStatus, LoginError } from './loginApi.js';

// 🟡-2 do qa-explorador de 22/11: o login dizia "Credenciais inválidas." para tudo que não era 409,
// inclusive o 429 do limite do nginx (5 logins por minuto por IP) com a senha certa. No hotel, os
// aparelhos saem pelo mesmo IP: na troca de turno, quem entra depois do 5º login do minuto lia que
// a senha estava errada. Lista fechada (🟡-2 do red team de 22/11): só 400 e 401 falam da senha.
const GENERIC = 'Não foi possível entrar. Tente novamente.';

describe('loginErrorForStatus — a mensagem diz o que aconteceu', () => {
  it('senha ou e-mail errado (401) e dados inválidos (400): credenciais inválidas', () => {
    expect(loginErrorForStatus(401).message).toBe('Credenciais inválidas.');
    expect(loginErrorForStatus(400).message).toBe('Credenciais inválidas.');
  });

  it('mesmo e-mail em dois hotéis (409): pede o subdomínio', () => {
    const error = loginErrorForStatus(409);
    expect(error.requiresSubdomain).toBe(true);
    expect(error.message).toBe('E-mail existe em mais de um hotel — informe o subdomínio.');
  });

  it('muitas tentativas (429): manda esperar, sem dizer que a senha está errada', () => {
    const error = loginErrorForStatus(429);
    expect(error.message).toBe('Muitas tentativas de entrar a partir desta rede. Aguarde um minuto e tente de novo.');
    expect(error.requiresSubdomain).toBe(false);
  });

  it('servidor com erro ou fora (5xx): diz que o problema é do sistema', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(loginErrorForStatus(status).message).toBe('O sistema está com problema agora. Tente de novo em instantes.');
    }
  });

  it('qualquer outro status (404 de build sem VITE_API_URL, 403, 408, 413): genérica, nunca "credenciais"', () => {
    for (const status of [403, 404, 408, 413]) {
      expect(loginErrorForStatus(status).message).toBe(GENERIC);
    }
  });

  it('nenhuma mensagem fora do 400 e do 401 fala em credenciais', () => {
    for (const status of [403, 404, 408, 409, 413, 429, 500, 502]) {
      expect(loginErrorForStatus(status).message).not.toMatch(/credenciais|inválid/i);
    }
  });
});

describe('login — a resposta do servidor vira a mensagem certa (ligação, 🟡-3 do red team)', () => {
  const fail = (status: number) => ({ data: undefined, error: { error: 'x' }, response: { ok: false, status } });

  beforeEach(() => api.POST.mockReset());

  it('429 com a senha certa: lança o aviso de muitas tentativas', async () => {
    api.POST.mockResolvedValue(fail(429));
    const err = await login({ email: 'a@b.c', password: 'senha123' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoginError);
    expect((err as LoginError).message).toBe(loginErrorForStatus(429).message);
  });

  it('409: lança pedindo o subdomínio', async () => {
    api.POST.mockResolvedValue(fail(409));
    const err = await login({ email: 'a@b.c', password: 'x' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ requiresSubdomain: true });
  });

  it('502: lança a mensagem do sistema, não a de credenciais', async () => {
    api.POST.mockResolvedValue(fail(502));
    const err = await login({ email: 'a@b.c', password: 'x' }).catch((e: unknown) => e);
    expect((err as LoginError).message).toBe(loginErrorForStatus(502).message);
  });

  it('sucesso: devolve o token e o usuário', async () => {
    const data = { token: 't', user: { id: 'u' } };
    api.POST.mockResolvedValue({ data, error: undefined, response: { ok: true, status: 200 } });
    await expect(login({ email: 'a@b.c', password: 'x' })).resolves.toEqual(data);
  });
});
