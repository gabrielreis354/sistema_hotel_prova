import { offlineBannerText, type OfflineReason } from '../connection.js';
import { ConnectionBanner, OfflineStrip } from '../../../components/ConnectionBanner.js';

/**
 * O texto da faixa de "sem conexão" da comanda. Separado da região viva para poder ser renderizado
 * e testado sozinho. A aparência (cor, ícone, tamanho) é a do `OfflineStrip`.
 */
export function OfflineNotice({
  waiting,
  elsewhere = 0,
  reason = 'network',
}: {
  waiting: number;
  elsewhere?: number;
  reason?: OfflineReason;
}) {
  const text = offlineBannerText(waiting, elsewhere, reason);
  return (
    <OfflineStrip>
      <span className="font-semibold">{text.lead}</span> {text.message}
      {text.waiting && <span className="font-medium tabular-nums"> {text.waiting}</span>}
    </OfflineStrip>
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
  reason = 'network',
}: {
  offline: boolean;
  waiting: number;
  elsewhere?: number;
  reason?: OfflineReason;
}) {
  return (
    <ConnectionBanner offline={offline}>
      <OfflineNotice waiting={waiting} elsewhere={elsewhere} reason={reason} />
    </ConnectionBanner>
  );
}
