import { describe, expect, it } from 'vitest';
import { loginErrorForStatus } from './loginApi.js';

// 🟡-2 do qa-explorador de 22/11: o login dizia "Credenciais inválidas." para tudo que não era 409,
// inclusive o 429 do limite do nginx (5 logins por minuto por IP) com a senha certa. No hotel, os
// aparelhos saem pelo mesmo IP: na troca de turno, quem entra depois do 5º login do minuto lia que
// a senha estava errada.
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
    expect(error.message).toBe('Muitas tentativas de entrar neste minuto. Aguarde um minuto e tente de novo.');
    expect(error.message).not.toMatch(/inválid/i);
    expect(error.requiresSubdomain).toBe(false);
  });

  it('servidor fora ou com erro (5xx): diz que o problema é do sistema', () => {
    for (const status of [500, 502, 503, 504]) {
      const error = loginErrorForStatus(status);
      expect(error.message).toBe('O sistema não respondeu. Tente de novo em instantes.');
      expect(error.message).not.toMatch(/inválid/i);
    }
  });
});
