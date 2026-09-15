import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn.js';

const button = cva(
  // Base: alvo de toque >= 48px no mobile (comfortable). Foco visível (acessibilidade).
  'inline-flex items-center justify-center rounded-md font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50 tabular-nums',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400',
        ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-300',
        danger: 'bg-status-maintenance text-white hover:opacity-90 focus-visible:ring-status-maintenance',
      },
      size: {
        // comfortable = mobile (alvo 48px); compact = tabelas/rack no desktop.
        comfortable: 'min-h-touch px-4 text-base',
        compact: 'h-9 px-3 text-sm',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'comfortable',
      block: false,
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(button({ variant, size, block }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
