/**
 * Status NORMALIZADO de uma cobrança PIX, devolvido por todo provider em getChargeStatus().
 *
 * Cada PSP tem o próprio vocabulário (Mercado Pago: approved/cancelled/rejected; Asaas:
 * RECEIVED/OVERDUE/REFUNDED...). O controller do webhook só conhece estes três valores —
 * a tradução fica dentro de cada provider, que é quem conhece o PSP. Sem isto, todo PSP
 * novo precisava fingir que fala o vocabulário do primeiro integrado.
 *
 *   PAID    — o PSP confirma que o dinheiro foi pago (ainda sujeito à conferência de valor)
 *   FAILED  — o PSP encerrou a cobrança sem pagamento (cancelada, rejeitada, removida)
 *   PENDING — qualquer outro estado: sem efeito, aguarda a próxima notificação
 */
export const CHARGE_STATUS = Object.freeze({
    PAID: 'PAID',
    FAILED: 'FAILED',
    PENDING: 'PENDING'
});
