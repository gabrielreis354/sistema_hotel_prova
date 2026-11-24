import type { Role } from '../../types.js';

/**
 * Regras de tela do cadastro de hóspedes. O backend continua sendo a autoridade; aqui só se
 * decide o que habilitar e com que motivo (mesmo molde de rooms/roomRules.ts).
 */

/** Espelha o backend: DELETE /guests/:id exige ADMIN (routes/apis/guestRouter.js). */
export function canDeleteGuest(role: Role | undefined): boolean {
  return role === 'ADMIN';
}

export const DELETE_GUEST_REASON = 'Só o administrador exclui hóspedes.';

/**
 * Termos de busca para achar o hóspede que barrou o cadastro com 409 ("CPF ou e-mail já
 * cadastrado"), na ordem: os dígitos do CPF completo e o e-mail. O 409 não diz qual dos dois
 * colidiu, então a tela tenta os dois (qa-redteam de 24/11). QA de 24/11 (🟢-2): a recepcionista
 * precisava voltar à busca e digitar de novo.
 */
export function duplicateSearchTerms(draft: { cpf?: string; email?: string }): string[] {
  const cpf = (draft.cpf ?? '').replace(/\D/g, '');
  const email = (draft.email ?? '').trim();
  return [...(cpf.length === 11 ? [cpf] : []), ...(email ? [email] : [])];
}

/**
 * Entre os resultados da busca, o hóspede que tem o MESMO CPF (só dígitos) ou o mesmo e-mail
 * (sem diferença de caixa) do rascunho. Parecido não serve: a busca é por "contém", e oferecer
 * o hóspede errado num botão de um toque grava a reserva em nome de outra pessoa.
 */
export function findDuplicateGuest<G extends { cpf?: string | null; email?: string | null }>(
  candidates: G[],
  draft: { cpf?: string; email?: string },
): G | null {
  const cpf = (draft.cpf ?? '').replace(/\D/g, '');
  const email = (draft.email ?? '').trim().toLowerCase();
  return (
    candidates.find(
      (g) =>
        (cpf.length === 11 && (g.cpf ?? '').replace(/\D/g, '') === cpf) ||
        (!!email && (g.email ?? '').trim().toLowerCase() === email),
    ) ?? null
  );
}
