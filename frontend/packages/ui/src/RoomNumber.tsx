import { cn } from './cn.js';

/**
 * O número do quarto em destaque, à esquerda da linha ou do cabeçalho: a recepção acha a reserva pelo
 * quarto (protótipo do Hoje de 22/11). É decorativo: o texto ao lado já diz "Quarto 101". Número longo
 * corta com "…" e fica inteiro no `title`.
 *
 * Nasceu nas linhas do painel Hoje (F3) e subiu com o detalhe da reserva (F4), o segundo módulo.
 */
export function RoomNumber({ number, className }: { number: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      title={number}
      className={cn(
        'flex h-10 min-w-10 max-w-20 shrink-0 items-center justify-center rounded-md bg-ground px-1.5 text-sm font-bold tabular-nums text-gray-900 ring-1 ring-inset ring-gray-200',
        className,
      )}
    >
      <span className="truncate">{number}</span>
    </span>
  );
}
