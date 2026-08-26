import { UniqueConstraintError } from 'sequelize';

/**
 * Traduz violação de índice único do Postgres em 409, não 500.
 *
 * Por que existe: todo Create/Update faz check-then-act (SELECT e depois INSERT).
 * Duas requisições simultâneas — duplo clique, dois recepcionistas — passam as duas
 * pelo SELECT e quem barra a segunda é o índice único. Sem tratamento isso vira 500,
 * que diz ao cliente "erro do servidor" quando na verdade é conflito do cliente.
 *
 * A mensagem vem do NOME DO ÍNDICE, não do controller: um mesmo INSERT pode violar
 * índices diferentes (guests tem CPF e e-mail), e só o Postgres sabe qual foi. Manter
 * o mapa aqui evita espalhar o conhecimento dos nomes de índice por 10 controllers —
 * mesma razão de `roles.js` e `productCategories.js` serem centralizados.
 *
 * Ao criar um índice único novo, adicione-o aqui. Sem entrada, cai na mensagem
 * genérica — 409 continua correto, só menos específico.
 */
const MENSAGEM_POR_INDICE = {
    users_email_tenant_unique:            'E-mail já cadastrado neste hotel',
    room_categories_name_tenant_unique:   'Já existe uma categoria com esse nome',
    rooms_number_tenant_unique:           'Já existe um quarto com esse número',
    guests_cpf_tenant_unique:             'CPF já cadastrado para outro hóspede',
    guests_email_tenant_unique:           'E-mail já cadastrado para outro hóspede',
    corporate_clients_cnpj_tenant_unique: 'CNPJ já cadastrado para este tenant',
    corporate_clients_cpf_tenant_unique:  'CPF já cadastrado para este tenant',
    products_name_tenant_unique:          'Já existe um produto com esse nome'
};

/**
 * @param {Error} error erro capturado no catch do controller
 * @param {import('express').Response} response
 * @returns {import('express').Response|null} a resposta 409 já enviada, ou null se o
 *   erro não for violação de unicidade — nesse caso o controller segue para o 500.
 */
export default function uniqueConstraintConflict(error, response) {
    if (!(error instanceof UniqueConstraintError)) return null;

    // O driver pg entrega o nome do índice violado em `parent.constraint`. Quando a
    // violação vem da validação do Sequelize (antes do banco), sobra o campo em `errors`.
    const indice = error.parent?.constraint ?? error.errors?.[0]?.path;

    return response
        .status(409)
        .json({ error: MENSAGEM_POR_INDICE[indice] ?? 'Registro já existe' });
}
