/**
 * Erro pronto para o log, sem o dado da pessoa (SPEC-06, T-06.12; LGPD art. 46 e art. 6º, III).
 *
 * O erro do Sequelize carrega o `sql`, os `parameters`, os `errors[].value` e o `parent.detail`
 * ("Key (cpf, tenant_id)=(529...)") do INSERT ou UPDATE que falhou. O `console.error(error)`
 * imprimia nome, CPF e e-mail do hóspede no stdout do container, que vai para o agregador de
 * logs. Para diagnosticar um 500 bastam o nome do erro, a mensagem, o código do Postgres, a
 * constraint e a pilha: é só isso que sai daqui.
 *
 * A mensagem do Postgres não traz os valores (eles ficam no `detail`, que não sai).
 */
export function safeError(error) {
    if (!(error instanceof Error)) return { message: String(error) };
    const pg = error.parent ?? error.original;
    const out = { name: error.name, message: error.message };
    const code = pg?.code ?? error.code;
    if (code) out.code = code;
    const constraint = pg?.constraint ?? error.constraint;
    if (constraint) out.constraint = constraint;
    const table = pg?.table ?? error.table;
    if (table) out.table = table;
    if (error.stack) out.stack = error.stack;
    return out;
}

/** O `console.error` dos controllers, com o erro reduzido por `safeError`. */
export function logError(label, error) {
    console.error(`${label}:`, safeError(error));
}
