import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Campo de texto padrão. Foco visível e estado de erro via aria-invalid. Alvo de 48 px no toque e altura
 * natural só com mouse (CA-08.g, R-3): media 42 px, e cada tela compensava com um TOUCH local (F2, 25/11).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'min-h-touch w-full rounded-md desk:min-h-0 border border-gray-300 px-3 py-2 text-base placeholder:text-gray-500',
      'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
      'aria-[invalid=true]:border-status-maintenance aria-[invalid=true]:ring-status-maintenance',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
