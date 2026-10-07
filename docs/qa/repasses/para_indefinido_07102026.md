# Repasses — DONO INDEFINIDO — 07/10/2026

Origem: `docs/qa/redteam_paranoid-unique-merge_07out2026.md` (auditoria do PR #82)

### 🟡 [transação / B2B] Fallback de unicidade roda um segundo INSERT numa transação já abortada
**Onde:** `services/core-service/app/Controllers/ContractApi/SignContractController.js:26-29`
(chamado em `:82` com a transação `t`)
**Cenário:** o representante legal do cliente corporativo tem um e-mail que já pertence a outro
hóspede do tenant, com CPF diferente. O `GuestModel.create` viola `guests_email_tenant_unique` e o
`catch` tenta um segundo `GuestModel.create` **na mesma transação**. No PostgreSQL, depois de um
erro a transação inteira fica abortada. O segundo INSERT falha com `25P02 current transaction is
aborted`, o controller devolve 500 e o contrato não pode ser assinado. O comentário da função
promete o contrário: "não é motivo para travar a assinatura". O comportamento foi confirmado com psql
(BEGIN → INSERT ok → INSERT duplicado → INSERT seguinte = `current transaction is aborted`).
Além disso, `console.error('SignContractController:', error)` (`:111`) imprime o objeto do Sequelize
com `sql`/`parameters`, o que expõe o nome do representante no stdout.
**Regra violada:** CLAUDE.md §7 (transação correta em gravação multi-tabela); LGPD art. 6º, III (log).
**Correção sugerida:** fazer o primeiro create dentro de um savepoint
(`sequelize.transaction({ transaction }, ...)`, que o Sequelize implementa como SAVEPOINT) ou
buscar antes por e-mail/telefone e criar já sem os campos que colidem; trocar o log por `error.message`.
**Dono:** área B2B no backend. A divisão de 09/09 dá a Weslley só o *frontend* B2B, e o
`b2b-service` (T-01.6) ainda não existe.
