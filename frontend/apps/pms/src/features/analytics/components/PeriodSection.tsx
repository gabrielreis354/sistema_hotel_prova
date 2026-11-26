import { useId, type ReactNode } from 'react';

/**
 * Parte da página com o período que a governa no próprio título (F7 da SPEC-10): os meses ficavam
 * dentro do bloco de receita e mudavam a sazonalidade sem dizer; o De/Até ficava solto no meio da
 * página, abaixo da dobra. Fio em cima e título de seção, como o `Section` do @hotel/ui, com o
 * controle à direita (no celular, embaixo do título).
 */
export function PeriodSection({ title, control, children }: { title: string; control: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-gray-200 pt-4">
        {/* Rótulo de grupo (o da ficha do hóspede e do resumo da reserva), não o text-section: o
            título de cada bloco já usa a escala de seção, e os dois iguais achatavam a hierarquia. */}
        <h2 id={id} className="text-xs font-medium uppercase tracking-wide text-gray-600">
          {title}
        </h2>
        {control}
      </div>
      {children}
    </section>
  );
}
