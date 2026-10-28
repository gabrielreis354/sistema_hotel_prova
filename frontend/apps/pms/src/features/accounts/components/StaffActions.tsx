import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Spinner } from '@hotel/ui';
import { decimalToCents, formatBRL } from '@hotel/domain';
import type { AccountDetail } from '../accountsApi.js';
import { useAccountBill, useCloseAccount } from '../queries.js';
import { confirmArmed } from '../closeGuard.js';
import { closedNotice } from '../accountTotals.js';

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
 * Fechar pede confirmação: é irreversível (conta fechada não recebe item). A confirmação mostra
 * o total e troca os botões de lugar — "Sim, fechar" à esquerda, "Voltar" onde estava "Fechar
 * conta" — e ignora toques nos primeiros 400 ms. Antes, a confirmação nascia no mesmo lugar e o
 * toque duplo fechava a conta (P0 da revisão Impeccable). Fechada, volta para a lista com o saldo
 * e o caminho para a conta fechada (🟡-1 do qa-redteam).
 *
 * A confirmação não expira mais por tempo (🟡-4): com leitor de tela, ler e chegar a "Sim, fechar"
 * passa dos 5 s, e com rede lenta o prazo apagava o "Fechando…". Ela só cai com "Voltar" ou se
 * surgir um bloqueio, e o foco volta para "Fechar conta".
 */
export function StaffActions({
  account,
  pendingCount,
  othersPending = 0,
  totalCents,
}: {
  account: AccountDetail;
  pendingCount: number;
  /** O total que o rodapé mostra: é o valor que a confirmação repete. */
  totalCents: number;
  /** Lançamentos de outro usuário nesta conta, parados neste aparelho (D-1). Avisa, não bloqueia. */
  othersPending?: number;
}) {
  const [showBill, setShowBill] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const shownAt = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const navigate = useNavigate();
  const id = account.id ?? '';
  const bill = useAccountBill(id, showBill);
  const close = useCloseAccount(id);
  const blocked = closeBlockedReason(account, pendingCount);

  // A confirmação cai se surgir um bloqueio (item novo na fila) ou se o total mudar com ela aberta:
  // a recepção confirma o valor que leu, não um que trocou sozinho (🟢-4 da delta).
  const confirmedTotal = useRef(totalCents);
  useEffect(() => {
    if (!confirming || close.isPending) return;
    if (blocked || totalCents !== confirmedTotal.current) setConfirming(false);
  }, [confirming, blocked, totalCents, close.isPending]);

  // Saindo da confirmação, o foco volta para "Fechar conta", em vez de cair no body.
  useEffect(() => {
    if (wasConfirming.current && !confirming) closeButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  return (
    <div className="space-y-2">
      {showBill && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
          {bill.isLoading && <Spinner label="Carregando a conta…" />}
          {bill.isError && <p className="text-status-maintenance">{bill.error.message}</p>}
          {bill.data && (
            <dl className="space-y-1">
              {BILL_ROWS.map((row) => {
                const cents = decimalToCents(bill.data[row.key] ?? '0');
                // Saldo negativo é dinheiro a devolver: no balcão, "Crédito", sem sinal de menos.
                const credit = row.key === 'balance' && cents < 0;
                return (
                  <div key={row.key} className="flex justify-between">
                    <dt className="text-gray-600">{credit ? 'Crédito do hóspede' : row.label}</dt>
                    <dd className="tabular-nums">{formatBRL(Math.abs(cents))}</dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      )}

      {close.error && <p role="alert" className="text-sm text-status-maintenance">{close.error.message}</p>}
      {blocked && <p id="close-blocked-reason" className="text-xs text-gray-600">{blocked}</p>}
      {!blocked && othersPending > 0 && (
        <p id="close-others-warning" role="alert" className="text-xs text-status-maintenance">
          Fechar agora recusa {othersPending === 1 ? 'o lançamento' : `os ${othersPending} lançamentos`} de outro
          usuário que ainda não saíram deste aparelho: o consumo fica sem cobrança.
        </p>
      )}

      {confirming ? (
        <div role="group" aria-labelledby="close-confirm-text" className="space-y-2">
          <p id="close-confirm-text" className="text-sm text-gray-700">
            Fechar <span className="font-medium">{account.label}</span>? Total{' '}
            <span className="font-semibold tabular-nums">{formatBRL(totalCents)}</span>. Depois de fechada, a conta
            não recebe item.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="danger"
              disabled={close.isPending}
              onClick={() => {
                if (!confirmArmed(shownAt.current, performance.now())) return;
                close.mutate(undefined, {
                  onSuccess: (closedBill) =>
                    navigate('/comanda', {
                      replace: true,
                      state: { notice: closedNotice(account.label ?? 'Conta', closedBill), closedId: id },
                    }),
                  onSettled: () => setConfirming(false),
                });
              }}
            >
              {close.isPending ? 'Fechando…' : othersPending > 0 ? 'Fechar mesmo assim' : 'Sim, fechar'}
            </Button>
            <Button variant="secondary" autoFocus disabled={close.isPending} onClick={() => setConfirming(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setShowBill((v) => !v)} aria-expanded={showBill}>
            {showBill ? 'Esconder conta' : 'Ver conta'}
          </Button>
          <Button
            ref={closeButton}
            variant="secondary"
            disabled={!!blocked}
            aria-describedby={blocked ? 'close-blocked-reason' : othersPending > 0 ? 'close-others-warning' : undefined}
            onClick={() => {
              shownAt.current = performance.now();
              confirmedTotal.current = totalCents;
              setConfirming(true);
            }}
          >
            Fechar conta
          </Button>
        </div>
      )}
    </div>
  );
}
