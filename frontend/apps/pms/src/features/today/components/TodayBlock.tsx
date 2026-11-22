import type { ReactNode } from 'react';
import { Card, EmptyState, ErrorState, Spinner } from '@hotel/ui';
import { StaleNotice } from './StaleNotice.js';

interface TodayBlockProps {
  id: string;
  title: string;
  /** Contagem do bloco no título (CA-05.3.e); undefined enquanto carrega ou com erro. */
  count?: number;
  /** Uma linha sob o título: o que entra no bloco. */
  caption: string;
  isLoading: boolean;
  /** Sem rede e sem dado: diz isso em vez de "Carregando…" sem fim ou do vazio falso (CA-11.h). */
  isOffline?: boolean;
  error: Error | null;
  /** Há dado, mas o último refetch falhou com o aparelho online: o dado pode estar velho. */
  stale?: boolean;
  onRetry: () => void;
  isEmpty: boolean;
  empty: { title: string; description?: string; action?: ReactNode };
  /** O servidor tinha mais do que veio (teto por bloco): avisar em vez de esconder. */
  truncated?: { shown: number; total: number };
  children: ReactNode;
}

/**
 * Moldura de cada bloco do painel com os quatro estados — carregando, erro, vazio e dados.
 * Cada bloco falha sozinho: o `/analytics` fora do ar não tira as chegadas da recepção.
 */
export function TodayBlock({ id, title, count, caption, isLoading, isOffline = false, error, stale = false, onRetry, isEmpty, empty, truncated, children }: TodayBlockProps) {
  let body: ReactNode;
  if (isOffline) body = <p className="py-2 text-sm text-gray-700">Sem conexão. A lista aparece quando a rede voltar.</p>;
  else if (isLoading) body = <Spinner label={`Carregando ${title.toLowerCase()}…`} />;
  else if (error) body = <ErrorState message={error.message} onRetry={onRetry} />;
  else if (isEmpty) body = <EmptyState title={empty.title} description={empty.description} action={empty.action} />;
  else body = children;

  return (
    <section aria-labelledby={`${id}-titulo`}>
      <Card className="h-full space-y-2 p-4">
        <header>
          <h2 id={`${id}-titulo`} className="flex items-baseline gap-2 text-section text-gray-900">
            {title}
            {count !== undefined && (
              <span className="rounded-full bg-gray-100 px-2 text-sm font-semibold tabular-nums text-gray-800">
                {count}
                <span className="sr-only"> {count === 1 ? 'item' : 'itens'}</span>
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-600">{caption}</p>
        </header>
        {truncated && truncated.total > truncated.shown && (
          <p className="text-xs text-gray-700">
            Mostrando {truncated.shown} de {truncated.total}. A lista completa está em Reservas.
          </p>
        )}
        {stale && <StaleNotice onRetry={onRetry} />}
        {body}
      </Card>
    </section>
  );
}
