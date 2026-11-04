/**
 * Traduz em 422 a recusa do banco a uma regra da comanda (SPEC-04, D-12).
 *
 * Por que existe: as regras de D-4, D-5 e RN-005 são validadas no controller E
 * garantidas por CHECKs/índice no banco. Quando o banco recusa, é porque o controller
 * deixou passar algo, ou duas requisições correram juntas (RN-005: duas aberturas
 * simultâneas passam pela checagem prévia e o índice barra a segunda). Nos dois casos
 * o erro é do pedido, não do servidor: 422 com a regra, nunca 500.
 *
 * Por que não usar `uniqueConstraintConflict`: ele devolve 409, e a RN-005 é regra de
 * negócio (CA-04.1.k pede 422), não duplicata de cadastro.
 *
 * O mapa usa os nomes das constraints de `applyAccountConstraints`
 * (database/applyDbConstraints.js) e de db/schema.sql. Constraint nova da comanda
 * entra aqui; sem entrada, o erro segue para o 500 do controller.
 *
 * O índice de `client_item_id` não está no mapa de propósito: a violação dele é o
 * reenvio da fila offline (RN-008) e vira 200 com o item original, no controller.
 */
const MENSAGEM_POR_CONSTRAINT = {
    accounts_lodging_unique:
        'Já existe uma conta cobrando a diária deste quarto nesta estadia (RN-005)',
    accounts_charges_lodging_room_only:
        'Só conta ROOM cobra diária',
    accounts_room_requires_stay:
        'Conta ROOM exige reserva, quarto e hóspede',
    accounts_reservation_only_room:
        'Só conta ROOM tem reserva',
    accounts_no_guest_table_internal:
        'Conta TABLE e INTERNAL não têm hóspede',
    accounts_type_allowlist:
        'Tipo de conta inválido',
    accounts_status_allowlist:
        'Status de conta inválido',
    account_items_quantity_positive:
        'Quantidade deve ser maior que zero',
    account_items_unit_price_non_negative:
        'Preço unitário não pode ser negativo',
    account_items_total_matches:
        'O total do item precisa ser quantidade × preço unitário',
    account_items_reason_allowlist:
        'Motivo de item não faturável inválido',
    account_items_reason_required:
        'Item não faturável exige motivo (reason)'
};

/**
 * @param {Error} error erro capturado no catch do controller
 * @param {import('express').Response} response
 * @returns {import('express').Response|null} a resposta 422 já enviada, ou null se o
 *   erro não for uma regra da comanda — o controller segue para o 500.
 */
export default function accountRuleViolation(error, response) {
    // O driver pg entrega o nome da constraint violada em `parent.constraint`,
    // tanto para CHECK (23514) quanto para índice único (23505).
    const mensagem = MENSAGEM_POR_CONSTRAINT[error?.parent?.constraint];
    if (!mensagem) return null;

    return response.status(422).json({ error: mensagem });
}
