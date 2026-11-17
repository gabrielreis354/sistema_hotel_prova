/**
 * Contas que recebem pagamento na própria tela (combinado com o Gabriel em 16/11): mesa, balcão e
 * day-use SEM reserva e abertas. A conta da suíte, e qualquer uma com reserva, é paga pela reserva,
 * onde o crédito cobre as contas na ordem da D-45. INTERNAL nunca é receita (o backend recusa).
 * Lista do que pode (fail-safe): um tipo novo fica de fora até alguém decidir.
 */
/** Id do painel "Receber" da conta: o botão do rodapé aponta para ele (aria-controls). */
export const receivePanelId = (accountId: string) => `receber-${accountId}`;

const RECEIVABLE_TYPES = ['TABLE', 'DIRECT', 'DAY_USE'];

export function canReceive(account: { type?: string | null; status?: string | null; reservation_id?: string | null }): boolean {
  return RECEIVABLE_TYPES.includes(account.type ?? '') && account.status === 'OPEN' && !account.reservation_id;
}
