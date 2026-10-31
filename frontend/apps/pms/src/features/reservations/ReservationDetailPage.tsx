import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { decimalToCents, formatDateBR } from '@hotel/domain';
import { Button, Card, ErrorState, Spinner, cn } from '@hotel/ui';
import { ApiError } from '../../lib/http.js';
import { useBill, useReservation, useTransitionReservation } from './queries.js';
import type { ReservationTransition } from './reservationsApi.js';
import {
  buildBillTimeline,
  officialBalanceCents,
  reservationActions,
  safeNights,
  type ActionState,
} from './reservationLogic.js';
import { ReservationStatusBadge } from './components/ReservationStatusBadge.js';
import { BillTimeline } from './components/BillTimeline.js';
import { BackLink, ButtonLink, CardHeading, InfoItem, Money, Notice } from './components/primitives.js';

type Tab = 'resumo' | 'conta';
type Confirming = null | 'check-out' | 'cancel';

const DONE_MESSAGE: Record<ReservationTransition, string> = {
  'check-in': 'Check-in feito. O quarto passou a ocupado.',
  'check-out': 'Check-out feito. O quarto foi para limpeza e a conta fechou.',
  cancel: 'Reserva cancelada. O quarto ficou livre para o período.',
};

/**
 * Detalhe da reserva (CA-05.2.b, d, e, f, h, i). O cabeçalho — hóspede, status e SALDO —
 * fica fixo acima das abas: o recepcionista vê quanto falta receber em qualquer aba.
 */
