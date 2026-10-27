import type { ReactNode } from 'react';

/**
 * Aviso que não é erro: conta fechada, lançamento de outro usuário parado no aparelho. Local por
 * enquanto, como o ErrorState: promove para o @hotel/ui no segundo módulo que precisar.
 */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
      {children}
    </p>
  );
}
