/**
 * Erro pronto para o log, sem o dado da pessoa (SPEC-06, T-06.12; LGPD art. 46 e art. 6º, III).
 *
 * O erro do Sequelize carrega o `sql`, os `parameters`, os `errors[].value` e o `parent.detail`
 * ("Key (cpf, tenant_id)=(529...)") do INSERT ou UPDATE que falhou. O `console.error(error)`
 * imprimia nome, CPF e e-mail do hóspede no stdout do container, que vai para o agregador de
 * logs. Para diagnosticar um 500 bastam o nome do erro, a mensagem, o código do Postgres, a
 * constraint e a pilha: é só isso que sai daqui.
 *
 * A mensagem do Postgres PODE trazer o valor: o erro de conversão de tipo (classe 22) diz
 * `invalid input syntax for type uuid: "52998224725"`, e a pilha repete a mensagem na 1ª linha
 * (qa-redteam de 22/11, 🟡-1). Por isso, em todo erro que veio do banco, o literal entre aspas
 * vira "…" na mensagem e na pilha. Os nomes que as aspas também cercam (constraint, tabela)
 * saem nos campos próprios. Por isso também `error.message` cru não é seguro para log.
 */
const QUOTED = /"[^"]*"/g;
const redact = (text) => text.replace(QUOTED, '"…"');

export function safeError(error, depth = 0) {
    if (!(error instanceof Error)) return { message: String(error) };
    const pg = error.parent ?? error.original;
    // Erro do banco: o do Sequelize (com parent) ou o do driver pg direto (com severity).
    const fromDb = Boolean(pg) || error.severity !== undefined;
    const clean = fromDb ? redact : (text) => text;
    const out = { name: error.name, message: clean(error.message) };
    const code = pg?.code ?? error.code;
    if (code) out.code = code;
    const constraint = pg?.constraint ?? error.constraint;
    if (constraint) out.constraint = constraint;
    const table = pg?.table ?? error.table;
    if (table) out.table = table;
    if (error.stack) out.stack = clean(error.stack);
    // A causa raiz ajuda o diagnóstico; sai reduzida do mesmo jeito, um nível só (🟢-1).
    if (depth === 0 && error.cause !== undefined) out.cause = safeError(error.cause, 1);
    if (depth === 0 && error instanceof AggregateError) out.errors = error.errors.map((e) => safeError(e, 1));
    return out;
}

/** O `console.error` dos controllers, com o erro reduzido por `safeError`. */
export function logError(label, error) {
    console.error(`${label}:`, safeError(error));
}