export function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'conta' ? 'conta' : 'resumo';
  const reservation = useReservation(id);
  const bill = useBill(id);
  const transition = useTransitionReservation(id ?? '');
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  function setTab(next: Tab) {
    const merged = new URLSearchParams(params);
    if (next === 'resumo') merged.delete('aba');
    else merged.set('aba', next);
    setParams(merged, { replace: true });
  }

  function run(action: ReservationTransition) {
    setFeedback(null);
    transition.mutate(action, {
      onSuccess: () => {
        setConfirming(null);
        setFeedback({ kind: 'ok', text: DONE_MESSAGE[action] });
      },
      onError: (err) => {
        setConfirming(null);
        setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.' });
      },
    });
  }

  if (reservation.isPending) return <Spinner label="Carregando reserva…" />;
  if (reservation.isError || !reservation.data) {
    const notFound = reservation.error instanceof ApiError && reservation.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {/* Reserva que não existe não tem "tentar de novo": o caminho é voltar à lista. */}
        {notFound ? (
          <Notice tone="error">Reserva não encontrada — ela pode ter sido excluída.</Notice>
        ) : (
          <ErrorState message="Não foi possível carregar a reserva." onRetry={() => reservation.refetch()} />
        )}
        <BackLink to="/reservas">← Voltar para reservas</BackLink>
      </div>
    );
  }

  const r = reservation.data;
  const actions = reservationActions(r.status);
  const nights = r.check_in_date && r.check_out_date ? safeNights(r.check_in_date, r.check_out_date) : null;
  const timeline = bill.data ? buildBillTimeline(bill.data) : null;
  const balance = bill.data ? officialBalanceCents(bill.data) : null;
  const busy = transition.isPending;
  const rooms = r.rooms && r.rooms.length > 0 ? r.rooms : r.room ? [r.room] : [];

  function openCheckOut() {
    setFeedback(null);
    setConfirming('check-out');
    setTab('conta');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <BackLink to="/reservas">← Reservas</BackLink>

      {/* Cabeçalho fixo acima das abas: quem, situação e saldo (CA-05.2.i). */}
      <Card className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{r.guest?.full_name ?? 'Hóspede removido'}</h1>
            <ReservationStatusBadge status={r.status} />
          </div>
          <p className="text-sm text-gray-600 tabular-nums">
            Quarto {rooms.map((x) => x.number).join(', ') || '—'} ·{' '}
            {r.check_in_date && r.check_out_date
              ? `${formatDateBR(r.check_in_date)} → ${formatDateBR(r.check_out_date)}`
              : '—'}
            {nights !== null && ` · ${nights} ${nights === 1 ? 'diária' : 'diárias'}`}
          </p>
        </div>
        <div className="sm:text-right" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {balance !== null && balance < 0 ? 'A devolver' : 'Saldo da estadia'}
          </p>
          {bill.isPending && <p className="text-sm text-gray-500">calculando…</p>}
          {bill.isError && <p className="text-sm text-status-maintenance">indisponível</p>}
          {balance !== null && (
            <Money cents={Math.abs(balance)} className="text-2xl font-semibold text-gray-900" />
          )}
          {/* Verde só no ponto: o texto em gray-700 passa de 4,5:1 (o verde do preset dá 3,3). */}
          {balance === 0 && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-700 sm:justify-end">
              <span className="h-2 w-2 rounded-full bg-status-occupied" aria-hidden="true" />
              Conta quitada
            </p>
          )}
        </div>
      </Card>

      {/* Ações: desabilitadas COM o motivo, nunca escondidas (CA-05.2.e). */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionSlot id="acao-checkin" state={actions.checkIn}>
            {(describedBy) => (
              <Button
                block
                // Só a ação possível agora tem peso de primária; a indisponível não compete por atenção.
                variant={actions.checkIn.enabled ? 'primary' : 'secondary'}
                aria-describedby={describedBy}
                disabled={!actions.checkIn.enabled || busy}
                onClick={() => run('check-in')}
              >
                {busy && transition.variables === 'check-in' ? 'Fazendo check-in…' : 'Fazer check-in'}
              </Button>
            )}
          </ActionSlot>
          <ActionSlot id="acao-checkout" state={actions.checkOut}>
            {(describedBy) => (
              <Button
                block
                variant={actions.checkOut.enabled ? 'primary' : 'secondary'}
                aria-describedby={describedBy}
                disabled={!actions.checkOut.enabled || busy || confirming === 'check-out'}
                onClick={openCheckOut}
              >
                Fazer check-out
              </Button>
            )}
          </ActionSlot>
          <ActionSlot id="acao-cancelar" state={actions.cancel}>
            {(describedBy) => (
              <Button
                block
                variant="secondary"
                aria-describedby={describedBy}
                disabled={!actions.cancel.enabled || busy || confirming === 'cancel'}
                onClick={() => {
                  setFeedback(null);
                  setConfirming('cancel');
                }}
              >
                Cancelar reserva
              </Button>
            )}
          </ActionSlot>
        </div>

        {confirming === 'cancel' && (
          <div className="mt-4 space-y-3 rounded-md border border-status-maintenance/40 bg-status-maintenance/5 p-3">
            <p className="text-sm text-gray-800">
              Cancelar a reserva de <strong>{r.guest?.full_name}</strong>? O quarto volta a ficar livre no período e as
              contas da estadia fecham. Não dá para desfazer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={busy} onClick={() => run('cancel')}>
                {busy ? 'Cancelando…' : 'Sim, cancelar reserva'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                Manter reserva
              </Button>
            </div>
          </div>
        )}

        {feedback && (
          <div className="mt-4">
            <Notice ref={feedbackRef} tone={feedback.kind === 'error' ? 'error' : 'success'}>
              {feedback.text}
            </Notice>
          </div>
        )}
      </Card>

      <div role="tablist" aria-label="Seções da reserva" className="flex gap-1 border-b border-gray-200">
        <TabButton active={tab === 'resumo'} onClick={() => setTab('resumo')} controls="painel-resumo">
          Resumo
        </TabButton>
        <TabButton active={tab === 'conta'} onClick={() => setTab('conta')} controls="painel-conta">
          Conta
        </TabButton>
      </div>

      {tab === 'resumo' && (
        <section id="painel-resumo" role="tabpanel" className="space-y-4">
          <Card className="p-4">
            <CardHeading>Hóspede</CardHeading>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InfoItem label="Nome">
                {r.guest?.id ? (
                  <Link to={`/hospedes/${r.guest.id}`} className="text-brand hover:underline">
                    {r.guest.full_name}
                  </Link>
                ) : (
                  '—'
                )}
              </InfoItem>
              <InfoItem label="CPF">{r.guest?.cpf || '—'}</InfoItem>
              <InfoItem label="Telefone">{r.guest?.phone || '—'}</InfoItem>
              <InfoItem label="E-mail">{r.guest?.email || '—'}</InfoItem>
            </dl>
          </Card>

          <Card className="p-4">
            <CardHeading>Estadia</CardHeading>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InfoItem label="Entrada">{r.check_in_date ? formatDateBR(r.check_in_date) : '—'}</InfoItem>
              <InfoItem label="Saída">{r.check_out_date ? formatDateBR(r.check_out_date) : '—'}</InfoItem>
              <InfoItem label="Diárias">{nights ?? '—'}</InfoItem>
              <InfoItem label="Valor da estadia">
                {r.total_amount ? <Money cents={decimalToCents(r.total_amount)} className="font-medium" /> : '—'}
              </InfoItem>
              <InfoItem label="Criada por">{r.user?.name ?? '—'}</InfoItem>
            </dl>
          </Card>

          <Card className="p-4">
            <CardHeading>Quartos</CardHeading>
            {rooms.length === 0 ? (
              <p className="text-sm text-gray-600">Nenhum quarto vinculado.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {rooms.map((room) => (
                  <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium tabular-nums">Quarto {room.number}</span>
                      <span className="ml-2 text-gray-600">{room.category?.name ?? ''}</span>
                      {room.id === r.room_id && rooms.length > 1 && (
                        <span className="ml-2 text-xs text-gray-500">(principal)</span>
                      )}
                    </span>
                    {room.category?.price_per_night && (
                      <span className="text-gray-700">
                        <Money cents={decimalToCents(room.category.price_per_night)} /> por noite
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {tab === 'conta' && (
        <section id="painel-conta" role="tabpanel" className="space-y-4">
          {confirming === 'check-out' && (
            <Card className="space-y-3 border-brand/50 p-4">
              <h2 className="text-sm font-semibold text-gray-800">Confirmar check-out</h2>
              <p className="text-sm text-gray-700">
                Confira a conta abaixo com o hóspede. O check-out fecha as contas da estadia e manda o quarto para limpeza.
              </p>
              {balance !== null && balance > 0 && (
                <p className="rounded-md bg-status-cleaning/10 p-2 text-sm text-gray-900">
                  Há <Money cents={balance} className="font-semibold" /> em aberto. Receba antes de liberar o hóspede — depois
                  do check-out a conta não aceita mais consumo.
                </p>
              )}
              {bill.isError && (
                <p className="text-sm text-status-maintenance">
                  A conta não carregou. Recarregue antes de fazer o check-out para não liberar o hóspede sem conferir.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !bill.data} onClick={() => run('check-out')}>
                  {busy ? 'Fazendo check-out…' : 'Confirmar check-out'}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                  Voltar
                </Button>
              </div>
            </Card>
          )}

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800">Conta da estadia</h2>
              <ButtonLink to={`/reservas/${r.id}/comprovante`} variant="secondary" className="min-h-touch md:min-h-0 md:py-1.5 md:text-sm">
                Comprovante para imprimir
              </ButtonLink>
            </div>
            {bill.isPending && <Spinner label="Carregando conta…" />}
            {bill.isError && (
              <ErrorState
                message={
                  bill.error instanceof ApiError && bill.error.status === 503
                    ? 'Consumos desta reserva em migração — a conta volta assim que ela terminar.'
                    : 'Não foi possível carregar a conta.'
                }
                onRetry={() => bill.refetch()}
              />
            )}
            {timeline && balance !== null && <BillTimeline timeline={timeline} balanceCents={balance} />}
          </Card>
        </section>
      )}
    </div>
  );
}

/** Uma ação e, embaixo, o motivo quando ela não está disponível (princípio 11). */
function ActionSlot({
  id,
  state,
  children,
}: {
  id: string;
  state: ActionState;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  return (
    <div className="space-y-1">
      {children(state.enabled ? undefined : `${id}-motivo`)}
      {!state.enabled && (
        <p id={`${id}-motivo`} className="text-xs text-gray-600">
          {state.reason}
        </p>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        '-mb-px rounded-none border-b-2 px-4',
        active ? 'border-brand font-semibold text-brand' : 'border-transparent text-gray-600',
      )}
    >
      {children}
    </Button>
  );
}
