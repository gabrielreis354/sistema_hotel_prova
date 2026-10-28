import { describe, it, expect } from 'vitest';
import { filterAccounts, menuCategories, openedAtLabel, openWithSameLabel, sortAccounts } from './accountFilter.js';
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

describe('sortAccounts — ordem estável da lista (P1 da revisão Impeccable)', () => {
  it('mais antiga primeiro: conta nova entra no fim e não empurra as outras', () => {
    const list: Account[] = [
      { id: 'b', label: 'Mesa 2', opened_at: '2026-10-26T15:00:00Z' },
      { id: 'a', label: 'Mesa 1', opened_at: '2026-10-26T14:00:00Z' },
    ];
    expect(sortAccounts(list).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('mesma hora de abertura: desempata pelo id, sempre na mesma ordem', () => {
    const at = '2026-10-26T14:00:00Z';
    const list: Account[] = [{ id: 'z', opened_at: at }, { id: 'c', opened_at: at }];
    expect(sortAccounts(list).map((a) => a.id)).toEqual(['c', 'z']);
    expect(sortAccounts([...list].reverse()).map((a) => a.id)).toEqual(['c', 'z']);
  });

  it('não altera a lista recebida (é o cache do TanStack Query)', () => {
    const list: Account[] = [{ id: 'b', opened_at: '2026-10-26T15:00:00Z' }, { id: 'a', opened_at: '2026-10-26T14:00:00Z' }];
    sortAccounts(list);
    expect(list.map((a) => a.id)).toEqual(['b', 'a']);
  });
});

describe('sortAccounts — mesas antes das suítes (🟡-5 do qa-redteam)', () => {
  it('contas do turno (mesa, balcão, day-use) primeiro; suítes, abertas no check-in, depois', () => {
    const list: Account[] = [
      { id: 's', type: 'ROOM', label: 'Suíte 201', opened_at: '2026-10-20T14:00:00Z' },
      { id: 'm', type: 'TABLE', label: 'Mesa 3', opened_at: '2026-10-26T22:00:00Z' },
      { id: 'b', type: 'DIRECT', label: 'Balcão', opened_at: '2026-10-26T21:00:00Z' },
    ];
    expect(sortAccounts(list).map((a) => a.id)).toEqual(['b', 'm', 's']);
  });
});

describe('openWithSameLabel — aviso de conta repetida (P1)', () => {
  const open: Account[] = [{ id: '1', label: 'Mesa 3' }, { id: '2', label: 'Suíte 201' }];

  it('acha a conta aberta com o mesmo nome, sem caixa, acento ou espaço sobrando', () => {
    expect(openWithSameLabel(open, '  mesa 3 ')?.id).toBe('1');
    expect(openWithSameLabel(open, 'suite 201')?.id).toBe('2');
  });

  it('nome parecido não é o mesmo nome', () => {
    expect(openWithSameLabel(open, 'Mesa 30')).toBeUndefined();
    expect(openWithSameLabel(open, '')).toBeUndefined();
  });

  it('o começo de um nome não avisa: digitar "Mesa" com a Mesa 3 aberta', () => {
    expect(openWithSameLabel(open, 'Mesa')).toBeUndefined();
  });

  it('campo em branco nunca avisa, nem com conta sem rótulo na lista', () => {
    expect(openWithSameLabel([{ id: 'x' }], '   ')).toBeUndefined();
  });
});

describe('openedAtLabel — hora de abertura no fuso do hotel (P1)', () => {
  const now = new Date('2026-10-26T20:00:00Z'); // 17:00 em Brasília

  it('aberta hoje: só a hora', () => {
    expect(openedAtLabel('2026-10-26T17:05:00Z', now)).toBe('aberta às 14:05');
  });

  it('aberta em outro dia: dia e hora', () => {
    expect(openedAtLabel('2026-10-25T23:30:00Z', now)).toBe('aberta em 25/10 às 20:30');
  });

  it('o dia é o do hotel, não o UTC: 01:00 UTC do dia 27 ainda é dia 26 em Brasília', () => {
    expect(openedAtLabel('2026-10-27T01:00:00Z', new Date('2026-10-27T02:00:00Z'))).toBe('aberta às 22:00');
  });

  it('sem data: nada', () => {
    expect(openedAtLabel(undefined, now)).toBe('');
  });
});
