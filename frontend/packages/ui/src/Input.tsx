import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Campo de texto padrão. Alvo confortável no mobile, foco visível, estado de erro via aria-invalid. */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full rounded-md border border-gray-300 px-3 py-2 text-base',
      'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
      'aria-[invalid=true]:border-status-maintenance aria-[invalid=true]:ring-status-maintenance',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
