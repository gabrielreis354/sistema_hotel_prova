import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { LogIn, LogOut, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateBR, formatDateTimeBR } from '@hotel/domain';
import { ActionSlot, Button, Money, RoomNumber, Spinner, StatusBadge, cn } from '@hotel/ui';
import { ApiError } from '../../../lib/http.js';
import { useOnline } from '../../../lib/online.js';
import { mutateOnce, promiseOnce } from '../../../lib/submitLock.js';
import {
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
import {
  BLOCK_LIMIT,
  arrivalFlags,
  checkInBlockedReason,
  invalidateAnalyticsSoon,
  toggleFocusTarget,
  visibleRows,
  type ArrivalRow,
  type CleaningRoom,
  type DepartureRow,
  type ToggleFocusTarget,
} from '../todayLogic.js';
import { ButtonLink } from '../../../components/links.js';

export type Feedback = { kind: 'success' | 'error'; text: string };
type OnResult = (f: Feedback) => void;

/** Botão de ação da linha: 48 px no celular e no tablet (toque), mais baixo só com mouse a partir de 1280 px (desk, R-3). */
const ROW_ACTION = 'w-full sm:w-auto desk:min-h-0 desk:h-10 xl:text-sm';

/** Botão que abre a ação da linha (T-08.4): secundário, com ícone, embaixo do texto no celular. */
const ROW_TRIGGER = 'w-full sm:w-auto sm:px-3 desk:min-h-0 desk:h-10 xl:text-sm';

/** Ícone da ação de linha: traço fino, sempre com o rótulo ao lado (GUIA, regra 5). */
const ICON = 'size-4 shrink-0';

/**
 * Lista de linhas com divisória, a mesma em todos os blocos. Mostra os 8 primeiros e um "Ver todas
 * (N)" que expande no próprio lugar (T-08.4): com 30 chegadas, o celular passava de 18 mil px.
 */
export function RowList<T>({ items, children }: { items: readonly T[]; children: (item: T) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Destino do foco do último toque no botão; só vale para o render que ele causou.
  const pendingFocus = useRef<ToggleFocusTarget | null>(null);
  const { shown } = visibleRows(items, expanded);

  // Ressalva 🟡2 da T-08.4: depois de expandir ou recolher, o foco e a vista não podem se perder.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (!target) return;
    if (target.kind === 'item') {
      const item = listRef.current?.children[target.index] as HTMLElement | undefined;
      // O link do item (o nome do hóspede). Sem link (bloco Em limpeza), o próprio item: focar o
      // "Liberar quarto" direto não diria ao leitor de tela de qual quarto é (🟢3 do red team).
      const focusable = item?.querySelector<HTMLElement>('a[href]');
      if (focusable) focusable.focus();
      else if (item) {
        item.tabIndex = -1;
        item.focus();
      }
      return;
    }
    // Recolher tira milhares de px de cima do botão: sem isto, no iOS a pessoa cai em outro bloco.
    buttonRef.current?.scrollIntoView({ block: 'nearest' });
    buttonRef.current?.focus();
  }, [expanded]);

  return (
    <div className="space-y-2">
      <ul id={listId} ref={listRef} className="divide-y divide-gray-100">
        {shown.map(children)}
      </ul>
      {items.length > BLOCK_LIMIT && (
        <Button
          ref={buttonRef}
          variant="ghost"
          // scroll-mt: ao recolher, o botão sobe até o topo, onde o aviso fixo do painel (sticky
          // top-2, ≥ 48 px) o cobriria inteiro. A margem o deixa abaixo do aviso (🟡 do red team).
          className="w-full scroll-mt-28 text-brand desk:min-h-0 desk:h-9 xl:text-sm"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            pendingFocus.current = toggleFocusTarget(!expanded, items.length);
            setExpanded(!expanded);
          }}
        >
          {expanded ? 'Mostrar menos' : `Ver todas (${items.length})`}
        </Button>
      )}
    </div>
  );
}

/**
 * Casca da linha: quem/onde à esquerda, ação à direita (embaixo, na largura toda, no celular).
 * `panel` aparece embaixo da linha: é onde fica a confirmação das ações sem volta.
 */
function Row({ room, children, action, panel }: { room?: string; children: ReactNode; action?: ReactNode; panel?: ReactNode }) {
  return (
    <li className="py-2 sm:py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3 xl:items-center">
          {/* Número do quarto em destaque (protótipo de 22/11): a recepção acha a linha pelo quarto. O texto
              da linha já diz "Quarto 101", então o selo é só visual. */}
          {room !== undefined && <RoomNumber number={room} />}
          {/* Uma linha por item a partir de xl (T-08.4): nome, selos e quarto lado a lado. */}
          <div className="flex min-w-0 flex-col gap-1 xl:flex-row xl:flex-wrap xl:items-center xl:gap-x-3">{children}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {panel}
    </li>
  );
}

/**
 * Confirmação na própria linha para ação que a recepção não consegue desfazer (DESIGN_PMS §5):
 * o primeiro toque abre este painel e só o botão daqui executa. Numa lista densa, um toque na
 * linha vizinha não pode virar check-in, check-out ou quarto sujo à venda.
 */
