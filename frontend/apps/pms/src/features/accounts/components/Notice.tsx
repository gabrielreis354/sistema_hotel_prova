import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Aviso que não é erro: conta fechada, lançamento de outro usuário parado no aparelho. Local por
 * enquanto, como o ErrorState: promove para o @hotel/ui no segundo módulo que precisar.
 *
 * `focus` leva o foco ao aviso quando ele nasce junto com a tela: leitor de tela não anuncia uma
 * região `status` que já chega preenchida (🟢-1 do qa-redteam).
 */
export function Notice({ children, focus = false }: { children: ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={focus ? -1 : undefined}
      className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
    >
      {children}
    </p>
  );
}
