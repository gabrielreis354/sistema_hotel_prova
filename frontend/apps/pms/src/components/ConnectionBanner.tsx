import { useEffect, useState, type ReactNode } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Região viva da faixa de "sem conexão", comum à comanda e ao painel Hoje (SPEC-11, T-11.4).
 *
 * Leitor de tela só anuncia o que MUDA dentro de uma região viva que já existia. Por isso a
 * região `status` nasce sempre vazia e o texto só entra depois da montagem (efeito). Assim a
 * faixa é anunciada também quando a tela abre já sem rede (🟡-2 do red team de 15/11), e não
 * só quando a rede cai com a tela aberta.
 *
 * Por que não mover o foco: tiraria a pessoa do lugar em que está na tela, e o aviso não pede
 * ação. Ele é informativo, e a região viva basta. O custo é a faixa aparecer um quadro depois.
 */
export function ConnectionBanner({ offline, children }: { offline: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div role="status" aria-live="polite">
      {mounted && offline && children}
    </div>
  );
}

/**
 * A faixa em si, comum à comanda e ao painel: fundo tingido no âmbar da fila e texto gray-900,
 * bem acima de 4,5:1. O sinal é o texto, que começa com "Sem conexão"; o ícone é decorativo
 * (2,9:1 no âmbar do token) e vem antes, no lugar de uma faixa lateral, que a skill de design do
 * projeto recusa em aviso (Impeccable, reference/craft-floor.md; repasse de 17/11, PR 184).
 * Compacta (text-sm, py-1.5) para não empurrar o conteúdo para fora da tela no celular.
 */
export function OfflineStrip({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-status-cleaning/10 px-3 py-1.5 text-sm leading-snug text-gray-900">
      <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-status-cleaning" />
      <span>{children}</span>
    </p>
  );
}
