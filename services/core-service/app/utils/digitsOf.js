import sequelize from '../../database/connections/sequelize.js';

/**
 * Coluna só com os dígitos, no SQL: CPF e telefone gravados com ou sem máscara.
 * A expressão é a mesma do índice idx_guests_tenant_cpf_digits (applyDbConstraints):
 * mudar uma sem a outra faz o Postgres voltar a varrer a tabela de hóspedes.
 */
export function digitsOf(column) {
    return sequelize.fn('regexp_replace', sequelize.col(column), '\\D', '', 'g');
}
