import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, LogIn, LogOut, Sparkles } from 'lucide-react';
import { formatDateBR } from '@hotel/domain';
import { Button, ErrorState, Notice, PageHeader, Spinner, cn } from '@hotel/ui';

import { useRooms } from '../rooms/index.js';
import { REFRESH, useArrivals, useHotelToday, useInHouse, useTodayAlerts } from './queries.js';
import { arrivalRows, cleaningRows, departureRows, departuresError, inHouseRows, isStale, loadState, soldToday } from './todayLogic.js';
import { hotelStrip } from './hotelStrip.js';
import { TodayBlock } from './components/TodayBlock.js';
import { StaleNotice } from './components/StaleNotice.js';
import { HotelStripView } from './components/HotelStripView.js';
import { CountPill } from './components/TodayBlock.js';
import { attentionItems, type AttentionItem as AttentionItemData } from './attention.js';
import { ArrivalItem, CleaningItem, DepartureItem, InHouseItem, RowList, type Feedback } from './components/rows.js';
import { ButtonLink } from '../../components/links.js';
import { ConnectionBanner, OfflineStrip } from '../../components/ConnectionBanner.js';
import { useOnline } from '../../lib/online.js';

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Painel "Hoje" (T-05.3, CA-05.3.a a g) — a tela inicial da recepção, que o gerente também abre
 * no celular. Ordem dos blocos FIXA (D-4): números do dia, atenção, chegadas, saídas, na casa,
 * em limpeza. Cada bloco carrega e falha sozinho.
 */
