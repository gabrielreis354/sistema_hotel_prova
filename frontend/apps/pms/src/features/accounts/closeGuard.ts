/**
 * Tempo em que a confirmação de fechar a conta ignora toques depois de aparecer. Sem isso, o
 * segundo toque de um toque duplo em "Fechar conta" caía em "Confirmar" e fechava a conta
 * (P0 da revisão Impeccable, reproduzido com 120 ms). Cobre o toque duplo sem atrasar quem lê.
 */
export const CONFIRM_ARM_MS = 400;

export function confirmArmed(shownAt: number, now: number): boolean {
  return now - shownAt >= CONFIRM_ARM_MS;
}
