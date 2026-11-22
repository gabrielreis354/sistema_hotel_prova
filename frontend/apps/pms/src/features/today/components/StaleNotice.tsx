import { Button } from '@hotel/ui';

/**
 * Dado na tela, mas o último refetch falhou com o aparelho "online" (Wi-Fi conectado sem
 * internet, captive portal vencido). O `onlineManager` não percebe esse caso, então a faixa do
 * topo não aparece: sem este aviso a recepção via a lista velha como se estivesse em dia e podia
 * atender uma chegada que outro recepcionista já atendeu (revisão dos PRs da SPEC-11, 22/11).
 *
 * O dado continua na tela (CA-11.h); o aviso só diz que pode estar velho e oferece o refetch.
 */
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-status-cleaning/10 px-3 py-1.5">
      <p className="text-sm text-gray-900">Não foi possível atualizar. Mostrando o último dado carregado.</p>
      <Button variant="ghost" className="desk:h-9 desk:min-h-0 xl:text-sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