export function TodayPage() {
  const today = useHotelToday();
  const inHouse = useInHouse();
  const arrivals = useArrivals(today);
  const alerts = useTodayAlerts();
  // Fita do hotel (SPEC-10, F3): os quartos do core, no mesmo ritmo das outras consultas (CA-11.g). O
  // check-in, o check-out e o liberar invalidam ['rooms'], então a fita muda na hora da ação. Os números
  // do topo saem dela e não do analytics: com ele fora, a recepção continua vendo o hotel.
  const rooms = useRooms({ refetchInterval: REFRESH });
  const online = useOnline();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Sucesso some sozinho (a lista já mostra o novo estado); erro fica até a pessoa fechar.
  useEffect(() => {
    if (feedback?.kind !== 'success') return;
    const timer = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const noShowIds = alerts.data?.noShowIds ?? NO_IDS;
  const arrivalList = useMemo(() => arrivalRows(arrivals.data?.data ?? [], today, noShowIds), [arrivals.data, today, noShowIds]);
  const departureList = useMemo(() => departureRows(inHouse.data?.data ?? [], today), [inHouse.data, today]);
  const inHouseList = useMemo(() => inHouseRows(inHouse.data?.data ?? []), [inHouse.data]);
  // Do core, com o "desde" do analytics quando ele responde (resposta 1 do Gabriel, 26/11).
  const cleaning = useMemo(() => cleaningRows(rooms.data ?? [], alerts.data?.cleaning), [rooms.data, alerts.data]);

  // A fita só se monta com as três fontes: sem as chegadas, o quarto reservado aparecia "Livre, pronto
  // para vender" sem aviso nenhum (🟡1 do qa-redteam da F3).
  const strip = useMemo(
    () => (rooms.data && arrivals.data && inHouse.data ? hotelStrip(rooms.data, arrivalList, inHouse.data.data, today) : null),
    [rooms.data, arrivals.data, inHouse.data, arrivalList, today],
  );

  // Sem rede (CA-11.h): bloco sem dado diz "sem conexão" em vez de "Carregando…" sem fim. O erro
  // também só aparece sem dado: com Wi-Fi sem internet o onlineManager diz online, o refetch do
  // minuto falha, e a lista já carregada era trocada pelo erro (🟡-2 do qa-redteam de 22/11).
  const arrivalsLoad = loadState(arrivals);
  const inHouseLoad = loadState(inHouse);
  const alertsLoad = loadState(alerts);
  const roomsLoad = loadState(rooms);
  const stripSources = [rooms, arrivals, inHouse] as const;
  const stripLoads = [roomsLoad, arrivalsLoad, inHouseLoad];
  // O erro de qualquer das três, só enquanto falta o dado dela. A mensagem diz que é a fita que não monta.
  const stripFailed = stripSources.find((q) => q.data === undefined && q.error);
  const stripError = stripFailed ? new Error(`Não foi possível montar a fita dos quartos. ${stripFailed.error!.message}`) : null;
  // A outra metade do 🟡-2: o dado fica, mas o bloco avisa que pode estar velho (isStale).
  const stale = (q: Parameters<typeof isStale>[0]) => isStale(q, online);

  const noShowCount = arrivalList.filter((a) => a.noShowRisk).length;
  const lateDepartures = departureList.filter((d) => d.late).length;
  const attention = attentionItems({
    noShow: noShowCount,
    maintenance: strip?.counts.maintenance ?? 0,
    lateDepartures,
    cleaning: cleaning.length,
    pendingTooLong: alerts.data?.pendingTooLong ?? 0,
  });
  const attentionTotal = attention.reduce((n, a) => n + a.count, 0);

  return (
    // Coluna de até 1440 px do main, com os blocos em no máximo 2 colunas (protótipo de 22/11, R-7).
    <div className="space-y-4">
      <PageHeader title="Hoje" context={formatDateBR(today)} />

      {/* Mesmo tom e ícone da faixa da comanda; o texto é do painel, que não tem fila. */}
      <ConnectionBanner offline={!online}>
        <OfflineStrip>
          <span className="font-semibold">Sem conexão:</span> o painel mostra o último dado carregado e atualiza quando a rede voltar.
        </OfflineStrip>
      </ConnectionBanner>

      <HotelStripView
        strip={strip}
        sold={strip && arrivals.data ? soldToday(strip.floors.flatMap((f) => f.rooms), arrivalList) : null}
        isLoading={stripLoads.some((l) => l.isLoading)}
        isOffline={stripLoads.some((l) => l.isOffline)}
        error={stripError}
        stale={stale(rooms)}
        onRetry={() => stripSources.forEach((q) => q.data === undefined && void q.refetch())}
      />

      {/* Fixo no alto da área visível: no celular a ação acontece lá embaixo da lista, e o
          resultado precisa aparecer onde o olho está — a linha some quando a lista recarrega. */}
      {feedback && (
        <div className="sticky top-2 z-20 flex items-start gap-2 rounded-md bg-white shadow-md">
          <div className="min-w-0 flex-1">
            <Notice tone={feedback.kind === 'error' ? 'error' : 'success'}>{feedback.text}</Notice>
          </div>
          <Button variant="ghost" className="shrink-0 desk:h-9 desk:min-h-0 xl:text-sm" onClick={() => setFeedback(null)}>
            Fechar
          </Button>
        </div>
      )}

      {/* Atenção (CA-05.3.c): o que pede ação agora, com cor + rótulo. */}
      <section aria-labelledby="atencao-titulo" className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 id="atencao-titulo" className="flex items-baseline gap-2 text-section text-gray-900">
          Atenção
          {attentionTotal > 0 && <CountPill count={attentionTotal} />}
        </h2>
        {/* Os chips que vêm do core (manutenção, saída atrasada) ficam mesmo com o analytics fora; o aviso do
            analytics vale só para os dele (🟡4 do qa-redteam da F3: o título dizia "Atenção 3" sobre o erro). */}
        {alertsLoad.isOffline ? (
          <p className="py-2 text-sm text-gray-700">Sem conexão. Os alertas aparecem quando a rede voltar.</p>
        ) : alerts.isPending ? (
          <Spinner label="Carregando alertas…" />
        ) : alerts.isError && !alerts.data ? (
          <ErrorState message={alerts.error.message} onRetry={() => alerts.refetch()} />
        ) : (
          stale(alerts) && <StaleNotice onRetry={() => alerts.refetch()} />
        )}
        {/* Grade de 2 colunas no celular, com o texto curto; em linha a partir do sm (estudo de 22/11). */}
        <ul className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-800 sm:flex sm:flex-wrap">
          {attention.map((item) => (
            <AttentionChip key={item.id} item={item} />
          ))}
          {attention.length === 0 && alerts.data && <li className="col-span-2 py-2 text-gray-700">Nada pedindo atenção agora.</li>}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TodayBlock
          id="chegadas"
          title="Chegadas"
          icon={LogIn}
          alert={noShowCount > 0 ? { tone: 'maintenance', text: `${noShowCount} sem pagamento` } : undefined}
          caption="Entrada hoje, ainda sem check-in — e as atrasadas"
          count={arrivals.data ? arrivalList.length : undefined}
          isLoading={arrivalsLoad.isLoading}
          isOffline={arrivalsLoad.isOffline}
          error={arrivals.data ? null : arrivals.error}
          stale={stale(arrivals)}
          onRetry={() => arrivals.refetch()}
          isEmpty={arrivalList.length === 0}
          empty={{
            title: 'Nenhuma chegada para hoje.',
            description: 'Quem chegar sem reserva entra por uma reserva nova.',
            action: <ButtonLink to="/reservas/nova">Nova reserva</ButtonLink>,
          }}
          truncated={arrivals.data && { shown: arrivals.data.data.length, total: arrivals.data.total }}
        >
          <RowList items={arrivalList}>
            {(row) => <ArrivalItem key={row.reservation.id} row={row} today={today} onResult={setFeedback} />}
          </RowList>
        </TodayBlock>

        <TodayBlock
          id="saidas"
          title="Saídas"
          icon={LogOut}
          alert={lateDepartures > 0 ? { tone: 'cleaning', text: lateDepartures === 1 ? '1 atrasada' : `${lateDepartures} atrasadas` } : undefined}
          caption="Saída hoje — e as atrasadas, que continuam na casa"
          count={inHouse.data ? departureList.length : undefined}
          isLoading={inHouseLoad.isLoading}
          isOffline={inHouseLoad.isOffline}
          error={inHouse.data ? null : departuresError(inHouse.error)}
          stale={stale(inHouse)}
          onRetry={() => inHouse.refetch()}
          isEmpty={departureList.length === 0}
          empty={{ title: 'Nenhuma saída hoje.', description: 'Os hóspedes com saída marcada para hoje aparecem aqui.' }}
          truncated={inHouse.data && { shown: inHouse.data.data.length, total: inHouse.data.total }}
        >
          <RowList items={departureList}>
            {(row) => <DepartureItem key={row.reservation.id} row={row} onResult={setFeedback} />}
          </RowList>
        </TodayBlock>

        <TodayBlock
          id="na-casa"
          title="Na casa"
          icon={BedDouble}
          caption="Hóspedes com check-in feito"
          count={inHouse.data ? inHouseList.length : undefined}
          isLoading={inHouseLoad.isLoading}
          isOffline={inHouseLoad.isOffline}
          error={inHouse.data ? null : inHouse.error}
          stale={stale(inHouse)}
          onRetry={() => inHouse.refetch()}
          isEmpty={inHouseList.length === 0}
          empty={{ title: 'Nenhum hóspede na casa.', description: 'Quem fizer check-in aparece aqui.' }}
        >
          <RowList items={inHouseList}>
            {(r) => <InHouseItem key={r.id} reservation={r} />}
          </RowList>
        </TodayBlock>

        <TodayBlock
          id="limpeza"
          title="Em limpeza"
          icon={Sparkles}
          caption="Quartos que saíram e ainda não voltaram para a venda"
          count={rooms.data ? cleaning.length : undefined}
          isLoading={roomsLoad.isLoading}
          isOffline={roomsLoad.isOffline}
          error={rooms.data ? null : rooms.error}
          stale={stale(rooms)}
          onRetry={() => rooms.refetch()}
          isEmpty={cleaning.length === 0}
          empty={{ title: 'Nenhum quarto em limpeza.', description: 'O quarto entra aqui no check-out.' }}
        >
          <RowList items={cleaning}>
            {(room) => <CleaningItem key={room.id} room={room} onResult={setFeedback} />}
          </RowList>
        </TodayBlock>
      </div>
    </div>
  );
}

const DOT = { maintenance: 'bg-status-maintenance', cleaning: 'bg-status-cleaning', booked: 'bg-status-booked' } as const;

/**
 * Um item do Atenção: ponto + contagem + texto, levando ao lugar da ação. No celular vai o texto curto
 * na tela, e o leitor de tela continua com o inteiro.
 */
function AttentionChip({ item }: { item: AttentionItemData }) {
  const content = (
    <>
      <span className={cn('size-2.5 shrink-0 rounded-full', DOT[item.tone])} aria-hidden="true" />
      <strong className="tabular-nums">{item.count}</strong>
      <span className="sr-only sm:not-sr-only">{item.long}</span>
      <span aria-hidden="true" className="leading-tight sm:hidden">
        {item.short}
      </span>
    </>
  );
  const chip =
    'flex min-h-touch items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:rounded-full desk:min-h-0 xl:py-1.5';
  return (
    <li className="min-w-0">
      {item.to ? (
        <Link to={item.to} className={chip}>
          {content}
        </Link>
      ) : (
        <a href={item.href} className={chip}>
          {content}
        </a>
      )}
    </li>
  );
}
