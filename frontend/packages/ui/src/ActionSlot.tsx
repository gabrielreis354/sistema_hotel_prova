import type { ReactNode } from 'react';
import { cn } from './cn.js';

/** Ação habilitada, ou desabilitada com o motivo (sempre presente quando `enabled` é false). */
export interface ActionState {
  enabled: boolean;
  reason?: string;
}

/**
 * Uma ação e, embaixo, o motivo quando ela não está disponível (RNF-026: desabilitada com
 * motivo, nunca some). O filho recebe o id do motivo para ligar por `aria-describedby`.
 *
 * Promovido do `ReservationDetailPage` na T-05.3 (painel Hoje, segundo uso).
 */
export function ActionSlot({
  id,
  state,
  className,
  children,
}: {
  id: string;
  state: ActionState;
  className?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      {children(state.enabled ? undefined : `${id}-motivo`)}
      {!state.enabled && (
        <p id={`${id}-motivo`} className="text-xs text-gray-600">
          {state.reason}
        </p>
      )}
    </div>
  );
}
