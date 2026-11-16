import { ErrorState, Notice } from '@hotel/ui';
import { ApiError } from '../../lib/http.js';
import { BackLink } from '../../components/links.js';

/**
 * Hóspede que não carregou, na ficha e na edição (mesmo useGuest). 404 não tem "tentar de novo",
 * o caminho é voltar; falha de servidor ou de rede não é "não encontrado" — senão a recepção acha
 * que o cadastro sumiu. Mesmo molde da reserva inexistente (qa-explorador e redteam de 16/11).
 */
export function GuestLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {notFound ? (
        <Notice tone="error">Hóspede não encontrado — ele pode ter sido excluído.</Notice>
      ) : (
        <ErrorState message="Não foi possível carregar o hóspede." onRetry={onRetry} />
      )}
      <BackLink to="/hospedes">← Voltar para hóspedes</BackLink>
    </div>
  );
}
