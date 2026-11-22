import { MAX_QUANTITY, parseQuantity } from './queueCore.js';

/**
 * Regras do campo de quantidade da linha (comanda, 16/11), puras para testar sem DOM. Saíram do
 * componente pelas ressalvas do qa-redteam da quantidade digitada.
 */

/**
 * O que o campo mostra. Fora da edição, a quantidade da fila. Editando, o que o garçom digitou
 * (inclusive vazio, no meio da digitação), a não ser que a fila tenha mudado por fora (um toque no
 * produto que somou na linha): aí o campo acompanha, para não mostrar 6 com a fila em 7 (🟢-1).
 */
export function fieldText({
  text,
  quantity,
  lastSent,
  editing,
}: {
  text: string;
  quantity: number;
  /** A última quantidade que o próprio campo mandou para a fila. */
  lastSent: number;
  editing: boolean;
}): string {
  return !editing || quantity !== lastSent ? String(quantity) : text;
}

/**
 * Até onde a lista já rolou: o undoUntil mais recente, sem a linha em edição. Cada tecla renova a
 * janela dela, e a lista rolava até o fim, tirando de vista a linha que o garçom editava (🟡-4).
 */
export function lastTapAt(entries: { clientItemId: string; undoUntil: number }[], editingId: string | null): number {
  return entries.reduce((max, e) => (e.clientItemId === editingId ? max : Math.max(max, e.undoUntil)), 0);
}

/** Dígitos do teto da quantidade, derivados do MAX_QUANTITY (🟢-5 do red team de 22/11). */
const MAX_QUANTITY_DIGITS = String(MAX_QUANTITY).length;

/**
 * O texto do campo de quantidade, limpo a cada tecla (🟡-3 do qa-explorador de 22/11). Antes o campo
 * mostrava "10000" com a fila em 1000, e "2,5" com a fila em 2: o garçom via um número e lançava
 * outro. Agora só ficam dígitos, sem zeros à esquerda e até o número de dígitos do teto. A limpeza
 * vem antes do corte, para colar "R$ 10" dar 10, e não 1 (🟢-4 do red team).
 */
export function cleanQuantityText(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_QUANTITY_DIGITS);
}

/** O campo fica marcado quando o texto não é uma quantidade que lança (zero, na prática). */
export function quantityTextInvalid(text: string): boolean {
  return text !== '' && parseQuantity(text) === null;
}

/**
 * O que uma tecla faz: o texto do campo e a quantidade da fila (a ligação do onChange, testada sem
 * DOM — 🟡-3 do red team). Texto que não lança (zero, vazio) deixa a fila na quantidade anterior.
 */
export function nextQuantity(raw: string, quantity: number): { text: string; quantity: number; invalid: boolean } {
  const text = cleanQuantityText(raw);
  return { text, quantity: parseQuantity(text) ?? quantity, invalid: quantityTextInvalid(text) };
}

/**
 * O aviso do zero em texto, não só na cor (🟡-1 do red team de 22/11; RNF-025). O visível cabe no
 * campo estreito; o falado diz também como tirar o item.
 */
export const QUANTITY_ZERO_HINT = {
  visible: 'Mín. 1',
  spoken: 'Quantidade mínima 1. Para tirar o item, use Desfazer.',
} as const;
