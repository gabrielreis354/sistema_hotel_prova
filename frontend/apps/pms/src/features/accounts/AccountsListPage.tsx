import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Input, Spinner } from '@hotel/ui';
import { useOpenAccounts } from './queries.js';
import { useAuthStore } from '../../stores/auth.js';
import { useQueueEntries, useQueueRunner } from './queueStore.js';
import { pendingFor } from './queueCore.js';
import { filterAccounts, openedAtLabel, sortAccounts } from './accountFilter.js';
import { ErrorState } from './components/ErrorState.js';
import { Notice } from './components/Notice.js';
import { OpenAccountForm } from './components/OpenAccountForm.js';

/**
 * Tela inicial do garçom: as contas abertas, sem tela intermediária (CA-05.5.a). Um toque na
 * conta abre o cardápio. "Abrir conta" fica embaixo, ao alcance do polegar (CA-05.5.i).
 *
 * Ordem estável, a mais antiga primeiro, e a hora de abertura em cada linha: duas "Mesa 3"
 * ficam distinguíveis e a lista não se mexe quando alguém abre conta (P1 da revisão Impeccable).
 */
export function AccountsListPage() {
  useQueueRunner();
  const navigate = useNavigate();
  const location = useLocation();
  // Aviso de "conta fechada" que o fechamento deixa ao voltar. Lido uma vez e tirado do
  // histórico, para não reaparecer num recarregar.
  const [notice] = useState<string | undefined>(() => (location.state as { notice?: string } | null)?.notice);
  useEffect(() => {
    if (notice) navigate(location.pathname, { replace: true, state: null });
  }, [notice, navigate, location.pathname]);
  const { data, isLoading, isError, fetchStatus, refetch } = useOpenAccounts();
  const userId = useAuthStore((s) => s.user?.id);
  const entries = useQueueEntries();
  const mine = useMemo(() => entries.filter((e) => e.ownerId === userId), [entries, userId]);
  // Lançamentos de outro usuário neste aparelho só saem quando ele logar de novo (🟡-4).
  const others = entries.filter((e) => e.ownerId !== userId && pendingFor([e], e.accountId).length > 0);
  const othersWaiting = others.length;
  // Em quais contas (o rótulo é da conta, sem dado do hóspede — D-15).
  // Só com a lista carregada: antes disso, uma conta que ainda não chegou pareceria fechada.
  const othersAccounts = data
    ? [...new Set(others.map((e) => data.find((a) => a.id === e.accountId)?.label ?? 'conta já fechada'))]
    : [];
  const [term, setTerm] = useState('');
  const [opening, setOpening] = useState(false);
  const filtered = useMemo(() => sortAccounts(filterAccounts(data ?? [], term)), [data, term]);

  const openForm = opening ? (
    <OpenAccountForm
      openAccounts={data ?? []}
      onCancel={() => setOpening(false)}
      onOpened={(account) => navigate(`/comanda/${account.id}`)}
    />
  ) : (
    <Button block onClick={() => setOpening(true)}>
      Abrir conta
    </Button>
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <h1 className="text-xl font-semibold">Comanda</h1>

      {notice && (
        <Notice>
          {notice}
        </Notice>
      )}

      {othersWaiting > 0 && (
        <Notice>
          {othersWaiting === 1 ? 'Há 1 lançamento' : `Há ${othersWaiting} lançamentos`} de outro usuário
          esperando neste aparelho{othersAccounts.length > 0 && ` (${othersAccounts.join(', ')})`}. Eles só são enviados quando essa pessoa entrar de
          novo — não feche essas contas antes.
        </Notice>
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
            className="min-h-touch"
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
                        <span className="text-xs text-gray-600">{openedAtLabel(account.opened_at)}</span>
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
