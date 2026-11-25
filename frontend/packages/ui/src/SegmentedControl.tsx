import { cn } from './cn.js';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

/**
 * Escolha de uma opção entre poucas, que filtra o que está embaixo (período das reservas, meses do
 * gráfico). Não é ação: o ativo fica tingido com a marca, e não no verde sólido do botão principal, que
 * diz "faça isto" (GUIA_UI_CORPORATIVA, regra 2). Nasceu na F5 da SPEC-10 (25/11) com dois usos, a lista
 * de reservas e os Indicadores, que tinham botões primário/secundário no lugar.
 *
 * Botões com `aria-pressed`, num `role="group"` com nome: o Tab passa por cada um, como antes. 48 px no
 * toque e compacto com mouse (desk, R-3).
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: V | null;
  options: readonly SegmentOption<V>[];
  onChange: (value: V) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex flex-wrap rounded-md border border-gray-300 bg-white p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-touch rounded px-3 text-sm font-medium transition-colors desk:h-9 desk:min-h-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              active ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-gray-100',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
