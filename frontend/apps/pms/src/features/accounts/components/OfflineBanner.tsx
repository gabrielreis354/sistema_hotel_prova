import { offlineBannerText } from '../connection.js';

/**
 * Faixa de "sem conexão" da comanda. Não bloqueia o cardápio: a fila guarda o toque e envia
 * quando a rede volta, a faixa só avisa.
 *
 * A região `status` fica sempre na tela, vazia quando há rede: leitor de tela só anuncia o que
 * MUDA dentro de uma região viva que já existia — se ela nascesse junto com o aviso, a queda da
 * rede passaria calada.
 *
 * Mesmo desenho do `Notice` do @hotel/ui (borda à esquerda, fundo tingido, texto gray-900, bem
 * acima de 4,5:1), no tom âmbar da fila. A cor não é o sinal: o texto começa com "Sem conexão".
 * Compacta (text-sm, py-1.5) para não empurrar o cardápio para fora da tela no celular.
 */
export function OfflineBanner({ online, waiting }: { online: boolean; waiting: number }) {
  const text = offlineBannerText(waiting);
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <p className="rounded-md border-l-4 border-status-cleaning bg-status-cleaning/10 px-3 py-1.5 text-sm leading-snug text-gray-900">
          <span className="font-semibold">{text.lead}</span> {text.message}
          {text.waiting && <span className="font-medium tabular-nums"> {text.waiting}</span>}
        </p>
      )}
    </div>
  );
}
