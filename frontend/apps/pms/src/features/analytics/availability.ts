/**
 * O analytics caiu inteiro: toda consulta ligada está em erro. Aí a tela mostra um aviso só, em vez
 * de uma faixa por bloco dizendo a mesma coisa (P3 do audit da F2; F7 da SPEC-10). Com uma fonte de
 * pé, a falha é parcial e cada bloco mostra o próprio erro.
 */
export function allSourcesDown(sources: readonly { isError: boolean }[]): boolean {
  return sources.length > 0 && sources.every((s) => s.isError);
}

export interface SourceState {
  isError: boolean;
  isSuccess: boolean;
}

/**
 * O estado do analytics com memória (🟡1 e 🟡2 do qa-redteam da F7). As consultas não falham ao
 * mesmo tempo: sem memória, a tela mostrava 5 faixas de erro antes do aviso único, e o "Tentar de
 * novo" geral desmontava o aviso (as consultas voltam a carregar) e jogava o foco no body.
 *
 * - `down`: fica ligado da hora em que todas falharam até alguma responder. Tentando de novo, segue.
 * - `settling`: nenhuma respondeu e alguma ainda carrega: os erros de cada bloco esperam (a tela
 *   mostra carregando), porque ainda não se sabe se é queda geral ou parcial.
 */
export function analyticsAvailability(prevDown: boolean, sources: readonly SourceState[]): { down: boolean; settling: boolean } {
  if (sources.some((s) => s.isSuccess)) return { down: false, settling: false };
  const down = prevDown || allSourcesDown(sources);
  return { down, settling: !down && sources.length > 0 };
}
