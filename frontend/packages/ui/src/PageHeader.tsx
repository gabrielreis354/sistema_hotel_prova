import type { ReactNode } from 'react';
import { cn } from './cn.js';

/**
 * Cabeçalho de página (SPEC-08, T-08.5; GUIA_UI_CORPORATIVA §4): título sempre no mesmo lugar e
 * tamanho, contexto curto embaixo (data, contagem, filtro ativo) e a ação principal no canto
 * superior direito. No celular, a ação vai logo abaixo do título, na largura toda.
 *
 * Nasceu em reservations/components/primitives.tsx e subiu já servindo a vários módulos.
 */
export function PageHeader({
  title,
  context,
  action,
  actionClassName,
  className,
}: {
  title: ReactNode;
  context?: ReactNode;
  action?: ReactNode;
  /** Para a ação que só existe em certas larguras: esconder o invólucro tira também o espaço do gap. */
  actionClassName?: string;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-title text-gray-900">{title}</h1>
        {context && <p className="text-sm text-gray-600 tabular-nums">{context}</p>}
      </div>
      {action && (
        <div className={cn('flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end', actionClassName)}>{action}</div>
      )}
    </header>
  );
}

/**
 * Bloco só de leitura: título de seção e um fio em cima, sem cartão (T-08.5). O `Card` fica para o
 * que é objeto próprio ou pede atenção — formulário, confirmação. Tudo em cartão achata a hierarquia.
 */
export function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3 border-t border-gray-200 pt-4', className)}>
      <h2 className="text-section text-gray-800">{title}</h2>
      {children}
    </section>
  );
}
