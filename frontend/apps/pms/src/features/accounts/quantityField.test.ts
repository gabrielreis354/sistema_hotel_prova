import { describe, expect, it } from 'vitest';
import { fieldText, lastTapAt } from './quantityField.js';
import { undoAccessibleName } from './accountTotals.js';

// Ressalvas do qa-redteam da quantidade digitada (16/11).
describe('fieldText — o que o campo de quantidade mostra', () => {
  it('fora da edição, acompanha a fila', () => {
    expect(fieldText({ text: '3', quantity: 4, lastSent: 3, editing: false })).toBe('4');
  });

  it('editando, mantém o que o garçom digita (vazio no meio da digitação)', () => {
    expect(fieldText({ text: '', quantity: 6, lastSent: 6, editing: true })).toBe('');
  });

  // 🟢-1: no iOS o toque no cardápio pode não tirar o foco. A fila soma 1 e o campo seguia em 6.
  it('editando, um toque no produto que mudou a fila por fora atualiza o campo', () => {
    expect(fieldText({ text: '6', quantity: 7, lastSent: 6, editing: true })).toBe('7');
  });
});

describe('lastTapAt — a lista rola até o fim no toque, não na edição (🟡-4)', () => {
  const linha = (id: string, undoUntil: number) => ({ clientItemId: id, undoUntil });

  it('sem edição, é o undoUntil mais recente', () => {
    expect(lastTapAt([linha('a', 10), linha('b', 20)], null)).toBe(20);
  });

  it('a linha em edição não conta: cada tecla renova a janela dela, e a lista rolava para longe', () => {
    expect(lastTapAt([linha('a', 99), linha('b', 20)], 'a')).toBe(20);
  });

  it('sem linhas, zero', () => {
    expect(lastTapAt([], null)).toBe(0);
  });
});

describe('undoAccessibleName (🟢-2)', () => {
  it('diz que a edição também conta: a janela vale a partir do último toque ou edição', () => {
    expect(undoAccessibleName(1, 'Cerveja')).toBe('Desfazer: Cerveja, disponível por 5 segundos após o último toque ou edição');
  });
});
