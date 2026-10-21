import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, cn, type ButtonProps } from '@hotel/ui';
import { READ_ONLY_REASON } from '../roomRules.js';
import { READ_ONLY_NOTICE_ID } from './ReadOnlyNotice.js';

// 48px no celular (o gerente consulta e o admin corrige andando), compacto na tabela do
// desktop — os dois contextos físicos do DESIGN_PMS.md §5.
const RESPONSIVE = 'md:h-9 md:min-h-0 md:px-3 md:text-sm';

/**
 * Botão de escrita. Sem permissão ele continua na tela, desabilitado, com o motivo em
 * `title` e ligado por aria-describedby à faixa de modo consulta — não some (princípio 11).
 */
export function WriteButton({
  canWrite,
  blockedReason,
  className,
  ...props
}: ButtonProps & { canWrite: boolean; blockedReason?: string | null }) {
  const reason = !canWrite ? READ_ONLY_REASON : blockedReason ?? undefined;
  return (
    <Button
      {...props}
      disabled={props.disabled || !!reason}
      title={reason}
      aria-describedby={!canWrite ? READ_ONLY_NOTICE_ID : props['aria-describedby']}
      className={cn(RESPONSIVE, className)}
    />
  );
}

/**
 * "Editar" da linha. É navegação, então é Link (abre em nova aba) — CATALOGO.md: Button que
 * só navega quebra isso. Sem permissão vira botão desabilitado com motivo.
 */
export function EditAction({ to, canWrite, label }: { to: string; canWrite: boolean; label: string }) {
  if (!canWrite) {
    return (
      <WriteButton canWrite={false} variant="ghost" aria-label={label}>
        Editar
      </WriteButton>
    );
  }
  return (
    <ActionLink to={to} label={label}>
      Editar
    </ActionLink>
  );
}

/** Navegação com cara de ação secundária e alvo de 48px no celular. */
export function ActionLink({ to, label, children }: { to: string; label?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        'inline-flex min-h-touch items-center justify-center rounded-md px-4 font-medium text-brand',
        'hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        RESPONSIVE,
      )}
    >
      {children}
    </Link>
  );
}
