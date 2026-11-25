import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { Card } from './feedback.js';

/**
 * Tabela densa do balcão. Nasceu local em quartos (T-05.1) e subiu na F5 da SPEC-10 (25/11), quando
 * reservas e hóspedes passaram a usá-la: as quatro listas tinham o cabeçalho copiado à mão.
 */
export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </Card>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    // gray-600: o gray-500 dava 4,4:1 sobre o gray-50 do cabeçalho (F5).
    <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
      <tr>{children}</tr>
    </thead>
  );
}

/** `align="right"` em coluna de valor: dinheiro alinhado à direita e com algarismos tabulares. */
export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th scope="col" className={cn('px-3 py-2 font-medium', align === 'right' && 'text-right', className)}>
      {children}
    </th>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">{children}</tr>;
}

export function Td({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td className={cn('px-3 py-2 align-middle md:py-1.5', align === 'right' && 'text-right tabular-nums', className)}>
      {children}
    </td>
  );
}
