import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn.js';

// Primário e danger indisponíveis ficam cinza, não a própria cor a 50%: o verde lavado do "Confirmar
// reserva" parecia meio habilitado (linha de base de 24/11, F4). Vence o disabled:opacity-50 da base pelo twMerge.
const UNAVAILABLE = 'disabled:bg-gray-200 disabled:text-gray-600 disabled:opacity-100';

const button = cva(
  // Base: alvo de toque >= 48px no mobile (comfortable). Foco visível (acessibilidade).
  'inline-flex items-center justify-center rounded-md font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
    // Sem tabular-nums: com a Inter carregada (T-08.1) ele alarga a pontuação ("check‑in"). Número em
    // coluna usa Money, que já é tabular.
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Anel de foco da marca nas três (SPEC-10 §10.6, ≥ 3:1): o gray-400 do secondary dava 2,5:1 e o
        // gray-300 do ghost ~1,5:1 (🟡 da linha de base de 24/11). Quem opera o balcão no teclado vê onde está.
        // Borda transparente no primário e no danger: a mesma caixa do secundário, e o atalho de período
        // não anda 2 px ao trocar de um para o outro (🟢 do qa-redteam da F2).
        primary: `border border-transparent bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand ${UNAVAILABLE}`,
        // Branco com borda, como o "Sair" do topo (decisão de 25/11): o gray-100 preenchido sumia sobre o
        // fundo areia da casca nova. A borda é decorativa (decisão de 25/11, SPEC-10 §10.6): quem diz que é
        // botão é o texto, e o foco tem o anel da marca. Por isso o gray-300 dos campos, sem a regra dos 3:1.
        secondary: 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-brand',
        ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-brand',
        danger: `border border-transparent bg-status-maintenance text-white hover:opacity-90 focus-visible:ring-status-maintenance ${UNAVAILABLE}`,
      },
      size: {
        // comfortable = mobile (alvo 48px); compact = tabelas/rack no desktop. O compact só encolhe
        // com mouse (desk = xl + pointer fine, SPEC-10 R-3): no toque continua com 48 px.
        comfortable: 'min-h-touch px-4 text-base',
        compact: 'min-h-touch px-3 text-sm desk:h-9 desk:min-h-0',
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

export type ButtonVariants = VariantProps<typeof button>;

/**
 * As classes do Button, para quem precisa da mesma cara em outro elemento — o `ButtonLink` do app,
 * que é `<a>` do roteador (T-08.6). O @hotel/ui não depende de react-router; só entrega as classes.
 */
export function buttonClasses(variants: ButtonVariants = {}, className?: string): string {
  return cn(button(variants), className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={buttonClasses({ variant, size, block }, className)} {...props} />
  ),
);
Button.displayName = 'Button';
