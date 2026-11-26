import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorState, PageHeader, Spinner, StatusBadge } from '@hotel/ui';
import { formatBRL } from '@hotel/domain';
import { useAuthStore } from '../../stores/auth.js';
import { useAccount } from './queries.js';
import { queue, useQueueEntries, useQueueRunner } from './queueStore.js';
import { awaitsServer, pendingFor } from './queueCore.js';
import { looksOffline, offlineReason, useOnline } from './connection.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { footerTotals } from './accountTotals.js';
import { accountContext, accountStatusBadge } from './accountFilter.js';
import { BackLink } from '../../components/links.js';
import { InfoNotice } from './components/InfoNotice.js';
import { StickyFooter } from './components/StickyFooter.js';
import { ItemList } from './components/ItemList.js';
import { MenuGrid } from './components/MenuGrid.js';
import { StaffActions } from './components/StaffActions.js';
import { ReceivePanel } from './components/ReceivePanel.js';
import { receivePanelId, receivePanelOpen } from './receive.js';
import type { Product } from './accountsApi.js';

const BackToAccounts = () => <BackLink to="/comanda">← Contas</BackLink>;

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
        <div className="max-w-xl space-y-3">
          <BackToAccounts />
          <ErrorState message="Sem conexão. Esta conta abre quando a rede voltar." onRetry={() => refetch()} />
        </div>
      );
    }
    if (isPending) return <Spinner label="Carregando a conta…" />;
    return (
      <div className="max-w-xl space-y-3">
        <BackToAccounts />
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
  // Fechada ou paga ganha selo no cabeçalho, com ponto e rótulo; aberta é o normal e não ganha
  // (P2 do critique da F6: antes, só um texto cinza acima do cardápio dizia que estava fechada).
  const typeContext = accountContext(account);
  const statusBadge = accountStatusBadge(account.status);
  const headerContext =
    typeContext || statusBadge ? (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {typeContext}
        {statusBadge && <StatusBadge tone={statusBadge.tone} label={statusBadge.label} />}
      </span>
    ) : undefined;

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
    // Coluna do celular até o tablet; a partir de 1280 px, duas colunas como num PDV: a conta (itens,
    // total, ações) à esquerda e o cardápio à direita (F6 da SPEC-10). Encostada à esquerda, como as
    // outras telas (R-7), com a largura do detalhe da reserva.
    <div className="flex max-w-xl flex-col gap-3 xl:max-w-5xl">
      <BackToAccounts />
      <PageHeader title={account.label} context={headerContext} />
      <OfflineBanner offline={offline} waiting={waiting} elsewhere={elsewhere} reason={offlineReason(online)} />
      {/* Sem rede, a faixa acima já avisa: este aviso fica para o erro do servidor com rede. No formato
          dos outros avisos da tela, não em letra miúda: é a hora de mais dúvida do garçom (P2 do critique da F6). */}
      {stale && !offline && (
        <InfoNotice>
          Sem conexão com o sistema: mostrando a última versão da conta. Os lançamentos ficam na fila.
        </InfoNotice>
      )}

      {othersHere > 0 && (
        <InfoNotice>
          {othersHere === 1 ? 'Há 1 lançamento' : `Há ${othersHere} lançamentos`} de outro usuário nesta conta
          esperando neste aparelho. Eles só são enviados quando essa pessoa entrar de novo.
        </InfoNotice>
      )}

      {/* A ordem do DOM é a do celular (itens, cardápio, total fixo embaixo): o total precisa vir depois
          do cardápio para o sticky prendê-lo ao pé. No xl, a grade só reposiciona as três peças. */}
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-6">
        <div className="xl:col-start-1 xl:row-start-1">
          <ItemList
            items={account.items ?? []}
            entries={onThisAccount}
            onUndo={(clientItemId) => user && queue.undo(clientItemId, user.id)}
            onQuantity={(clientItemId, quantity) => user && queue.setQuantity(clientItemId, quantity, user.id)}
            onDismiss={queue.dismiss}
          />
        </div>

        {/* Receber (16/11) no fluxo da página, não no rodapé fixo. Enquanto recebe, o cardápio sai
            para não lançar consumo, por engano, no meio da divisão. Isso só vale neste aparelho: o
            lançamento do garçom em outro aparelho é barrado no envio, pela conferência do saldo (P-8). */}
        {/* O painel fica aberto depois de quitar (a conta vira PAID): o aviso do pagamento continua. */}
        <div className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {receivePanelOpen(account, { receiving, pendingCount }) ? (
            <ReceivePanel
              accountId={account.id ?? ''}
              panelId={receivePanelId(account.id ?? '')}
              accountStatus={account.status ?? ''}
            />
          ) : (
            <MenuGrid onTap={tap} disabledReason={closedReason} />
          )}
        </div>

        {/* Rodapé fixo com o total (CA-05.5.d). No xl fica parado embaixo dos itens, porque o cardápio
            está ao lado e não empurra nada. */}
        <StickyFooter className="space-y-2 xl:static xl:col-start-1 xl:row-start-2">
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
        </StickyFooter>
      </div>
    </div>
  );
}
