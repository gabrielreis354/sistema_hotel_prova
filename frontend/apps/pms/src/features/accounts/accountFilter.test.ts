import { describe, it, expect } from 'vitest';
import { filterAccounts, menuCategories } from './accountFilter.js';
import type { Account, Product } from './accountsApi.js';

const accounts: Account[] = [
  { id: '1', type: 'TABLE', label: 'Mesa 5' },
  { id: '2', type: 'ROOM', label: 'Suíte 201' },
  { id: '3', type: 'DIRECT', label: 'Balcão — piscina' },
];

describe('filterAccounts — busca por rótulo e quarto (CA-05.5.a)', () => {
  it('termo vazio mostra todas', () => {
    expect(filterAccounts(accounts, '  ')).toHaveLength(3);
  });

  it('sem acento e sem caixa: "suite 2" acha a Suíte 201', () => {
    expect(filterAccounts(accounts, 'suite 2').map((a) => a.id)).toEqual(['2']);
  });

  it('pelo número do quarto ou da mesa', () => {
    expect(filterAccounts(accounts, '201').map((a) => a.id)).toEqual(['2']);
    expect(filterAccounts(accounts, '5').map((a) => a.id)).toEqual(['1']);
  });

  it('pelo tipo, mesmo que o rótulo não diga', () => {
    expect(filterAccounts([{ id: '9', type: 'DIRECT', label: 'Piscina' }], 'balcao').map((a) => a.id)).toEqual(['9']);
  });
});

describe('menuCategories', () => {
  it('categorias presentes, na ordem do cardápio, sem repetir', () => {
    const products: Product[] = [
      { id: 'a', category: 'DRINK' }, { id: 'b', category: 'DRINK' }, { id: 'c', category: 'FOOD' },
    ];
    expect(menuCategories(products)).toEqual(['DRINK', 'FOOD']);
  });
});
