/**
 * Contas que recebem pagamento na própria tela (combinado com o Gabriel em 16/11): mesa, balcão e
 * day-use SEM reserva e abertas. A conta da suíte, e qualquer uma com reserva, é paga pela reserva,
 * onde o crédito cobre as contas na ordem da D-45. INTERNAL nunca é receita (o backend recusa).
 * Lista do que pode (fail-safe): um tipo novo fica de fora até alguém decidir.
 */
/** Id do painel "Receber" da conta: o botão do rodapé aponta para ele (aria-controls). */
export const receivePanelId = (accountId: string) => `receber-${accountId}`;

const RECEIVABLE_TYPES = ['TABLE', 'DIRECT', 'DAY_USE'];

/**
 * Aberta ou já fechada: fechar é o fim do consumo, não do pagamento (decisão de 16/11, 🟡-1 do red
 * team). A mesa fechada com saldo continua recebendo aqui até quitar; PAID não, já está quitada.
 */
const RECEIVABLE_STATUSES = ['OPEN', 'CLOSED'];

/** Tipo de conta que recebe na própria tela (sem olhar status nem reserva). */
export function isReceivableType(type: string | null | undefined): boolean {
  return RECEIVABLE_TYPES.includes(type ?? '');
}

export function canReceive(account: { type?: string | null; status?: string | null; reservation_id?: string | null }): boolean {
  return isReceivableType(account.type) && RECEIVABLE_STATUSES.includes(account.status ?? '') && !account.reservation_id;
}

/**
 * O painel "Receber" na página da conta. Ele não depende do status: quando o último pagamento quita
 * a mesa fechada, ela vira PAID, e o painel continua aberto com o aviso do pagamento e "Conta
 * quitada." (16/11). Quem abre é o botão, que segue o `canReceive`. Com lançamento na fila deste
 * aparelho ele sai, porque o saldo ainda vai mudar (🟡-2 do red team).
 */
export function receivePanelOpen(
  account: { type?: string | null; status?: string | null; reservation_id?: string | null },
  { receiving, pendingCount }: { receiving: boolean; pendingCount: number },
): boolean {
  return receiving && pendingCount === 0 && isReceivableType(account.type) && !account.reservation_id;
}
