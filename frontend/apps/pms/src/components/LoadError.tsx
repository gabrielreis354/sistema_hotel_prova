import { ErrorState, Notice } from '@hotel/ui';
import { isNotFound } from '../lib/http.js';
import { BackLink } from './links.js';

/**
 * O registro da tela não carregou (T-08.6: um molde só para reserva, hóspede e quartos, que tinham
 * três). 404 não tem "tentar de novo": o caminho é voltar. Falha de servidor ou de rede não é "não
 * encontrado", senão a recepção acha que o cadastro sumiu (qa-explorador de 16/11).
 *
 * `back` fica de fora quando a página já tem a volta no topo (formulários de quartos).
 */
export function LoadError({
  error,
  notFound,
  failed,
  onRetry,
  back,
}: {
  error: unknown;
  notFound: string;
  failed: string;
  onRetry: () => void;
  back?: { to: string; label: string };
}) {
  return (
    <div className="space-y-3">
      {isNotFound(error) ? <Notice tone="error">{notFound}</Notice> : <ErrorState message={failed} onRetry={onRetry} />}
      {back && <BackLink to={back.to}>{back.label}</BackLink>}
    </div>
  );
}
