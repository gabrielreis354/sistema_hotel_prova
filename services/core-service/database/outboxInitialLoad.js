import { QueryTypes } from 'sequelize';

/**
 * Carga inicial das projeções do analytics (T-01.4/H.2, CA-01.4.j) — catálogo de eventos v1.0 §6.
 *
 * Grava no outbox, para cada registro que já existe nos seis agregados do catálogo, um evento com o
 * retrato atual. O publicador e o consumidor são os mesmos do fluxo normal: não existe caminho
 * paralelo para testar. O payload sai da MESMA função SQL dos triggers (`outbox_payload`, criada em
 * applyDbConstraints.js) — a carga nunca diverge do contrato que o fluxo normal publica.
 *
 * Tipo do evento: `<agregado>.updated`. Registro com exclusão lógica (`deleted_at` preenchido) sai
 * como `<agregado>.deleted`, com o mesmo retrato: o analytics precisa do nome do hóspede, do
 * número do quarto e do nome da categoria excluídos, porque reservas antigas continuam apontando
 * para eles (alertas, receita por categoria) — e a marca de exclusão impede que apareçam onde
 * não devem (ranking de hóspedes, contagem de quartos).
 *
 * Ordem por agregado (§6): cada tabela é lida sob `LOCK TABLE ... IN SHARE MODE`, numa transação
 * só dela. O lock espera as escritas em andamento confirmarem (o evento delas já tem número menor)
 * e segura as novas até o fim (o evento delas sai com número maior). Sem isso, uma escrita não
 * confirmada durante a carga deixaria a carga publicar o retrato ANTIGO com número MAIOR — e o
 * consumidor descartaria a versão nova como "antiga". Uma tabela por vez: o bloqueio de escrita
 * dura só a leitura daquela tabela, e nunca segura dois locks ao mesmo tempo (sem deadlock com
 * transações da API que escrevem em duas tabelas).
 *
 * Idempotente no efeito: rodar duas vezes grava eventos novos com o mesmo retrato; o consumidor
 * aplica por versão e o estado das projeções não muda (§5.2).
 */

// Allowlist fixa: tabela e agregado nunca vêm de fora (vão interpolados no SQL).
const AGREGADOS = [
    { tabela: 'tenants',         agregado: 'tenant',        tenant: 't.id',        exclusaoLogica: false },
    { tabela: 'room_categories', agregado: 'room_category', tenant: 't.tenant_id', exclusaoLogica: true },
    { tabela: 'rooms',           agregado: 'room',          tenant: 't.tenant_id', exclusaoLogica: true },
    { tabela: 'guests',          agregado: 'guest',         tenant: 't.tenant_id', exclusaoLogica: true },
    { tabela: 'reservations',    agregado: 'reservation',   tenant: 't.tenant_id', exclusaoLogica: true },
    { tabela: 'payments',        agregado: 'payment',       tenant: 't.tenant_id', exclusaoLogica: true }
];

/** Devolve `{ <tabela>: <eventos gravados> }`. */
export default async function enqueueInitialLoad(sequelize, { log = () => {} } = {}) {
    const resultado = {};
    for (const { tabela, agregado, tenant, exclusaoLogica } of AGREGADOS) {
        const fato = exclusaoLogica
            ? `CASE WHEN t.deleted_at IS NULL THEN 'updated' ELSE 'deleted' END`
            : `'updated'`;

        resultado[tabela] = await sequelize.transaction(async (transaction) => {
            await sequelize.query(`LOCK TABLE ${tabela} IN SHARE MODE`, { transaction });
            const [{ total }] = await sequelize.query(`
                WITH gravados AS (
                    INSERT INTO outbox (event_id, type, version, tenant_id, aggregate_id, payload, occurred_at)
                    SELECT gen_random_uuid(), '${agregado}.' || ${fato}, 1, ${tenant}, t.id,
                           outbox_payload('${agregado}', to_jsonb(t)), now()
                      FROM ${tabela} t
                     ORDER BY t.id
                    RETURNING 1
                )
                SELECT count(*)::int AS total FROM gravados
            `, { transaction, type: QueryTypes.SELECT });
            return total;
        });
        log(`✅ Carga inicial: ${resultado[tabela]} evento(s) de ${tabela} gravados no outbox.`);
    }
    return resultado;
}
