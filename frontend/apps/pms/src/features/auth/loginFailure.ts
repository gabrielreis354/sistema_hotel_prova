import { LoginError } from './loginApi.js';

/**
 * O que a tela mostra quando o login falha (T-10.1; 🟡4 do red team: fora do componente, para ser
 * testado sem DOM). A mensagem do servidor vale como está; o mesmo e-mail em dois hotéis pede o
 * subdomínio; qualquer outra falha (rede, bug) vira uma frase genérica, sem expor o erro cru.
 */
export function loginFailure(err: unknown): { message: string; requiresSubdomain: boolean } {
  if (err instanceof LoginError) return { message: err.message, requiresSubdomain: err.requiresSubdomain };
  return { message: 'Não foi possível entrar. Tente novamente.', requiresSubdomain: false };
}
