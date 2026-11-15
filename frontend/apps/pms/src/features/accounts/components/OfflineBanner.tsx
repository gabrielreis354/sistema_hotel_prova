import { useEffect, useState } from 'react';
import { offlineBannerText } from '../connection.js';

/**
 * O texto da faixa de "sem conexão". Separado da região viva para poder ser renderizado e
 * testado sozinho.
 *
 * Mesmo desenho do `Notice` do @hotel/ui (borda à esquerda, fundo tingido, texto gray-900, bem
 * acima de 4,5:1), no tom âmbar da fila. A cor não é o sinal: o texto começa com "Sem conexão".
 * Compacta (text-sm, py-1.5) para não empurrar o cardápio para fora da tela no celular.
 */
export function OfflineNotice({ waiting }: { waiting: number }) {
  const text = offlineBannerText(waiting);
  return (
    <p className="rounded-md border-l-4 border-status-cleaning bg-status-cleaning/10 px-3 py-1.5 text-sm leading-snug text-gray-900">
      <span className="font-semibold">{text.lead}</span> {text.message}
      {text.waiting && <span className="font-medium tabular-nums"> {text.waiting}</span>}
    </p>
  );
}

/**
 * Faixa de "sem conexão" da comanda. Não bloqueia o cardápio: a fila guarda o toque e envia
 * quando a rede volta, a faixa só avisa.
 *
 * Leitor de tela só anuncia o que MUDA dentro de uma região viva que já existia. Por isso a
 * região `status` nasce sempre vazia e o texto só entra depois da montagem (efeito). Assim a
 * faixa é anunciada também quando a conta abre já sem rede (🟡-2 do red team de 15/11), e não
 * só quando a rede cai com a tela aberta.
 *
 * Por que não o `focus` do `Notice` local: mover o foco tiraria o garçom do lugar em que está
 * na tela a cada conta aberta sem rede, e o aviso não pede ação. Ele é informativo, como o
 * `status` do rodapé, e a região viva basta. O custo é a faixa aparecer um quadro depois da
 * conta, só na abertura.
 */
export function OfflineBanner({ online, waiting }: { online: boolean; waiting: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div role="status" aria-live="polite">
      {mounted && !online && <OfflineNotice waiting={waiting} />}
    </div>
  );
}
