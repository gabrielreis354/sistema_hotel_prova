import { describe, expect, it } from 'vitest';
import { loginFailure } from './loginFailure.js';
import { LoginError } from './loginApi.js';

// O que a tela faz com cada falha do login (🟡4 do red team da T-10.1): a lógica que a SPEC-10
// diz que "não pode se perder" sai do componente para ser testada sem DOM.
describe('loginFailure', () => {
  it('erro do servidor: mostra a mensagem dele e não pede subdomínio', () => {
    expect(loginFailure(new LoginError('Credenciais inválidas.'))).toEqual({
      message: 'Credenciais inválidas.',
      requiresSubdomain: false,
    });
  });

  it('mesmo e-mail em dois hotéis: mostra a mensagem e pede o subdomínio', () => {
    expect(loginFailure(new LoginError('E-mail existe em mais de um hotel — informe o subdomínio.', true))).toEqual({
      message: 'E-mail existe em mais de um hotel — informe o subdomínio.',
      requiresSubdomain: true,
    });
  });

  it('falha que não é do login (rede, bug): mensagem genérica, sem expor o erro cru', () => {
    expect(loginFailure(new TypeError('Failed to fetch'))).toEqual({
      message: 'Não foi possível entrar. Tente novamente.',
      requiresSubdomain: false,
    });
  });
});
