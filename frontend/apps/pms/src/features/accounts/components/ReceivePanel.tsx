import { useEffect, useRef, useState } from 'react';
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
export function ReceivePanel({
  accountId,
  panelId,
  accountStatus,
}: {
  accountId: string;
  panelId: string;
  /** OPEN, CLOSED ou PAID: o que dizer quando não há mais nada a receber. */
  accountStatus: string;
}) {
  const qc = useQueryClient();
  const bill = useAccountBill(accountId, true);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);

  // Ao abrir: o foco vem para o painel, que está antes do rodapé no DOM (🟡-4), e o saldo é buscado
  // de novo, em vez do cache de até 30 s (🟢 do red team).
  useEffect(() => {
    heading.current?.focus();
    void bill.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Depois de registrar, o formulário se refaz com o novo saldo e o botão focado some: o foco vai
  // para o aviso, que diz o que aconteceu (🟡-4, mesmo padrão da ReservationDetailPage).
  useEffect(() => {
    if (result) notice.current?.focus();
  }, [result]);
  const balance = bill.data ? decimalToCents(bill.data.balance ?? '0') : null;
  const paid = bill.data ? decimalToCents(bill.data.payments_made ?? '0') : 0;

  async function readFreshBalance() {
    const fresh = await getAccountBill(accountId);
    qc.setQueryData(accountKeys.bill(accountId), fresh);
    return decimalToCents(fresh.balance ?? '0');
  }

  return (
    <section id={panelId} aria-labelledby={`${panelId}-titulo`} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
      <h2 ref={heading} tabIndex={-1} id={`${panelId}-titulo`} className="text-section text-gray-900 focus:outline-none">
        Receber
      </h2>
      {result && (
        <Notice ref={notice} tone={result.kind === 'ok' ? 'success' : 'error'}>
          {result.text}
        </Notice>
      )}
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
            allowOverpay={false}
          />
        </>
      )}
      {balance !== null && balance <= 0 && (
        <p className="text-sm text-gray-700">
          {balance < 0 ? `Crédito do cliente: ${formatBRL(-balance)}.` : 'Nada a receber.'}{' '}
          {accountStatus === 'OPEN' ? 'A conta pode ser fechada.' : 'Conta quitada.'}
        </p>
      )}
    </section>
  );
}
