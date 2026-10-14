// Allowlists do módulo de comanda (SPEC-04, MER 4.11 e 4.12) — fonte única da verdade,
// usada pelos models, pelos CHECKs de database/applyDbConstraints.js e pelos controllers.
// Mesmo padrão de app/utils/productCategories.js.

// Natureza da conta. ROOM é a única ligada a uma estadia e a única que pode cobrar diária.
//   ROOM     → família hospedada consome na conta da suíte
//   DAY_USE  → cliente sem hospedagem usa a estrutura
//   TABLE    → mesa do restaurante aberta ao público
//   DIRECT   → venda avulsa no balcão
//   INTERNAL → refeição de funcionário, perda, quebra — nunca é receita (RN-006)
export const ACCOUNT_TYPES = ['ROOM', 'DAY_USE', 'TABLE', 'DIRECT', 'INTERNAL'];

// Ciclo de vida da conta. OPEN → CLOSED é a T-04.3; CLOSED → PAID é a T-04.4.
export const ACCOUNT_STATUSES = ['OPEN', 'CLOSED', 'PAID'];

// Motivo obrigatório de um item não faturável (RN-007): o valor fica gravado para
// responder "quanto o hotel deu de cortesia neste mês?".
export const ITEM_REASONS = ['COURTESY', 'STAFF', 'LOSS', 'INTERNAL_USE'];
