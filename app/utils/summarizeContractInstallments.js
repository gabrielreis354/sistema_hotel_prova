/**
 * Resume o recebível de um contrato a partir das parcelas cadastradas:
 * quanto já foi pago e quanto falta receber (das parcelas, não do total do contrato).
 * @param {Array<{valor: number|string, status: string}>} installments
 */
export function summarizeContractInstallments(installments = []) {
    const round = (n) => Number(n.toFixed(2));

    const installmentsTotal = round(installments.reduce((acc, i) => acc + Number(i.valor), 0));
    const installmentsPaidTotal = round(installments
        .filter((i) => i.status === 'PAID')
        .reduce((acc, i) => acc + Number(i.valor), 0));

    return {
        installments_paid_total: installmentsPaidTotal,
        installments_balance: round(installmentsTotal - installmentsPaidTotal)
    };
}
