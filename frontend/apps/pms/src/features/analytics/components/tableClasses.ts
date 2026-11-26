/**
 * Classes das tabelas dos indicadores, num lugar só (regra 9c do qa_checks: bloco repetido é
 * componente disfarçado). O `Table` do @hotel/ui já existe, mas vem dentro de um `Card`, e aqui a
 * tabela mora no cartão do bloco. Por isso o cabeçalho só copia o visual dele: fundo gray-50 e texto
 * gray-600 (F7 da SPEC-10).
 */
export const TABLE = 'w-full text-sm';
export const TH = 'border-b border-gray-200 bg-gray-50 px-2 py-2 text-left font-medium text-gray-600';
export const TH_NUM = 'border-b border-gray-200 bg-gray-50 px-2 py-2 text-right font-medium text-gray-600';
export const TD = 'border-b border-gray-100 px-2 py-2';
/** Dinheiro e contagem: à direita, algarismos tabulares — a coluna não "dança" (DESIGN_PMS §5). */
export const TD_NUM = 'border-b border-gray-100 px-2 py-2 text-right tabular-nums';
export const TF_NUM = 'px-2 py-2 text-right font-medium tabular-nums';