function ConfirmPanel({
  id,
  title,
  children,
  confirmLabel,
  busyLabel,
  busy,
  canConfirm = true,
  onConfirm,
  onCancel,
  extra,
}: {
  id: string;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  canConfirm?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  return (
    <div id={id} className="mt-3 space-y-3 rounded-md border border-brand/40 bg-brand/5 p-3">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {children && (
        <div aria-live="polite" className="text-sm text-gray-800">
          {children}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button className={ROW_ACTION} disabled={busy || !canConfirm} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </Button>
        {extra}
        <Button variant="ghost" className={ROW_ACTION} disabled={busy} onClick={onCancel}>
          Voltar
        </Button>
      </div>
    </div>
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
      className="inline-flex min-h-touch items-center font-medium text-gray-900 underline-offset-2 hover:text-brand hover:underline desk:min-h-0"
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
  // Um envio por vez (SPEC-11, CA-11.a): o 2º clique em "Confirmar check-in" saía antes do
  // isPending e voltava 422, e a tela mostrava só o erro de um check-in que deu certo.
  const lock = useRef(false);
  function run(action: ReservationTransition, after?: () => void) {
    mutateOnce(lock, transition.mutate, action, {
      onSuccess: () => onResult({ kind: 'success', text: DONE[action](guest) }),
      onError: (err) => onResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.' }),
      onSettled: () => {
        after?.();
        invalidateAnalyticsSoon(qc);
      },
    });
  }
  return { run, busy: transition.isPending };
}

// ─── Chegadas ────────────────────────────────────────────────────────────────────────

export function ArrivalItem({
  row,
  today,
  onResult,
}: {
  row: ArrivalRow<ReservationListItem>;
  /** O mesmo "hoje" do painel (useHotelToday), para a janela do check-in não divergir da lista. */
  today: string;
  onResult: OnResult;
}) {
  const r = row.reservation;
  const [confirming, setConfirming] = useState(false);
  const { run, busy } = useRowTransition(r, onResult);
  const allowed = reservationActions(r.status, r, today).checkIn;
  const blocked = allowed.enabled ? checkInBlockedReason(r.room) : null;
  const checkIn = blocked ? { enabled: false, reason: blocked } : allowed;
  const slot = `chegada-${r.id}`;
  const panelId = `${slot}-confirmacao`;
  const flags = arrivalFlags(row);

  return (
    <Row
      room={r.room?.number ?? '—'}
      action={
        <ActionSlot id={slot} state={checkIn}>
          {(describedBy) => (
            <Button
              className={ROW_TRIGGER}
              aria-describedby={describedBy}
              aria-expanded={confirming}
              aria-controls={panelId}
              variant="secondary"
              disabled={!checkIn.enabled || busy || confirming}
              onClick={() => setConfirming(true)}
            >
              <LogIn aria-hidden="true" className={cn(ICON, 'mr-2')} strokeWidth={1.75} />
              Fazer check-in
            </Button>
          )}
        </ActionSlot>
      }
      panel={
        confirming && (
          <ConfirmPanel
            id={panelId}
            title={`Confirmar check-in de ${r.guest?.full_name ?? 'hóspede'} no quarto ${r.room?.number ?? '—'}`}
            confirmLabel="Confirmar check-in"
            busyLabel="Fazendo check-in…"
            busy={busy}
            // O quarto pode ficar bloqueado com o painel aberto: o motivo aparece acima, e o
            // confirmar acompanha, em vez de mandar um check-in que o servidor recusaria.
            canConfirm={checkIn.enabled}
            onConfirm={() => run('check-in', () => setConfirming(false))}
            onCancel={() => setConfirming(false)}
          >
            O quarto passa a ocupado e a conta da estadia abre.
          </ConfirmPanel>
        )
      }
    >
      <HeadLine>
        <GuestLink reservation={r} />
        <ReservationStatusBadge status={r.status} />
      </HeadLine>
      {/* Selos ao lado da estadia, não numa linha própria (ressalva 🟡1 da T-08.4): em 375 px a
          chegada com alerta perde uma linha inteira. Se não couber, o selo quebra e não some. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StayLine reservation={r} />
        {flags.map((f) => (
          // Cor + rótulo (CA-05.3.f): nunca só o vermelho. O texto completo vai para o leitor de
          // tela e para a dica do mouse; o curto é o que cabe na linha. O `title` fica no trecho
          // aria-hidden para o leitor não ler o texto duas vezes, e o ". " separa dois selos.
          <span key={f.label}>
            <span aria-hidden="true" title={f.full}>
              <StatusBadge tone={f.tone} label={f.label} className={f.tone === 'maintenance' ? 'font-medium' : undefined} />
            </span>
            <span className="sr-only">{`${f.full}. `}</span>
          </span>
        ))}
      </div>
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
    <Row
      room={r.room?.number ?? '—'}
      action={
        <ActionSlot id={slot} state={checkOut}>
          {(describedBy) => (
            <Button
              className={ROW_TRIGGER}
              aria-describedby={describedBy}
              aria-expanded={confirming}
              aria-controls={panelId}
              variant="secondary"
              disabled={!checkOut.enabled || busy || confirming}
              onClick={() => setConfirming(true)}
            >
              <LogOut aria-hidden="true" className={cn(ICON, 'mr-2')} strokeWidth={1.75} />
              Fazer check-out
            </Button>
          )}
        </ActionSlot>
      }
      panel={
        confirming && (
          <ConfirmPanel
            id={panelId}
            title={`Confirmar check-out do quarto ${r.room?.number ?? '—'}`}
            confirmLabel="Confirmar check-out"
            busyLabel="Fazendo check-out…"
            busy={busy}
            canConfirm={fresh}
            onConfirm={() => run('check-out', () => setConfirming(false))}
            onCancel={() => setConfirming(false)}
            extra={
              <ButtonLink to={`/reservas/${r.id}?aba=conta`} variant="secondary" className={cn(ROW_ACTION, 'xl:px-3')}>
                Abrir conta
              </ButtonLink>
            }
          >
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
          </ConfirmPanel>
        )
      }
    >
      <HeadLine>
        <GuestLink reservation={r} />
        <ReservationStatusBadge status={r.status} />
      </HeadLine>
      <StayLine reservation={r} />
      {row.late && r.check_out_date && (
        <StatusBadge tone="cleaning" label={`Saída atrasada · era ${formatDateBR(r.check_out_date)}`} className="font-medium" />
      )}
    </Row>
  );
}

// ─── Na casa ─────────────────────────────────────────────────────────────────────────

export function InHouseItem({ reservation }: { reservation: ReservationListItem }) {
  return (
    <Row room={reservation.room?.number ?? '—'}>
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
  const qc = useQueryClient();
  const busy = release.isPending;
  // Sem rede o envio fica pausado e só sai quando ela volta: a tela diz isso, em vez de
  // "Liberando…" sem fim (QA de 24/11, 🟢-3). Offline antes de confirmar, nem deixa enviar.
  const online = useOnline();
  const [confirming, setConfirming] = useState(false);
  // A lista vem do analytics-service, que só tira o quarto quando o evento chega: por alguns
  // segundos, a linha continua aqui depois do sucesso. Guardar a limpeza que foi liberada impede
  // um segundo envio (409) nesse intervalo. Se o quarto voltar para a limpeza, `since` muda e a
  // ação reabre.
  const [releasedFor, setReleasedFor] = useState<string | null>(null);
  const released = releasedFor === (room.since ?? '');
  const panelId = `limpeza-${room.id}-confirmacao`;

  // mutateAsync, não callbacks do mutate: a linha some ao recarregar a lista, e o React Query não
  // chama callback de mutate de componente já desmontado.
  const lock = useRef(false);
  function confirmRelease() {
    void promiseOnce(lock, () => release.mutateAsync({ id: room.id, number: room.number }))?.then(
      () => {
        setConfirming(false);
        setReleasedFor(room.since ?? '');
        // O useReleaseRoom já recarrega na hora; o segundo refetch pega a projeção (CA-11.g).
        invalidateAnalyticsSoon(qc);
        onResult({ kind: 'success', text: `Quarto ${room.number} liberado — voltou para a venda.` });
      },
      (err: unknown) => {
        setConfirming(false);
        onResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.' });
      },
    );
  }

  return (
    <Row
      room={room.number}
      action={
        <Button
          variant="secondary"
          className={ROW_TRIGGER}
          aria-expanded={confirming}
          aria-controls={panelId}
          disabled={busy || confirming || released}
          onClick={() => setConfirming(true)}
        >
          <Sparkles aria-hidden="true" className={cn(ICON, 'mr-2')} strokeWidth={1.75} />
          {released ? 'Liberado' : 'Liberar quarto'}
        </Button>
      }
      panel={
        confirming && (
          <ConfirmPanel
            id={panelId}
            title={`Confirmar que o quarto ${room.number} está limpo`}
            confirmLabel="Liberar para a venda"
            busyLabel={release.isPaused ? 'Sem conexão…' : 'Liberando…'}
            busy={busy}
            canConfirm={online}
            onConfirm={confirmRelease}
            onCancel={() => setConfirming(false)}
          >
            {release.isPaused
              ? 'Sem conexão: o quarto será liberado assim que a rede voltar.'
              : !online
                ? 'Sem conexão: confirme quando a rede voltar.'
                : 'O quarto volta para a venda. Depois disso, só o administrador consegue tirá-lo de novo.'}
          </ConfirmPanel>
        )
      }
    >
      <HeadLine>
        <span className="font-medium tabular-nums text-gray-900">Quarto {room.number}</span>
        <StatusBadge status="CLEANING" />
      </HeadLine>
      <p className="text-sm text-gray-700">
        {room.category}
        {/* Data e hora juntas: a hora não quebra sozinha na linha de baixo (overlay do critique da F3). */}
        {room.since && (
          <>
            {' · em limpeza desde '}
            <span className="whitespace-nowrap">{formatDateTimeBR(room.since)}</span>
          </>
        )}
      </p>
    </Row>
  );
}
