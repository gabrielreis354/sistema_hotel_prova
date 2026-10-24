import { forwardRef, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { formatBRL, type Cents } from '@hotel/domain';
import { Button, Card, cn } from '@hotel/ui';

/**
 * Peças pequenas do módulo de reservas. Todas são candidatas do CATALOGO.md (`Money`,
 * `ErrorState`) e nascem aqui pela regra de promoção — sobem no segundo módulo que precisar.
 */

const LINK_VARIANT = {
  primary: 'bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400',
} as const;

/**
 * Navegação com cara de botão. É `Link` de verdade (abre em nova aba, botão do meio), e não
 * `<Link><Button/></Link>`, que aninha dois elementos interativos.
 */
export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: LinkProps & { variant?: keyof typeof LINK_VARIANT }) {
  return (
    <Link
      className={cn(
        'inline-flex min-h-touch items-center justify-center rounded-md px-4 text-base font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        LINK_VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Valor em reais: alinhado à direita pelo pai, algarismos tabulares, sempre duas casas. */
export function Money({ cents, className }: { cents: Cents; className?: string }) {
  return <span className={cn('whitespace-nowrap tabular-nums', className)}>{formatBRL(cents)}</span>;
}

/** Erro que diz o que fazer: a mensagem e a ação de tentar de novo. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 border-status-maintenance/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p role="alert" className="text-sm text-status-maintenance">
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="compact" className="min-h-touch md:min-h-0" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </Card>
  );
}

const NOTICE_TONE = {
  success: 'border-status-occupied bg-status-occupied/10',
  error: 'border-status-maintenance bg-status-maintenance/10',
} as const;

/**
 * Aviso de resultado (sucesso ou erro). O texto é `gray-900` sobre o fundo tingido — o verde
 * e o vermelho do preset não passam de 4,5:1 sobre o próprio tom claro (3,0 e 4,1). A cor fica
 * na borda e no fundo; a leitura fica no texto, que diz o que aconteceu.
 */
export const Notice = forwardRef<HTMLParagraphElement, { tone: keyof typeof NOTICE_TONE; children: ReactNode }>(
  ({ tone, children }, ref) => (
    <p
      ref={ref}
      tabIndex={-1}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border-l-4 p-2 text-sm text-gray-900 focus:outline-none', NOTICE_TONE[tone])}
    >
      {children}
    </p>
  ),
);
Notice.displayName = 'Notice';

/** Cabeçalho de página: título à esquerda, ação à direita (quebra no celular). */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

/** Link de volta, discreto, acima do conteúdo. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-touch items-center text-sm text-brand hover:underline md:min-h-0 md:py-1">
      {children}
    </Link>
  );
}

/** Título de bloco dentro de um cartão. */
export function CardHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-gray-800">{children}</h2>;
}

/** Rótulo pequeno + valor, para fichas de dados. */
export function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900">{children}</dd>
    </div>
  );
}
