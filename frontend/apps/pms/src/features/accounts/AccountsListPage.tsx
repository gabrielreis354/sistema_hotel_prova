import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Input, Spinner } from '@hotel/ui';
import { useOpenAccounts } from './queries.js';
import { useAuthStore } from '../../stores/auth.js';
import { useQueueEntries, useQueueRunner } from './queueStore.js';
import { pendingFor } from './queueCore.js';
import { ACCOUNT_TYPE_LABEL, filterAccounts } from './accountFilter.js';
import { ErrorState } from './components/ErrorState.js';
import { OpenAccountForm } from './components/OpenAccountForm.js';

/**
 * Tela inicial do garçom: as contas abertas, sem tela intermediária (CA-05.5.a). Um toque na
 * conta abre o cardápio. "Abrir conta" fica embaixo, ao alcance do polegar (CA-05.5.i).
 */
export function AccountsListPage() {
  useQueueRunner();
  const navigate = useNavigate();
  const { data, isLoading, isError, fetchStatus, refetch } = useOpenAccounts();
  const userId = useAuthStore((s) => s.user?.id);
  const entries = useQueueEntries();
  const mine = useMemo(() => entries.filter((e) => e.ownerId === userId), [entries, userId]);
  // Lançamentos de outro usuário neste aparelho só saem quando ele logar de novo (🟡-4).
  const othersWaiting = entries.filter((e) => e.ownerId !== userId && pendingFor([e], e.accountId).length > 0).length;
  const [term, setTerm] = useState('');
  const [opening, setOpening] = useState(false);
  const filtered = useMemo(() => filterAccounts(data ?? [], term), [data, term]);

  const openForm = opening ? (
    <OpenAccountForm onCancel={() => setOpening(false)} onOpened={(account) => navigate(`/comanda/${account.id}`)} />
  ) : (
    <Button block onClick={() => setOpening(true)}>
      Abrir conta
    </Button>
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <h1 className="text-xl font-semibold">Comanda</h1>

      {othersWaiting > 0 && (
        <p role="status" className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
          {othersWaiting === 1 ? 'Há 1 lançamento' : `Há ${othersWaiting} lançamentos`} de outro usuário
          esperando neste aparelho. Eles só são enviados quando essa pessoa entrar de novo.
        </p>
      )}

      {/* Rede ruim não apaga a lista já carregada (🟡-3): só avisa. */}
      {!data && isLoading && <Spinner label="Carregando contas…" />}
      {!data && fetchStatus === 'paused' && (
        <ErrorState message="Sem conexão. As contas aparecem quando a rede voltar." onRetry={() => refetch()} />
      )}
      {!data && isError && <ErrorState message="Não foi possível carregar as contas." onRetry={() => refetch()} />}
      {data && (isError || fetchStatus === 'paused') && (
        <p role="status" className="text-xs text-gray-600">Sem conexão com o sistema: mostrando a última lista.</p>
      )}

      {data && data.length === 0 && !opening && (
        <EmptyState
          title="Nenhuma conta aberta"
          description="Abra uma mesa ou um balcão. A conta da suíte abre sozinha no check-in."
          action={<Button onClick={() => setOpening(true)}>Abrir conta</Button>}
        />
      )}

      {data && data.length > 0 && (
        <>
          <Input
            type="search"
            aria-label="Buscar conta"
            placeholder="Buscar por mesa, suíte ou nome"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {filtered.length === 0 ? (
            <p className="px-1 text-sm text-gray-500">Nenhuma conta corresponde à busca.</p>
          ) : (
            <ul aria-label="Contas abertas" className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {filtered.map((account) => {
                const waiting = pendingFor(mine, account.id ?? '').length;
                return (
                  <li key={account.id}>
                    <Link
                      to={`/comanda/${account.id}`}
                      className="flex min-h-touch items-center justify-between gap-3 px-4 py-3 active:bg-gray-100 [@media(hover:hover)]:hover:bg-gray-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{account.label}</span>
                        <span className="text-xs text-gray-500">{account.type ? ACCOUNT_TYPE_LABEL[account.type] : ''}</span>
                      </span>
                      {waiting > 0 && (
                        <span className="shrink-0 text-xs text-gray-600">
                          {waiting} na fila
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {(data?.length ?? 0) > 0 || opening ? <div className="pt-1">{openForm}</div> : null}
    </div>
  );
}
