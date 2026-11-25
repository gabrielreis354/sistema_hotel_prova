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
 * - `px-3`, o mesmo do `Th`: com `px-4` o cabeçalho ficava 4 px fora da célula (F5). Telefone e e-mail
 *   só no lg: no tablet a barra lateral deixa ~466 px, e o CPF partia no hífen (critique da F5).
 * - `h-12` (48 px) na linha: no layout de tabela a altura vale como mínimo, e garante o alvo
 *   de toque ≥ 44 px mesmo com uma linha de texto só.
 */
export function GuestRow({ guest, onOpen }: { guest: Guest; onOpen: (path: string) => void }) {
  const path = `/hospedes/${guest.id}`;

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as Element).closest('a')) return;
    // Arrastar ou dar duplo clique para copiar o CPF ou o e-mail não abre o hóspede
    // (🟡-2 do qa-redteam de 15/11).
    if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
    onOpen(path);
  }

  return (
    <tr onClick={handleRowClick} className="h-12 cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="px-3 py-2">
        {/* 48 px no toque também para o teclado e o leitor de tela: o link tinha 17 px (linha de base, F5). */}
        <Link
          to={path}
          className="flex min-h-touch items-center font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand desk:min-h-0"
        >
          {guest.full_name}
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">{formatCpf(guest.cpf) ?? '—'}</td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-gray-600 lg:table-cell">{guest.phone || '—'}</td>
      <td className="hidden px-3 py-2 text-gray-600 lg:table-cell">{guest.email || '—'}</td>
    </tr>
  );
}
