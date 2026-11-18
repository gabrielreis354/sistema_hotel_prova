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
