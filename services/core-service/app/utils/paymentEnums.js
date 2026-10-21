// Allowlist do status de pagamento — fonte única da verdade, usada pelo model, pelo CHECK
// payments_status_allowlist (database/applyDbConstraints.js) e pelos controllers.
// Mesmo padrão de app/utils/accountEnums.js.
//
//   PENDING → cobrança PIX online aguardando o PSP
//   PAID    → efetivado: o único que é receita e que abate saldo de conta
//   EXPIRED → cobrança PIX vencida
//   FAILED  → recusada pelo PSP
//   VOIDED  → estorno do lançamento feito por engano (T-06.13). Não é devolução ao
//             hóspede (REFUNDED, que passa pelo PSP e ainda não existe): anular não tira
//             dinheiro da gaveta.
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'FAILED', 'VOIDED'];

// Transições do estorno (allowlist, CA-06.13.c): só o efetivado pode ser anulado.
export const VOIDABLE_STATUSES = ['PAID'];

// Status em que a API ainda corrige método e data de um lançamento manual. VOIDED é
// histórico e não muda; PENDING, EXPIRED e FAILED são do PSP.
export const EDITABLE_STATUSES = ['PAID'];

// Teto do motivo do estorno: texto livre da gerência, não documento.
export const VOID_REASON_MAX_LENGTH = 500;
