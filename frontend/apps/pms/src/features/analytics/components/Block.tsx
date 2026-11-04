import type { ReactNode } from 'react';
import { Card, EmptyState, ErrorState, Spinner } from '@hotel/ui';

interface BlockProps {
  title: string;
  /** O que foi consultado — período ou janela, sempre visível (RT-52). */
  caption: string;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  isEmpty: boolean;
  emptyText: string;
  /** Controles do bloco (ex.: janela de meses), à direita do título. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Moldura de cada indicador: título, período e os estados de carga, erro e vazio. Cada bloco
 * falha sozinho — um endpoint fora não apaga a tela inteira.
 */
export function Block({ title, caption, isLoading, error, onRetry, isEmpty, emptyText, actions, children }: BlockProps) {
  let body: ReactNode;
  if (isLoading) body = <Spinner />;
  else if (error) body = <ErrorState message={error.message} onRetry={onRetry} />;
  else if (isEmpty) body = <EmptyState title={emptyText} description="Troque o período para ver outros dados." />;
  else body = children;

  return (
    <Card className="space-y-3 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-gray-500">{caption}</p>
        </div>
        {actions}
      </header>
      {body}
    </Card>
  );
}
