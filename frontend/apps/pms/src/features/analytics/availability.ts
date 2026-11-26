/**
 * O analytics caiu inteiro: toda consulta ligada está em erro. Aí a tela mostra um aviso só, em vez
 * de uma faixa por bloco dizendo a mesma coisa (P3 do audit da F2; F7 da SPEC-10). Com uma fonte de
 * pé, a falha é parcial e cada bloco mostra o próprio erro.
 */
export function allSourcesDown(sources: readonly { isError: boolean }[]): boolean {
  return sources.length > 0 && sources.every((s) => s.isError);
}
