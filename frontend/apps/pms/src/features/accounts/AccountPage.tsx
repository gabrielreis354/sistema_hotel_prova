import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, PageHeader, Spinner } from '@hotel/ui';
import { formatBRL } from '@hotel/domain';
import { useAuthStore } from '../../stores/auth.js';
import { useAccount } from './queries.js';
import { queue, useQueueEntries, useQueueRunner } from './queueStore.js';
import { awaitsServer, pendingFor } from './queueCore.js';
import { looksOffline, offlineReason, useOnline } from './connection.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { footerTotals } from './accountTotals.js';
import { ACCOUNT_TYPE_LABEL } from './accountFilter.js';
import { InfoNotice } from './components/InfoNotice.js';
import { ItemList } from './components/ItemList.js';
import { MenuGrid } from './components/MenuGrid.js';
import { StaffActions } from './components/StaffActions.js';
import { ReceivePanel } from './components/ReceivePanel.js';
import { receivePanelId, receivePanelOpen } from './receive.js';
import type { Product } from './accountsApi.js';

const BackLink = () => (
  <Link to="/comanda" className="inline-flex min-h-touch items-center text-brand">
    ← Contas
  </Link>
);

/**
 * Uma conta: itens no alto, cardápio e total embaixo, ao alcance do polegar (CA-05.5.i).
 * O toque no produto vai direto para a fila — confirmação otimista, sem diálogo (CA-05.5.f, g).
 *
 * Rede ruim não derruba a tela (🟡-3 do qa-redteam): com a conta já carregada, uma
 * atualização que falha só mostra um aviso, e o garçom continua lançando na fila. A tela de
 * erro fica para quando não há nada para mostrar.
 */
export function AccountPage() {
  useQueueRunner();
  const { id = '' } = useParams();
  const user = useAuthStore((s) => s.user);
  const { data: account, isPending, isError, error, fetchStatus, refetch } = useAccount(id);
  const entries = useQueueEntries();
  // Só os lançamentos de quem está logado: no aparelho compartilhado, a fila de outro usuário
  // não aparece, não soma e não trava o fechamento (🟡-4 do qa-redteam).
  const mine = useMemo(() => entries.filter((e) => e.ownerId === user?.id), [entries, user?.id]);
  const onThisAccount = useMemo(() => mine.filter((e) => e.accountId === id), [mine, id]);
  const pendingCount = pendingFor(mine, id).length;
  // Lançamentos de outro usuário nesta conta, parados neste aparelho: não aparecem nem somam,
  // mas fechar a conta agora faria o servidor recusá-los — consumo sem cobrança (D-1).
  const othersHere = pendingFor(entries.filter((e) => e.ownerId !== user?.id), id).length;
  const online = useOnline();
  const offline = looksOffline(online, mine);
  // A faixa conta tudo o que este usuário tem esperando a rede, em qualquer conta: a queda é do
  // aparelho, não da conta aberta.
  const waiting = mine.filter(awaitsServer).length;
  // Quantos deles são de outras contas: a faixa diz, para o número bater com a lista desta conta.
  const elsewhere = waiting - pendingCount;
  // Painel "Receber" da mesa/balcão/day-use (16/11). Antes de qualquer return: ordem dos hooks.
  const [receiving, setReceiving] = useState(false);

  if (!account) {
    if (fetchStatus === 'paused') {
      return (
        <div className="mx-auto max-w-xl space-y-3">
          <BackLink />
          <ErrorState message="Sem conexão. Esta conta abre quando a rede voltar." onRetry={() => refetch()} />
        </div>
      );
    }
    if (isPending) return <Spinner label="Carregando a conta…" />;
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <BackLink />
        <ErrorState message={isError ? error.message : 'Conta não encontrada.'} onRetry={() => refetch()} />
      </div>
    );
  }

  const totals = footerTotals(account.total ?? '0.00', mine, id);
  const isStaff = user?.role === 'ADMIN' || user?.role === 'RECEPTIONIST';
  const closedReason = account.status === 'OPEN' ? undefined : 'Conta fechada: não recebe item novo.';
  const stale = isError || fetchStatus === 'paused';
  // Na conta da suíte, o rodapé soma só o consumo: a diária está no bill (Ver conta).
  const totalLabel = account.type === 'ROOM' && account.charges_lodging ? 'Consumo' : 'Total';

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
      <BackLink />
      <PageHeader title={account.label} context={account.type ? ACCOUNT_TYPE_LABEL[account.type] : undefined} />
      <OfflineBanner offline={offline} waiting={waiting} elsewhere={elsewhere} reason={offlineReason(online)} />
      {/* Sem rede, a faixa acima já avisa: esta linha fica para o erro do servidor com rede. */}
      {stale && !offline && (
        <p role="status" className="text-xs text-gray-600">
          Sem conexão com o sistema: mostrando a última versão da conta. Os lançamentos ficam na fila.
        </p>
      )}

      {othersHere > 0 && (
        <InfoNotice>
          {othersHere === 1 ? 'Há 1 lançamento' : `Há ${othersHere} lançamentos`} de outro usuário nesta conta
          esperando neste aparelho. Eles só são enviados quando essa pessoa entrar de novo.
        </InfoNotice>
      )}

      <ItemList
        items={account.items ?? []}
        entries={onThisAccount}
        onUndo={(clientItemId) => user && queue.undo(clientItemId, user.id)}
        onQuantity={(clientItemId, quantity) => user && queue.setQuantity(clientItemId, quantity, user.id)}
        onDismiss={queue.dismiss}
      />

      {/* Receber (16/11) no fluxo da página, não no rodapé fixo. Enquanto recebe, o cardápio sai
          para não lançar consumo, por engano, no meio da divisão. Isso só vale neste aparelho: o
          lançamento do garçom em outro aparelho é barrado no envio, pela conferência do saldo (P-8). */}
      {/* O painel fica aberto depois de quitar (a conta vira PAID): o aviso do pagamento continua. */}
      {receivePanelOpen(account, { receiving, pendingCount }) ? (
        <ReceivePanel
          accountId={account.id ?? ''}
          panelId={receivePanelId(account.id ?? '')}
          accountStatus={account.status ?? ''}
        />
      ) : (
        <MenuGrid onTap={tap} disabledReason={closedReason} />
      )}

      {/* Rodapé fixo com o total (CA-05.5.d), acima da barra de navegação do celular. */}
      {/* Preso logo acima da barra do celular, que tem 48 px mais a folga da barra de gestos (SPEC-10, R-4). */}
      <div className="sticky bottom-[calc(3rem+max(6px,env(safe-area-inset-bottom)))] z-10 -mx-4 space-y-2 border-t border-gray-200 bg-white px-4 py-3 md:bottom-0">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-600">{totalLabel}</span>
          <span className="tabular-nums text-xl font-semibold">{formatBRL(totals.totalCents)}</span>
        </div>
        <p role="status" aria-live="polite" className="text-right text-xs text-gray-600">
          {totals.pendingCents > 0 ? `inclui ${formatBRL(totals.pendingCents)} na fila` : ''}
        </p>
        {isStaff && (
          <StaffActions
            account={account}
            pendingCount={pendingCount}
            othersPending={othersHere}
            totalCents={totals.totalCents}
            receiving={receiving}
            onToggleReceive={() => setReceiving((v) => !v)}
          />
        )}
      </div>
    </div>
  );
}
