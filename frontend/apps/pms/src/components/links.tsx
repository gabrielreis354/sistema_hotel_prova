import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { buttonClasses, cn, type ButtonVariants } from '@hotel/ui';

/**
 * Links compartilhados do app. Moravam no módulo de reservas e outros módulos importavam de lá; na
 * T-08.6 (decisão de 16/11) vieram para cá. O @hotel/ui entrega as classes do Button e o link fica no
 * app, que é quem tem o roteador.
 */

/**
 * Navegação com cara de botão. É `Link` de verdade (abre em nova aba, botão do meio), e não
 * `<Link><Button/></Link>`, que aninha dois elementos interativos. Mesmas classes do `Button`.
 */
export function ButtonLink({
  variant = 'primary',
  size,
  block,
  className,
  ...props
}: LinkProps & ButtonVariants) {
  return <Link className={buttonClasses({ variant, size, block }, className)} {...props} />;
}

/** Link de volta, discreto. 48 px até o xl (CA-08.g); compacto só no desktop. */
export function BackLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn('inline-flex min-h-touch items-center text-sm text-brand hover:underline xl:min-h-0 xl:py-1', className)}
    >
      {children}
    </Link>
  );
}
