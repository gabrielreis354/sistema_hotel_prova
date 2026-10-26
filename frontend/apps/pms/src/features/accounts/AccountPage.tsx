import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Spinner } from '@hotel/ui';
import { formatBRL } from '@hotel/domain';
import { useAuthStore } from '../../stores/auth.js';
import { useAccount } from './queries.js';
import { queue, useQueueEntries, useQueueRunner } from './queueStore.js';
import { pendingFor } from './queueCore.js';
import { footerTotals } from './accountTotals.js';
import { ACCOUNT_TYPE_LABEL } from './accountFilter.js';
import { ErrorState } from './components/ErrorState.js';
import { ItemList } from './components/ItemList.js';
import { MenuGrid } from './components/MenuGrid.js';
import { StaffActions } from './components/StaffActions.js';
import type { Product } from './accountsApi.js';

/**
 * Uma conta: itens no alto, cardápio e total embaixo, ao alcance do polegar (CA-05.5.i).
 * O toque no produto vai direto para a fila — confirmação otimista, sem diálogo (CA-05.5.f, g).
 */
export function AccountPage() {
  useQueueRunner();
  const { id = '' } = useParams();
  const user = useAuthStore((s) => s.user);
  const { data: account, isLoading, isError, error, refetch } = useAccount(id);
  const entries = useQueueEntries();
  const mine = useMemo(() => entries.filter((e) => e.accountId === id), [entries, id]);
  const pendingCount = pendingFor(entries, id).length;

  if (isLoading) return <Spinner label="Carregando a conta…" />;
  if (isError || !account) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Link to="/comanda" className="inline-flex min-h-touch items-center text-brand">← Contas</Link>
        <ErrorState message={error?.message ?? 'Conta não encontrada.'} onRetry={() => refetch()} />
      </div>
    );
  }

  const totals = footerTotals(account.total ?? '0.00', entries, id);
  const isStaff = user?.role === 'ADMIN' || user?.role === 'RECEPTIONIST';
  const closedReason = account.status === 'OPEN' ? undefined : 'Conta fechada: não recebe item novo.';

  const tap = (product: Product) => {
    if (!user || !product.id) return;
    queue.tap({
      ownerId: user.id,
      accountId: id,
      productId: product.id,
      description: product.name ?? '',
      unitPrice: product.price ?? '0.00',
    });
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link to="/comanda" className="inline-flex min-h-touch items-center text-brand">← Contas</Link>
        <span className="text-xs text-gray-500">{account.type ? ACCOUNT_TYPE_LABEL[account.type] : ''}</span>
      </div>
      <h1 className="text-xl font-semibold">{account.label}</h1>

      <ItemList items={account.items ?? []} entries={mine} onUndo={queue.undo} onDismiss={queue.dismiss} />

      <MenuGrid onTap={tap} disabledReason={closedReason} />

      {/* Rodapé fixo com o total (CA-05.5.d), acima da barra de navegação do celular. */}
      <div className="sticky bottom-12 z-10 -mx-4 space-y-2 border-t border-gray-200 bg-white px-4 py-3 md:bottom-0">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-600">Total</span>
          <span className="tabular-nums text-xl font-semibold">{formatBRL(totals.totalCents)}</span>
        </div>
        {totals.pendingCents > 0 && (
          <p className="text-right text-xs text-gray-600">inclui {formatBRL(totals.pendingCents)} na fila</p>
        )}
        {isStaff && <StaffActions account={account} pendingCount={pendingCount} />}
      </div>
    </div>
  );
}
