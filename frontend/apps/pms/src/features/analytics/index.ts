/**
 * Fachada do módulo de indicadores (princípio 2): outro módulo importa só daqui.
 * Nasceu na T-05.3 — o painel "Hoje" usa a mesma ocupação do dia (e a mesma chave de cache)
 * que a tela de Indicadores.
 */
export { IndicatorsPage } from './IndicatorsPage.js';
export { useOccupancy } from './queries.js';
