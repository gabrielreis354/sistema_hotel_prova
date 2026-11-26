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
 * Do tablet em diante o cartão fica 12 px acima do pé: a sombra sólida na cor do fundo tapa essa
 * folga, senão a lista que rola por baixo aparecia entre o cartão e a borda da tela (26/11).
 */
export function StickyFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(var(--tabbar,3rem)+max(6px,env(safe-area-inset-bottom)))] z-10 -mx-4 border-t border-gray-200 bg-white px-4 py-3 md:bottom-3 md:mx-0 md:rounded-lg md:border md:shadow-[0_1rem_0_0_rgb(var(--color-ground))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
