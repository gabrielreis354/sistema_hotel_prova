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

/** Dígitos do teto da quantidade (MAX_QUANTITY = 9999). */
const MAX_QUANTITY_DIGITS = 4;

/**
 * O texto do campo de quantidade, limpo a cada tecla (🟡-3 do qa-explorador de 22/11). Antes o campo
 * mostrava "10000" com a fila em 1000, e "2,5" com a fila em 2: o garçom via um número e lançava
 * outro. Agora só ficam dígitos, até 4: o que aparece é o que vai para a fila.
 */
export function cleanQuantityText(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, MAX_QUANTITY_DIGITS);
}

/** Zero não lança nada (a fila fica na quantidade anterior): o campo fica marcado até corrigir. */
export function quantityTextInvalid(text: string): boolean {
  return /^0+$/.test(text);
}
