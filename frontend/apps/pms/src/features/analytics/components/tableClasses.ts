/**
 * Classes das tabelas dos indicadores, num lugar só (regra 9c do qa_checks: bloco repetido é
 * componente disfarçado). Candidatas ao `Table` do @hotel/ui quando ele nascer (CATALOGO.md).
 */
export const TABLE = 'w-full text-sm';
export const TH = 'border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-500';
export const TH_NUM = 'border-b border-gray-200 px-2 py-2 text-right font-medium text-gray-500';
export const TD = 'border-b border-gray-100 px-2 py-2';
/** Dinheiro e contagem: à direita, algarismos tabulares — a coluna não "dança" (DESIGN_PMS §5). */
export const TD_NUM = 'border-b border-gray-100 px-2 py-2 text-right tabular-nums';
export const TF_NUM = 'px-2 py-2 text-right font-medium tabular-nums';
