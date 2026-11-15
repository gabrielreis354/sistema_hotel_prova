import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatCpf } from '@hotel/domain';
import type { Guest } from './guestsApi.js';

/**
 * Uma linha da lista de Hóspedes. A linha inteira abre o hóspede (CA-09.f): no celular só o
 * nome era clicável, numa faixa de 16 px.
 *
 * Padrão escolhido: `onClick` na `tr` + o nome como `Link` real.
 * - Teclado e leitor de tela usam o `Link` (a `tr` não recebe foco): um só alvo de tab por linha.
 * - Clique no próprio nome fica com o `Link` (ctrl/meio-clique abrem nova aba); a `tr` ignora
 *   cliques que vêm de dentro de um link, para não navegar duas vezes.
 * - Não usamos o pseudo-elemento esticado a partir do Link: depende de `position: relative` na
 *   `tr`, que o Safari antigo de iPhone ignora, e não dá para provar num teste sem layout.
 * - `h-12` (48 px) na linha: no layout de tabela a altura vale como mínimo, e garante o alvo
 *   de toque ≥ 44 px mesmo com uma linha de texto só.
 */
export function GuestRow({ guest, onOpen }: { guest: Guest; onOpen: (path: string) => void }) {
  const path = `/hospedes/${guest.id}`;

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as Element).closest('a')) return;
    onOpen(path);
  }

  return (
    <tr onClick={handleRowClick} className="h-12 cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="px-4 py-2">
        <Link to={path} className="font-medium text-brand hover:underline">
          {guest.full_name}
        </Link>
      </td>
      <td className="px-4 py-2 tabular-nums text-gray-600">{formatCpf(guest.cpf) ?? '—'}</td>
      <td className="hidden px-4 py-2 text-gray-600 sm:table-cell">{guest.phone || '—'}</td>
      <td className="hidden px-4 py-2 text-gray-600 sm:table-cell">{guest.email || '—'}</td>
    </tr>
  );
}
