import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateBR, formatDateTimeBR } from '@hotel/domain';
import { ActionSlot, Button, Money, Spinner, StatusBadge, cn } from '@hotel/ui';
import { ApiError } from '../../../lib/http.js';
import {
  ButtonLink,
  ReservationStatusBadge,
  officialBalanceCents,
  reservationActions,
  safeNights,
  useFreshBill,
  useTransitionReservation,
  type ReservationListItem,
  type ReservationTransition,
} from '../../reservations/index.js';
import { useReleaseRoom } from '../../rooms/index.js';
import { checkInBlockedReason, type ArrivalRow, type CleaningRoom, type DepartureRow } from '../todayLogic.js';

export type Feedback = { kind: 'success' | 'error'; text: string };
type OnResult = (f: Feedback) => void;

/** Botão de ação da linha: 48 px no celular e no tablet (toque), mais baixo só no desktop (≥ 1280). */
const ROW_ACTION = 'w-full sm:w-auto xl:min-h-0 xl:h-10 xl:text-sm';

/** Lista de linhas com divisória — a mesma em todos os blocos. */
export function RowList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-gray-100">{children}</ul>;
}

/** Casca da linha: quem/onde à esquerda, ação à direita (embaixo, na largura toda, no celular). */
function Row({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">{children}</div>
      {action && <div className="shrink-0 sm:w-auto">{action}</div>}
    </li>
  );
}

