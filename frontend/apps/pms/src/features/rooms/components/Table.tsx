import type { ReactNode } from 'react';
import { Card, cn } from '@hotel/ui';

/**
 * Tabela densa do balcão. Nasce local (CATALOGO.md: `Table` é candidato a promoção) — as
 * duas listas deste módulo usam; quem precisar num segundo módulo promove para @hotel/ui.
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
    // Mesmo visual do cabeçalho das tabelas de hóspedes, que ainda copiam a string à mão: quando
    // hóspedes adotar este Table, a cópia some (pendência registrada no relatório da T-05.1).
    <thead className={cn('border-b border-gray-200', 'bg-gray-50 text-gray-500')}>
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
