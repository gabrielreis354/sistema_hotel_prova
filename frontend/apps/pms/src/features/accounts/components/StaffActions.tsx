import { useState } from 'react';
import { Button, Spinner } from '@hotel/ui';
import { decimalToCents, formatBRL } from '@hotel/domain';
import type { AccountDetail } from '../accountsApi.js';
import { useAccountBill, useCloseAccount } from '../queries.js';

/**
 * Por que a conta não pode ser fechada agora. Mesma regra do backend, para o botão nascer
 * desabilitado com o motivo em vez de falhar no toque (RNF-026).
 */
export function closeBlockedReason(account: AccountDetail, pendingCount: number): string | null {
  if (account.status !== 'OPEN') return 'A conta já está fechada.';
  if (account.type === 'ROOM' && account.charges_lodging) return 'A conta da suíte fecha no check-out.';
  if (pendingCount > 0) return 'Espere os lançamentos da fila chegarem ao sistema.';
  return null;
}

const BILL_ROWS: { key: 'room_charges' | 'consumptions' | 'total' | 'payments_made' | 'balance'; label: string }[] = [
  { key: 'room_charges', label: 'Diárias' },
  { key: 'consumptions', label: 'Consumo' },
  { key: 'total', label: 'Total' },
  { key: 'payments_made', label: 'Pago' },
  { key: 'balance', label: 'Saldo' },
];

/**
 * Bill e fechamento — só recepção e gerência (CA-05.5.j). O garçom nem vê estes botões: o
 * backend também recusaria (requireRole em /bill e /close).
 *
 * Fechar pede confirmação no próprio botão: é irreversível (conta fechada não recebe item).
 */
export function StaffActions({ account, pendingCount }: { account: AccountDetail; pendingCount: number }) {
  const [showBill, setShowBill] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const id = account.id ?? '';
  const bill = useAccountBill(id, showBill);
  const close = useCloseAccount(id);
  const blocked = closeBlockedReason(account, pendingCount);

  return (
    <div className="space-y-2">
      {showBill && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
          {bill.isLoading && <Spinner label="Carregando a conta…" />}
          {bill.isError && <p className="text-status-maintenance">{bill.error.message}</p>}
          {bill.data && (
            <dl className="space-y-1">
              {BILL_ROWS.map((row) => (
                <div key={row.key} className="flex justify-between">
                  <dt className="text-gray-600">{row.label}</dt>
                  <dd className="tabular-nums">{formatBRL(decimalToCents(bill.data[row.key] ?? '0'))}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {close.error && <p role="alert" className="text-sm text-status-maintenance">{close.error.message}</p>}
      {blocked && <p className="text-xs text-gray-600">{blocked}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setShowBill((v) => !v)} aria-expanded={showBill}>
          {showBill ? 'Esconder conta' : 'Ver conta'}
        </Button>
        {confirming ? (
          <Button
            variant="danger"
            disabled={close.isPending}
            onClick={() => close.mutate(undefined, { onSettled: () => setConfirming(false) })}
          >
            {close.isPending ? 'Fechando…' : 'Confirmar fechamento'}
          </Button>
        ) : (
          <Button variant="secondary" disabled={!!blocked} onClick={() => setConfirming(true)}>
            Fechar conta
          </Button>
        )}
      </div>
    </div>
  );
}