/** Primeira linha do item: nome/quarto e selos lado a lado, quebrando no celular. */
function HeadLine({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{children}</div>;
}

/** Nome do hóspede, que abre a reserva. Alvo de 48 px no celular e no tablet. */
function GuestLink({ reservation }: { reservation: ReservationListItem }) {
  return (
    <Link
      to={`/reservas/${reservation.id}`}
      className="inline-flex min-h-touch items-center font-medium text-gray-900 underline-offset-2 hover:text-brand hover:underline xl:min-h-0"
    >
      {reservation.guest?.full_name ?? 'Hóspede removido'}
    </Link>
  );
}

function StayLine({ reservation, children }: { reservation: ReservationListItem; children?: ReactNode }) {
  const nights =
    reservation.check_in_date && reservation.check_out_date ? safeNights(reservation.check_in_date, reservation.check_out_date) : null;
  return (
    <p className="text-sm text-gray-700 tabular-nums">
      <span className="font-medium text-gray-900">Quarto {reservation.room?.number ?? '—'}</span>
      {nights !== null && ` · ${nights} ${nights === 1 ? 'diária' : 'diárias'}`}
      {children}
    </p>
  );
}

const DONE: Record<ReservationTransition, (guest: string) => string> = {
  'check-in': (g) => `Check-in de ${g} feito. O quarto passou a ocupado.`,
  'check-out': (g) => `Check-out de ${g} feito. O quarto foi para limpeza e a conta fechou.`,
  cancel: (g) => `Reserva de ${g} cancelada.`,
};

/**
 * Check-in/out pela mesma mutação do detalhe (T-05.2). Além do que ela já invalida (reservas
 * e quartos), o painel invalida os indicadores: contagens e lista de limpeza mudam.
 */
function useRowTransition(reservation: ReservationListItem, onResult: OnResult) {
  const qc = useQueryClient();
  const transition = useTransitionReservation(reservation.id ?? '');
  const guest = reservation.guest?.full_name ?? 'hóspede';
  function run(action: ReservationTransition, after?: () => void) {
    transition.mutate(action, {
      onSuccess: () => onResult({ kind: 'success', text: DONE[action](guest) }),
      onError: (err) => onResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.' }),
      onSettled: () => {
        after?.();
        void qc.invalidateQueries({ queryKey: ['analytics'] });
      },
    });
  }
  return { run, busy: transition.isPending };
}

// ─── Chegadas ────────────────────────────────────────────────────────────────────────

export function ArrivalItem({ row, onResult }: { row: ArrivalRow<ReservationListItem>; onResult: OnResult }) {
  const r = row.reservation;
  const { run, busy } = useRowTransition(r, onResult);
  const allowed = reservationActions(r.status).checkIn;
  const blocked = allowed.enabled ? checkInBlockedReason(r.room) : null;
  const checkIn = blocked ? { enabled: false, reason: blocked } : allowed;
  const slot = `chegada-${r.id}`;

  return (
    <Row
      action={
        <ActionSlot id={slot} state={checkIn}>
          {(describedBy) => (
            <Button
              className={ROW_ACTION}
              aria-describedby={describedBy}
              disabled={!checkIn.enabled || busy}
              onClick={() => run('check-in')}
            >
              {busy ? 'Fazendo check-in…' : 'Fazer check-in'}
            </Button>
          )}
        </ActionSlot>
      }
    >
      <HeadLine>
        <GuestLink reservation={r} />
        <ReservationStatusBadge status={r.status} />
      </HeadLine>
      <StayLine reservation={r} />
      {(row.noShowRisk || row.late) && (
        <div className="flex flex-wrap gap-2">
          {/* Cor + rótulo (CA-05.3.f): nunca só o vermelho. */}
          {row.noShowRisk && <StatusBadge tone="maintenance" label="Sem pagamento · risco de no-show" className="font-medium" />}
          {row.late && r.check_in_date && (
            <StatusBadge tone="cleaning" label={`Chegada atrasada · entrada era ${formatDateBR(r.check_in_date)}`} />
          )}
        </div>
      )}
    </Row>
  );
}

// ─── Saídas ──────────────────────────────────────────────────────────────────────────

/**
 * Saída com check-out NA LINHA (D-2): o primeiro toque abre a confirmação, que busca a conta e
 * mostra o saldo antes — check-out é irreversível (DESIGN_PMS §5). "Abrir conta" leva à aba
 * Conta da reserva para receber o que falta.
 */
export function DepartureItem({ row, onResult }: { row: DepartureRow<ReservationListItem>; onResult: OnResult }) {
  const r = row.reservation;
  const [confirming, setConfirming] = useState(false);
  const { run, busy } = useRowTransition(r, onResult);
  const bill = useFreshBill(confirming ? r.id : undefined);
  // Só o saldo desta busca vale: o do cache some enquanto ela roda, e um erro não o traz de volta.
  const fresh = bill.isSuccess && !bill.isFetching;
  const balance = fresh ? officialBalanceCents(bill.data) : null;
  const checkOut = reservationActions(r.status).checkOut;
  const slot = `saida-${r.id}`;
  const panelId = `${slot}-confirmacao`;

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <HeadLine>
            <GuestLink reservation={r} />
            <ReservationStatusBadge status={r.status} />
          </HeadLine>
          <StayLine reservation={r} />
          {row.late && r.check_out_date && (
            <StatusBadge tone="cleaning" label={`Saída atrasada · era ${formatDateBR(r.check_out_date)}`} className="font-medium" />
          )}
        </div>
        <ActionSlot id={slot} state={checkOut} className="shrink-0">
          {(describedBy) => (
            <Button
              className={ROW_ACTION}
              aria-describedby={describedBy}
              aria-expanded={confirming}
              aria-controls={panelId}
              disabled={!checkOut.enabled || busy || confirming}
              onClick={() => setConfirming(true)}
            >
              Fazer check-out
            </Button>
          )}
        </ActionSlot>
      </div>

      {confirming && (
        <div id={panelId} className="mt-3 space-y-3 rounded-md border border-brand/40 bg-brand/5 p-3">
          <p className="text-sm font-semibold text-gray-900">Confirmar check-out do quarto {r.room?.number ?? '—'}</p>
          <div aria-live="polite" className="text-sm text-gray-800">
            {bill.isFetching && <Spinner label="Conferindo a conta…" />}
            {bill.isError && !bill.isFetching && <p>A conta não carregou. Abra a conta para conferir antes de liberar o hóspede.</p>}
            {balance !== null && balance > 0 && (
              <p className="rounded-md border-l-4 border-status-cleaning bg-status-cleaning/10 p-2 text-gray-900">
                Saldo em aberto: <Money cents={balance} className="font-semibold" />. Receba antes de liberar o hóspede — depois do
                check-out a conta não aceita mais consumo.
              </p>
            )}
            {balance !== null && balance <= 0 && (
              <p className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-status-occupied" aria-hidden="true" />
                {balance === 0 ? 'Conta quitada.' : <>Conta quitada, com <Money cents={-balance} /> a devolver.</>}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button className={ROW_ACTION} disabled={busy || !fresh} onClick={() => run('check-out', () => setConfirming(false))}>
              {busy ? 'Fazendo check-out…' : 'Confirmar check-out'}
            </Button>
            <ButtonLink to={`/reservas/${r.id}?aba=conta`} variant="secondary" className={cn(ROW_ACTION, 'xl:px-3')}>
              Abrir conta
            </ButtonLink>
            <Button variant="ghost" className={ROW_ACTION} disabled={busy} onClick={() => setConfirming(false)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Na casa ─────────────────────────────────────────────────────────────────────────

export function InHouseItem({ reservation }: { reservation: ReservationListItem }) {
  return (
    <Row>
      <GuestLink reservation={reservation} />
      <StayLine reservation={reservation}>
        {reservation.check_out_date && ` · saída ${formatDateBR(reservation.check_out_date)}`}
      </StayLine>
    </Row>
  );
}

// ─── Em limpeza ──────────────────────────────────────────────────────────────────────

/** Quarto parado em limpeza com a ação de liberar (CA-05.3.g, D-1). */
export function CleaningItem({ room, onResult }: { room: CleaningRoom; onResult: OnResult }) {
  const release = useReleaseRoom();
  const busy = release.isPending;

  return (
    <Row
      action={
        <Button
          variant="secondary"
          className={ROW_ACTION}
          disabled={busy}
          onClick={() =>
            release.mutate(
              { id: room.id, number: room.number },
              {
                onSuccess: () => onResult({ kind: 'success', text: `Quarto ${room.number} liberado — voltou para a venda.` }),
                onError: (err) =>
                  onResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.' }),
              },
            )
          }
        >
          {busy ? 'Liberando…' : 'Liberar quarto'}
        </Button>
      }
    >
      <HeadLine>
        <span className="font-medium tabular-nums text-gray-900">Quarto {room.number}</span>
        <StatusBadge status="CLEANING" />
      </HeadLine>
      <p className="text-sm text-gray-700">
        {room.category}
        {room.since && ` · em limpeza desde ${formatDateTimeBR(room.since)}`}
      </p>
    </Row>
  );
}
