import { decimalToCents } from '@hotel/domain';
import { Button, EmptyState, ErrorState, Spinner, cn } from '@hotel/ui';
import type { Room } from '../reservationsApi.js';
import { Money } from './primitives.js';

interface RoomPickerProps {
  rooms: Room[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Ids escolhidos, na ordem da escolha. O primeiro é o quarto principal. */
  selectedIds: string[];
  onToggle: (roomId: string) => void;
}

/**
 * Quartos livres no período, vindos de `GET /rooms/available` (CA-05.2.c). O primeiro
 * escolhido é o principal da reserva; os demais vão como quartos extras (`reservation_rooms`).
 * Cada cartão é um botão de alternância (`aria-pressed`), com alvo de 48 px.
 */
export function RoomPicker({ rooms, isPending, isError, onRetry, selectedIds, onToggle }: RoomPickerProps) {
  if (isPending) return <Spinner label="Consultando quartos livres…" />;
  if (isError) return <ErrorState message="Não foi possível consultar os quartos livres." onRetry={onRetry} />;
  if (!rooms || rooms.length === 0) {
    return (
      <EmptyState
        title="Nenhum quarto livre neste período"
        description="Tente outras datas. Quartos em limpeza ou manutenção não entram na lista até serem liberados."
      />
    );
  }

  const sorted = [...rooms].sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '', 'pt-BR', { numeric: true }));

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {sorted.map((room) => {
        const id = room.id ?? '';
        const position = selectedIds.indexOf(id);
        const selected = position >= 0;
        const price = room.category?.price_per_night;
        return (
          <li key={id}>
            <Button
              variant="secondary"
              block
              aria-pressed={selected}
              onClick={() => onToggle(id)}
              className={cn(
                'h-auto min-h-touch justify-between gap-3 border px-4 py-3 text-left',
                // Retorno de toque: o cartão "afunda" 2% ao pressionar — confirma o toque no
                // celular, onde não há hover. Só transform, curto, e desligado em reduced-motion.
                'transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
                selected ? 'border-brand bg-brand/10 hover:bg-brand/15' : 'border-gray-200 bg-white hover:bg-gray-50',
              )}
            >
              <span className="min-w-0">
                <span className="block font-semibold tabular-nums text-gray-900">
                  Quarto {room.number}
                  {selected && (
                    <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-brand-fg">
                      {position === 0 ? 'Principal' : 'Extra'}
                    </span>
                  )}
                </span>
                <span className="block text-sm font-normal text-gray-600">
                  {room.category?.name ?? 'Sem categoria'}
                  {room.floor !== null && room.floor !== undefined ? ` · ${room.floor}º andar` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm">
                {price ? <Money cents={decimalToCents(price)} className="font-medium text-gray-900" /> : 'Sem tarifa'}
                <span className="block text-xs font-normal text-gray-500">por noite</span>
              </span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
