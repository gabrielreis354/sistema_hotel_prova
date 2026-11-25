import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogIn, Sparkles, User, Wrench, X, type LucideIcon } from 'lucide-react';
import { formatDateBR } from '@hotel/domain';
import { Button, ErrorState, Spinner, StatusBadge, cn } from '@hotel/ui';
import { STRIP_LABEL, STRIP_TONES, type HotelStrip, type StripRoom, type StripTone } from '../hotelStrip.js';
import { formatPercent } from '../todayLogic.js';
import { StaleNotice } from './StaleNotice.js';

// Tom → classe inteira (o Tailwind faz purge estático; `bg-status-${tom}` sumiria do build).
const TILE: Record<StripTone, string> = {
  occupied: 'bg-status-occupied text-white',
  booked: 'bg-status-booked text-white',
  cleaning: 'bg-status-cleaning text-white',
  maintenance: 'strip-hatch text-white',
  // Livre é o "nada a fazer": claro, com contorno, para os estados com ação saltarem à vista.
  free: 'bg-ground ring-1 ring-inset ring-gray-300',
};
const DOT: Record<StripTone, string> = {
  occupied: 'bg-status-occupied',
  booked: 'bg-status-booked',
  cleaning: 'bg-status-cleaning',
  maintenance: 'strip-hatch',
  free: 'bg-ground ring-1 ring-inset ring-gray-400',
};
// Ícone nos estados com ação: o estado se lê sem distinguir a cor (DESIGN_PMS §5). Livre fica vazio.
const ICON: Partial<Record<StripTone, LucideIcon>> = { occupied: User, booked: LogIn, cleaning: Sparkles, maintenance: Wrench };

/** Nome acessível do quarto: número, estado e hóspede. O mesmo texto vai no `title` para o mouse. */
export function roomLabel(room: StripRoom): string {
  return [`Quarto ${room.number}`, STRIP_LABEL[room.tone], room.guest].filter(Boolean).join(', ');
}

const OVERLINE = 'text-overline uppercase text-gray-600';

/**
 * Fita do hotel (SPEC-10, F3; protótipo aprovado em 22/11): no topo, a ocupação e os vendidos; a
 * legenda conta e filtra; embaixo, os quartos por andar. Clicar num quarto abre o detalhe só com
 * informação e o caminho para a ação, que já existe na linha do bloco (decisão de 25/11).
 *
 * No celular a grade por andar fica recolhida atrás de "Ver quartos por andar": o resumo e a legenda
 * já dizem o essencial, e o painel tem limite de altura (CA-08.i).
 */
