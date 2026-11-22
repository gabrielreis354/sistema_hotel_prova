import { describe, expect, it } from 'vitest';
import { cleanQuantityText, fieldText, lastTapAt, nextQuantity, QUANTITY_ZERO_HINT, quantityTextInvalid } from './quantityField.js';
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

// 🟡-3 do qa-explorador de 22/11: o campo mostrava "10000" e a fila lançava 1000; "2,5" virava 2 e
// "0" virava 1, sem aviso. O campo agora só guarda o que pode ser lançado.
describe('cleanQuantityText — o campo mostra só o que pode ser lançado', () => {
  it('descarta o que não é dígito: vírgula, ponto, sinal, letra e espaço', () => {
    expect(cleanQuantityText('2,5')).toBe('25');
    expect(cleanQuantityText('3.')).toBe('3');
    expect(cleanQuantityText('-4')).toBe('4');
    expect(cleanQuantityText('6a ')).toBe('6');
  });

  it('para no número de dígitos do teto (9999): "10000" não chega a aparecer', () => {
    expect(cleanQuantityText('10000')).toBe('1000');
    expect(cleanQuantityText('9999')).toBe('9999');
  });

  // 🟢-4 do red team de 22/11: o maxLength cortava o texto cru antes da limpeza.
  it('colado: limpa antes de cortar, e tira zeros à esquerda', () => {
    expect(cleanQuantityText('R$ 10')).toBe('10');
    expect(cleanQuantityText('2.500')).toBe('2500');
    expect(cleanQuantityText('00010')).toBe('10');
    expect(cleanQuantityText('007')).toBe('7');
  });

  it('zero fica um zero só, para o campo poder avisar; vazio continua vazio', () => {
    expect(cleanQuantityText('000')).toBe('0');
    expect(cleanQuantityText('')).toBe('');
  });
});

describe('nextQuantity — o que cada tecla faz com o campo e a fila (ligação do onChange)', () => {
  it('número válido: o campo e a fila ficam iguais', () => {
    expect(nextQuantity('6', 1)).toEqual({ text: '6', quantity: 6, invalid: false });
    expect(nextQuantity('10000', 1)).toEqual({ text: '1000', quantity: 1000, invalid: false });
    expect(nextQuantity('2,5', 1)).toEqual({ text: '25', quantity: 25, invalid: false });
  });

  it('zero: a fila fica na quantidade anterior, e o campo fica marcado', () => {
    expect(nextQuantity('0', 3)).toEqual({ text: '0', quantity: 3, invalid: true });
  });

  it('vazio no meio da digitação: a fila fica na anterior, sem marca', () => {
    expect(nextQuantity('', 3)).toEqual({ text: '', quantity: 3, invalid: false });
  });
});

describe('quantityTextInvalid — quando o campo fica marcado', () => {
  it('zero não lança nada: marcado', () => {
    expect(quantityTextInvalid('0')).toBe(true);
  });

  it('número de 1 a 9999 e vazio no meio da digitação: não marcado', () => {
    expect(quantityTextInvalid('1')).toBe(false);
    expect(quantityTextInvalid('9999')).toBe(false);
    expect(quantityTextInvalid('')).toBe(false);
  });

  // 🟢-5 do red team: a regra vem do parseQuantity, não de um teto repetido.
  it('acima do teto também é marcado, se um dia chegar ao campo', () => {
    expect(quantityTextInvalid('10000')).toBe(true);
  });
});

// 🟡-1 do red team de 22/11: o zero era avisado só pela cor (RNF-025, WCAG 1.4.1).
describe('QUANTITY_ZERO_HINT — o aviso do zero em texto', () => {
  it('diz o mínimo e como tirar o item', () => {
    expect(QUANTITY_ZERO_HINT.visible).toBe('Mín. 1');
    expect(QUANTITY_ZERO_HINT.spoken).toBe('Quantidade mínima 1. Para tirar o item, use Desfazer.');
  });
});
