import { QueryTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

/**
 * SELECT com replacements nomeados sobre as projeções. Toda consulta de indicador passa
 * `tenantId` (do JWT) e filtra `tenant_id = :tenantId` em cada tabela (CA-01.4.m).
 *
 * Dinheiro sai como NUMERIC e chega aqui como string decimal (o `pg` não converte NUMERIC):
 * nenhuma consulta usa `::float` em valor (catálogo §9.1, "Dinheiro nas consultas sobre a projeção").
 */
export default function select(sql, replacements) {
    return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}
