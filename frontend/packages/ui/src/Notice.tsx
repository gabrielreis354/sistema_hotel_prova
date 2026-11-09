import { forwardRef, type ReactNode } from 'react';
import { cn } from './cn.js';

const NOTICE_TONE = {
  success: 'border-status-occupied bg-status-occupied/10',
  error: 'border-status-maintenance bg-status-maintenance/10',
} as const;

export type NoticeTone = keyof typeof NOTICE_TONE;

/**
 * Aviso de resultado (sucesso ou erro). O texto é `gray-900` sobre o fundo tingido — o verde
 * e o vermelho do preset não passam de 4,5:1 sobre o próprio tom claro (3,0 e 4,1). A cor fica
 * na borda e no fundo; a leitura fica no texto, que diz o que aconteceu.
 *
 * Promovido de `features/reservations/components/primitives.tsx` na T-05.3.
 */
export const Notice = forwardRef<HTMLParagraphElement, { tone: NoticeTone; children: ReactNode; className?: string }>(
  ({ tone, children, className }, ref) => (
    <p
      ref={ref}
      tabIndex={-1}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border-l-4 p-2 text-sm text-gray-900 focus:outline-none', NOTICE_TONE[tone], className)}
    >
      {children}
    </p>
  ),
);
Notice.displayName = 'Notice';
