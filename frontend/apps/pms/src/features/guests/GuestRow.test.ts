import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { GuestRow } from './GuestRow.js';
import type { Guest } from './guestsApi.js';

// Ambiente node, sem DOM: a linha não tem hooks, então o elemento é inspecionado direto e o
// clique é entregue à `tr` com um alvo dublê que responde a `closest('a')` como o navegador.
type Cell = ReactElement<{ children: unknown }>;
type Row = ReactElement<{ onClick: (e: unknown) => void; className: string; children: [Cell, Cell, Cell, Cell] }>;

const guest = { id: 'g1', full_name: 'Ana Souza', cpf: '30000000014' } as Guest;

function render(onOpen = vi.fn()) {
  const row = GuestRow({ guest, onOpen }) as Row;
  const [nameCell, cpfCell] = row.props.children;
  return { row, nameCell, cpfCell, onOpen };
}

const clickOn = (row: Row, insideLink: boolean) =>
  row.props.onClick({ target: { closest: (sel: string) => (sel === 'a' && insideLink ? {} : null) } });

describe('GuestRow — a linha inteira abre o hóspede (CA-09.f)', () => {
  it('clicar na célula do CPF navega para o hóspede', () => {
    const { row, onOpen } = render();
    clickOn(row, false);
    expect(onOpen).toHaveBeenCalledWith('/hospedes/g1');
  });

  it('clique no nome fica com o Link: a linha não navega de novo', () => {
    const { row, nameCell, onOpen } = render();
    clickOn(row, true);
    expect(onOpen).not.toHaveBeenCalled();
    const link = nameCell.props.children as ReactElement<{ to: string }>;
    expect(link.props.to).toBe('/hospedes/g1');
  });

  it('selecionar texto na linha (para copiar o CPF) não abre o hóspede (🟡-2 do qa-redteam)', () => {
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => '300.000.000-14' }) });
    try {
      const { row, onOpen } = render();
      clickOn(row, false);
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('alvo de toque: linha com altura mínima de 48 px (h-12)', () => {
    expect(render().row.props.className).toContain('h-12');
  });

  it('CPF formatado e completo na lista; sem CPF mostra travessão', () => {
    expect(render().cpfCell.props.children).toBe('300.000.000-14');
    const semCpf = GuestRow({ guest: { ...guest, cpf: undefined }, onOpen: vi.fn() }) as Row;
    expect(semCpf.props.children[1].props.children).toBe('—');
  });
});
