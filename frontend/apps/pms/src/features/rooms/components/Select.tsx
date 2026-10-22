import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@hotel/ui';

/**
 * Lista de escolha. O @hotel/ui não tem `Select`, então ele nasce local (regra de promoção do
 * CATALOGO.md) com o mesmo visual do `Input`: alvo de 48px no celular, foco visível e erro
 * por aria-invalid. O elemento nativo cru fica só aqui dentro — as telas usam este componente.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select // qa-allow: ui
      ref={ref}
      className={cn(
        'min-h-touch w-full rounded-md md:min-h-0 border border-gray-300 bg-white px-3 py-2 text-base',
        'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        'aria-[invalid=true]:border-status-maintenance aria-[invalid=true]:ring-status-maintenance',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