export function HotelStripView({
  strip,
  sold,
  isLoading,
  isOffline,
  error,
  stale = false,
  onRetry,
}: {
  strip: HotelStrip | null;
  /** Vendidos hoje (ocupados + chegadas de hoje); null enquanto as chegadas carregam. */
  sold: number | null;
  isLoading: boolean;
  isOffline: boolean;
  error: Error | null;
  stale?: boolean;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<StripTone | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openOnPhone, setOpenOnPhone] = useState(false);

  let body;
  if (!strip) {
    if (isOffline) body = <p className="text-sm text-gray-700">Sem conexão. Os quartos aparecem quando a rede voltar.</p>;
    else if (error) body = <ErrorState message={error.message} onRetry={onRetry} />;
    else body = isLoading ? <Spinner label="Carregando os quartos…" /> : null;
  }

  const rooms = strip?.floors.flatMap((f) => f.rooms) ?? [];
  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  return (
    // Nome pela própria seção: um <h2 class="sr-only"> como primeiro filho ganhava o espaço do space-y e
    // deixava um vão em cima do cartão. O id é o alvo do "em manutenção" do Atenção.
    <section id="fita" aria-label="Situação dos quartos" className="scroll-mt-4 space-y-4 rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      {stale && <StaleNotice onRetry={onRetry} />}
      {body ?? (
        strip && (
          <>
            <div className="grid grid-cols-2 items-end gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-8">
              <Figure label="Ocupação agora" value={formatPercent(strip.occupancyRate)} hint={`${strip.counts.occupied} de ${strip.total} quartos ocupados`} />
              <Figure label="Vendidos hoje" value={sold === null ? '—' : String(sold)} hint="ocupados + chegadas de hoje" />
              <div role="group" aria-label="Filtrar a fita por estado" className="col-span-2 flex flex-wrap gap-2 xl:ml-auto">
                {STRIP_TONES.map((tone) => (
                  <Button
                    key={tone}
                    variant="secondary"
                    size="compact"
                    aria-pressed={filter === tone}
                    className={cn('gap-2 font-normal', filter === tone && 'border-gray-900 ring-1 ring-gray-900')}
                    onClick={() => setFilter((f) => (f === tone ? null : tone))}
                  >
                    <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', DOT[tone])} />
                    {STRIP_LABEL[tone]}
                    <strong className="tabular-nums">{strip.counts[tone]}</strong>
                  </Button>
                ))}
              </div>
            </div>

            <Button
              variant="ghost"
              size="compact"
              aria-expanded={openOnPhone}
              aria-controls="fita-andares"
              className="w-full justify-between md:hidden"
              onClick={() => setOpenOnPhone((v) => !v)}
            >
              {openOnPhone ? 'Esconder os quartos' : 'Ver quartos por andar'}
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform motion-reduce:transition-none', openOnPhone && 'rotate-180')} />
            </Button>

            <div id="fita-andares" className={cn('gap-4 sm:grid-cols-2 lg:grid-cols-3', openOnPhone ? 'grid' : 'hidden md:grid')}>
              {strip.floors.map((floor) => (
                <div key={floor.label} className="space-y-1.5">
                  <span className={OVERLINE}>{floor.label}</span>
                  <ul className="grid grid-cols-5 gap-1">
                    {floor.rooms.map((room) => {
                      const Icon = ICON[room.tone];
                      const label = roomLabel(room);
                      return (
                        <li key={room.id}>
                          <button
                            type="button"
                            id={`fita-quarto-${room.id}`}
                            title={label}
                            aria-label={label}
                            aria-expanded={selectedId === room.id}
                            aria-controls="fita-detalhe"
                            onClick={() => setSelectedId((id) => (id === room.id ? null : room.id))}
                            className={cn(
                              'flex w-full flex-col items-stretch gap-0.5 rounded-md p-0.5 text-center transition-opacity motion-reduce:transition-none',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                              filter && filter !== room.tone && 'opacity-30',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-8 items-center justify-center rounded-md',
                                TILE[room.tone],
                                selectedId === room.id && 'outline outline-2 outline-offset-2 outline-gray-900',
                              )}
                            >
                              {Icon && <Icon data-tone-icon aria-hidden="true" className="size-4" strokeWidth={2} />}
                            </span>
                            <span className="truncate text-xs font-semibold tabular-nums text-gray-800">{room.number}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div id="fita-detalhe" aria-live="polite">
              {selected && (
                <RoomDetail
                  room={selected}
                  onClose={() => {
                    setSelectedId(null);
                    // O botão de fechar some com o painel: o foco volta ao quarto, senão cairia no body.
                    document.getElementById(`fita-quarto-${selected.id}`)?.focus();
                  }}
                />
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={OVERLINE}>{label}</span>
      <span className="text-3xl font-bold tabular-nums text-gray-900">{value}</span>
      <span className="text-xs text-gray-600">{hint}</span>
    </div>
  );
}

const STAY_LINK = 'text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/**
 * Detalhe do quarto: categoria, estado, hóspede e datas, e o caminho para a ação (a reserva, a linha
 * da chegada ou o bloco Em limpeza). Sem ação aqui dentro: a confirmação e o erro já moram na linha.
 */
export function RoomDetail({ room, onClose }: { room: StripRoom; onClose: () => void }) {
  const dates = room.checkIn && room.checkOut ? `${formatDateBR(room.checkIn)} → ${formatDateBR(room.checkOut)}` : null;
  let line: string;
  if (room.tone === 'occupied') line = room.guest ? `${room.guest} está no quarto.` : 'Ocupado.';
  else if (room.tone === 'booked') line = room.late ? `Chegada atrasada de ${room.guest ?? 'hóspede'}.` : `${room.guest ?? 'Hóspede'} chega hoje.`;
  else if (room.tone === 'cleaning') line = 'Saiu e ainda não voltou para a venda.';
  else if (room.tone === 'maintenance') line = 'Bloqueado para venda.';
  else line = 'Pronto para vender.';

  return (
    <div role="region" aria-label={`Detalhe do quarto ${room.number}`} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-ground p-3">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-md bg-white text-base font-bold tabular-nums text-gray-900 ring-1 ring-gray-200">
        {room.number}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm text-gray-900">{`Quarto ${room.number}`}</strong>
          {room.category && <span className="text-sm text-gray-600">· {room.category}</span>}
          <StatusBadge tone={room.tone} label={STRIP_LABEL[room.tone]} />
        </div>
        <p className="text-sm text-gray-800">{line}</p>
        {dates && <p className="text-sm tabular-nums text-gray-600">{dates}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {room.tone === 'booked' && (
            <a href="#chegadas-titulo" className={STAY_LINK}>
              Ir para a chegada
            </a>
          )}
          {room.tone === 'cleaning' && (
            <a href="#limpeza-titulo" className={STAY_LINK}>
              Ir para Em limpeza
            </a>
          )}
          {room.reservationId && (
            <Link to={`/reservas/${room.reservationId}`} className={STAY_LINK}>
              Abrir reserva
            </Link>
          )}
        </div>
      </div>
      <Button variant="ghost" size="compact" aria-label="Fechar o detalhe do quarto" className="min-w-touch shrink-0 px-2 desk:min-w-0" onClick={onClose}>
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
