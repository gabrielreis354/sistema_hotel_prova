import { WifiOff } from 'lucide-react';
import { offlineBannerText } from '../connection.js';
import { ConnectionBanner } from '../../../components/ConnectionBanner.js';

/**
 * O texto da faixa de "sem conexão". Separado da região viva para poder ser renderizado e
 * testado sozinho.
 *
 * Fundo tingido no tom âmbar da fila e texto gray-900, bem acima de 4,5:1. O sinal visual é o
 * ícone de sem rede antes do texto, não uma faixa lateral, que a skill de design do projeto
 * recusa em aviso (Impeccable, reference/craft-floor.md; repasse de 17/11, PR 184). O ícone é
 * decorativo, com 2,9:1 no âmbar do token: o sinal é o texto, que começa com "Sem conexão".
 * Compacta (text-sm, py-1.5) para não empurrar o cardápio para fora da tela no celular.
 */
export function OfflineNotice({ waiting, elsewhere = 0 }: { waiting: number; elsewhere?: number }) {
  const text = offlineBannerText(waiting, elsewhere);
  return (
    <p className="flex items-start gap-2 rounded-md bg-status-cleaning/10 px-3 py-1.5 text-sm leading-snug text-gray-900">
      <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-status-cleaning" />
      <span>
        <span className="font-semibold">{text.lead}</span> {text.message}
        {text.waiting && <span className="font-medium tabular-nums"> {text.waiting}</span>}
      </span>
    </p>
  );
}

/**
 * Faixa de "sem conexão" da comanda. Não bloqueia o cardápio: a fila guarda o toque e envia
 * quando a rede volta, a faixa só avisa. A região viva (e por que ela nasce vazia) está no
 * `ConnectionBanner`, que o painel Hoje também usa.
 */
export function OfflineBanner({
  offline,
  waiting,
  elsewhere = 0,
}: {
  offline: boolean;
  waiting: number;
  elsewhere?: number;
}) {
  return (
    <ConnectionBanner offline={offline}>
      <OfflineNotice waiting={waiting} elsewhere={elsewhere} />
    </ConnectionBanner>
  );
}
