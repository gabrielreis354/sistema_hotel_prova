import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Notice, Spinner } from '@hotel/ui';
import { decimalToCents, formatBRL } from '@hotel/domain';
import { PaymentForm, type PaymentResult } from '../../reservations/index.js';
import { getAccountBill } from '../accountsApi.js';
import { accountKeys, useAccountBill } from '../queries.js';

/**
 * Receber na conta sem reserva — mesa, balcão e day-use (combinado com o Gabriel em 16/11).
 * Dividir por valor é registrar um pagamento por pagante: o formulário já vem com o saldo, a
 * recepção troca pelo valor da primeira pessoa, registra, e ele volta com o que falta para a
 * próxima (key = saldo). É o mesmo PaymentForm da reserva: valor a maior pede confirmação, e o
 * saldo é conferido no servidor antes de gravar (P-8).
 */
export function ReceivePanel({ accountId, panelId }: { accountId: string; panelId: string }) {
  const qc = useQueryClient();
  const bill = useAccountBill(accountId, true);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const balance = bill.data ? decimalToCents(bill.data.balance ?? '0') : null;
  const paid = bill.data ? decimalToCents(bill.data.payments_made ?? '0') : 0;

  async function readFreshBalance() {
    const fresh = await getAccountBill(accountId);
    qc.setQueryData(accountKeys.bill(accountId), fresh);
    return decimalToCents(fresh.balance ?? '0');
  }

  return (
    <section id={panelId} aria-labelledby={`${panelId}-titulo`} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
      <h2 id={`${panelId}-titulo`} className="text-section text-gray-900">
        Receber
      </h2>
      {result && <Notice tone={result.kind === 'ok' ? 'success' : 'error'}>{result.text}</Notice>}
      {bill.isLoading && <Spinner label="Carregando o saldo…" />}
      {bill.isError && <p className="text-sm text-status-maintenance">{bill.error.message}</p>}
      {balance !== null && balance > 0 && (
        <>
          <p className="text-sm text-gray-700">
            Saldo a receber: <span className="font-semibold tabular-nums">{formatBRL(balance)}</span>
            {paid > 0 && (
              <>
                {' '}
                · já pago: <span className="tabular-nums">{formatBRL(paid)}</span>
              </>
            )}
            . Para dividir, registre um pagamento por pessoa com a parte dela.
          </p>
          <PaymentForm
            key={balance}
            target={{ accountId }}
            balanceCents={balance}
            onResult={setResult}
            readFreshBalance={readFreshBalance}
            payer="o cliente"
          />
        </>
      )}
      {balance !== null && balance <= 0 && (
        <p className="text-sm text-gray-700">
          {balance < 0 ? `Crédito do cliente: ${formatBRL(-balance)}.` : 'Nada a receber.'} A conta pode ser fechada.
        </p>
      )}
    </section>
  );
}
