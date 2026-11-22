import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { decimalToCents, formatCpf, formatDateBR } from '@hotel/domain';
import { ActionSlot, Button, Card, ErrorState, Section, Spinner, cn } from '@hotel/ui';
import { ApiError } from '../../lib/http.js';
import { mutateOnce } from '../../lib/submitLock.js';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.js';
import { canReadMyTenant, myTenantOptions } from '../tenant/index.js';
import { useBill, useReservation, useTransitionReservation } from './queries.js';
import type { ReservationTransition } from './reservationsApi.js';
import {
  buildBillTimeline,
  nextTab,
  officialBalanceCents,
  primaryAction,
  reservationActions,
  safeNights,
  type ReservationTab,
} from './reservationLogic.js';
import { ReservationStatusBadge } from './components/ReservationStatusBadge.js';
import { BillTimeline } from './components/BillTimeline.js';
import { PaymentForm, type PaymentResult } from './components/PaymentForm.js';
import { canReceivePayment } from './paymentLogic.js';
import { InfoItem, Money, Notice } from './components/primitives.js';
import { BackLink, ButtonLink } from '../../components/links.js';
import { LoadError } from '../../components/LoadError.js';

type Tab = ReservationTab;
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
  // A confirmação do check-out nasce longe do botão do cabeçalho (aba Conta): o foco vai para ela e a
  // tela rola até lá. Sem isso o foco caía no body com o botão desabilitado (🟡-1 do qa-redteam de 15/11).
  const checkOutRef = useRef<HTMLHeadingElement>(null);
  const role = useAuthStore((s) => s.user?.role);
  // Adianta o hotel emissor do comprovante (T-09.1): quem abre o comprovante vem desta tela, e
  // assim o nome já está no cache quando a recepção clica em Imprimir.
  const queryClient = useQueryClient();
  // O prefetch ignora o `enabled` da consulta: o papel é conferido aqui, como no hook.
  useEffect(() => {
    if (canReadMyTenant(role)) void queryClient.prefetchQuery(myTenantOptions());
  }, [queryClient, role]);
  // Fora do cartão do formulário: quando o saldo zera, o formulário some e o aviso fica.
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const paymentResultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  useEffect(() => {
    if (paymentResult) paymentResultRef.current?.focus();
  }, [paymentResult]);

  function setTab(next: Tab) {
    const merged = new URLSearchParams(params);
    if (next === 'resumo') merged.delete('aba');
    else merged.set('aba', next);
    setParams(merged, { replace: true });
  }

  // Um envio por vez (SPEC-11): o 2º clique saía antes do isPending e voltava 422.
  const lock = useRef(false);
  function run(action: ReservationTransition) {
    setFeedback(null);
    mutateOnce(lock, transition.mutate, action, {
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

  // Antes de qualquer return: hook depois de return antecipado muda a ordem entre renders.
  useEffect(() => {
    if (confirming !== 'check-out') return;
    checkOutRef.current?.focus();
    checkOutRef.current?.scrollIntoView({ block: 'center' });
  }, [confirming]);

  if (reservation.isPending) return <Spinner label="Carregando reserva…" />;
  if (reservation.isError || !reservation.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError
          error={reservation.error}
          notFound="Reserva não encontrada — ela pode ter sido excluída."
          failed="Não foi possível carregar a reserva."
          onRetry={() => reservation.refetch()}
          back={{ to: '/reservas', label: '← Voltar para reservas' }}
        />
      </div>
    );
  }

  const r = reservation.data;
  const actions = reservationActions(r.status, r);
  const nights = r.check_in_date && r.check_out_date ? safeNights(r.check_in_date, r.check_out_date) : null;
  const timeline = bill.data ? buildBillTimeline(bill.data) : null;
  const balance = bill.data ? officialBalanceCents(bill.data) : null;
  const busy = transition.isPending;
  const rooms = r.rooms && r.rooms.length > 0 ? r.rooms : r.room ? [r.room] : [];
  const receiving = canReceivePayment({ status: r.status, balanceCents: balance, role, billFailed: bill.isError });

  // Uma ação principal por tela (T-08.3): vai para o cabeçalho, ao lado do saldo, em primary. Com
  // saldo a receber, na aba Conta a principal é o "Registrar pagamento" (decisão de 16/11); no Resumo
  // o formulário não aparece, e o check-out segue principal — ele próprio leva à Conta (redteam da T-08.6).
  const primary = primaryAction(actions, { paymentDue: receiving && tab === 'conta' });

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
            <h1 className="text-title">{r.guest?.full_name ?? 'Hóspede removido'}</h1>
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
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
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
          {primary === 'check-in' && (
            <Button block className="sm:w-auto" disabled={busy} onClick={() => run('check-in')}>
              {busy && transition.variables === 'check-in' ? 'Fazendo check-in…' : 'Fazer check-in'}
            </Button>
          )}
          {primary === 'check-out' && (
            <Button block className="sm:w-auto" disabled={busy || confirming === 'check-out'} onClick={openCheckOut}>
              Fazer check-out
            </Button>
          )}
        </div>
      </Card>

      {/* Demais ações: secundárias, desabilitadas COM o motivo e nunca escondidas (CA-05.2.e,
          CA-08.f). Cancelar fica por último e nunca no lugar da ação principal (T-08.3). */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          {primary !== 'check-in' && (
            <ActionSlot id="acao-checkin" state={actions.checkIn} className="sm:max-w-60">
              {(describedBy) => (
                <Button
                  block
                  variant="secondary"
                  className={SECONDARY_ACTION}
                  aria-describedby={describedBy}
                  disabled={!actions.checkIn.enabled || busy}
                  onClick={() => run('check-in')}
                >
                  Fazer check-in
                </Button>
              )}
            </ActionSlot>
          )}
          {primary !== 'check-out' && (
            <ActionSlot id="acao-checkout" state={actions.checkOut} className="sm:max-w-60">
              {(describedBy) => (
                <Button
                  block
                  variant="secondary"
                  className={SECONDARY_ACTION}
                  aria-describedby={describedBy}
                  disabled={!actions.checkOut.enabled || busy || confirming === 'check-out'}
                  onClick={openCheckOut}
                >
                  Fazer check-out
                </Button>
              )}
            </ActionSlot>
          )}
          <ActionSlot id="acao-cancelar" state={actions.cancel} className="sm:max-w-60">
            {(describedBy) => (
              <Button
                block
                variant="secondary"
                className={SECONDARY_ACTION}
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

      {/* Abas no padrão da W3C (decisão de 15/11, SPEC-08 §9): setas, Home e End trocam de aba e
          levam o foco; só a aba ativa entra no Tab do teclado. O Radix Tabs substitui no 5º semestre. */}
      <div
        role="tablist"
        aria-label="Seções da reserva"
        className="flex gap-1 border-b border-gray-200"
        onKeyDown={(e) => {
          if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+← continua voltando no navegador
          const next = nextTab(tab, e.key);
          if (!next) return;
          e.preventDefault();
          setTab(next);
          document.getElementById(`aba-${next}`)?.focus();
        }}
      >
        <TabButton id="aba-resumo" active={tab === 'resumo'} onClick={() => setTab('resumo')} controls="painel-resumo">
          Resumo
        </TabButton>
        <TabButton id="aba-conta" active={tab === 'conta'} onClick={() => setTab('conta')} controls="painel-conta">
          Conta
        </TabButton>
      </div>

      {tab === 'resumo' && (
        <section id="painel-resumo" role="tabpanel" aria-labelledby="aba-resumo" className="space-y-5 pt-1">
          <Section title="Hóspede">
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
              <InfoItem label="CPF">{formatCpf(r.guest?.cpf) ?? '—'}</InfoItem>
              <InfoItem label="Telefone">{r.guest?.phone || '—'}</InfoItem>
              <InfoItem label="E-mail">{r.guest?.email || '—'}</InfoItem>
            </dl>
          </Section>

          <Section title="Estadia">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InfoItem label="Entrada">{r.check_in_date ? formatDateBR(r.check_in_date) : '—'}</InfoItem>
              <InfoItem label="Saída">{r.check_out_date ? formatDateBR(r.check_out_date) : '—'}</InfoItem>
              <InfoItem label="Diárias">{nights ?? '—'}</InfoItem>
              <InfoItem label="Valor da estadia">
                {r.total_amount ? <Money cents={decimalToCents(r.total_amount)} className="font-medium" /> : '—'}
              </InfoItem>
              <InfoItem label="Criada por">{r.user?.name ?? '—'}</InfoItem>
            </dl>
          </Section>

          <Section title="Quartos">
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
          </Section>
        </section>
      )}

      {tab === 'conta' && (
        <section id="painel-conta" role="tabpanel" aria-labelledby="aba-conta" className="space-y-4">
          {confirming === 'check-out' && (
            <Card className="space-y-3 border-brand/50 p-4">
              <h2 ref={checkOutRef} tabIndex={-1} className="text-section text-gray-800 focus:outline-none">
                Confirmar check-out
              </h2>
              <p className="text-sm text-gray-700">
                Confira a conta abaixo com o hóspede. O check-out fecha as contas da estadia e manda o quarto para limpeza.
              </p>
              {balance !== null && balance > 0 && (
                <p className="rounded-md bg-status-cleaning/10 p-2 text-sm text-gray-900">
                  Há <Money cents={balance} className="font-semibold" /> em aberto. Registre o pagamento logo abaixo antes de
                  liberar o hóspede — depois do check-out a conta não aceita mais consumo.
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

          {paymentResult && (
            <Notice ref={paymentResultRef} tone={paymentResult.kind === 'error' ? 'error' : 'success'}>
              {paymentResult.text}
            </Notice>
          )}

          {receiving && balance !== null && r.id && (
            <Card className="space-y-3 p-4">
              <h2 className="text-section text-gray-800">Registrar pagamento</h2>
              {/* key: o valor preenchido acompanha o saldo depois de cada pagamento. */}
              <PaymentForm key={balance} target={{ reservationId: r.id }} balanceCents={balance} onResult={setPaymentResult} />
            </Card>
          )}

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section text-gray-800">Conta da estadia</h2>
              <ButtonLink to={`/reservas/${r.id}/comprovante`} variant="secondary" className="min-h-touch desk:min-h-0 xl:py-1.5 xl:text-sm">
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

/** Ação secundária: 48 px no celular e no tablet, compacta só a partir de xl (GUIA §3, regra 9). */
const SECONDARY_ACTION = 'desk:h-9 desk:min-h-0 xl:px-3 xl:text-sm';

function TabButton({
  id,
  active,
  onClick,
  controls,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  controls: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      id={id}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
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
