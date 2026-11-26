import type { ReactNode } from 'react';
import { cn } from '@hotel/ui';

/**
 * Rodapé preso ao pé da tela da comanda: o total da conta (CA-05.5.d) e o "Abrir conta" da lista
 * (P1 do critique da F6: com muitas contas, o botão ia para o fim da lista e o garçom rolava duas
 * telas para abrir uma mesa).
 *
 * Fica logo acima da barra do celular (--tabbar da casca: 3rem, ou 0 para o garçom, que não tem
 * barra) mais a folga da barra de gestos (SPEC-10, R-4). No celular vai de borda a borda da tela; do
 * tablet em diante vira cartão na largura da coluna, sem passar das laterais (F6).
 *
 * O rodapé não encosta no pé da tela: 12 px do tablet em diante e 6 px no celular do garçom, que não
 * tem barra. A sombra sólida na cor do fundo tapa essa folga, senão a lista que rola por baixo aparecia
 * ali (26/11). Com a barra do celular (z-40) por cima, a sombra fica escondida atrás dela.
 */
export function StickyFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(var(--tabbar,3rem)+max(6px,env(safe-area-inset-bottom)))] z-10 -mx-4 border-t border-gray-200 bg-white px-4 py-3 md:bottom-3 md:mx-0 md:rounded-lg md:border shadow-[0_1rem_0_0_rgb(var(--color-ground))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
