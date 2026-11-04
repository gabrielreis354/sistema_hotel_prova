# QA Red Team — T-06.13 estorno de pagamento (reauditoria delta)
**Branch:** fix/t0613-estorno-pagamento · **Dev:** Gabriel · **Base:** develop@c6742b2 · **Delta:** c191eb6..0b6117e (71a108e, 71c829d, 0b6117e) · **Data:** 24/10/2026
**Arquivos auditados:** 15 no delta: `CreatePaymentController`, `UpdatePaymentController`, `GetRevenueController`, `GetAlertsController`, `paymentEnums.js`, `paymentInput.js` (novo), `swagger.js`, `applyDbConstraints.js`, `db/schema.sql`, os testes `payment-void`, `payments` e `account-payments`, e os docs (`ARQ_DATABASE`, SPEC-06, histórico). Também li os outros caminhos que gravam em `payments`, para checar o CHECK novo e a allowlist: `PixWebhookController`, `CreateBookingController`, `VoidPaymentController`, `seed/seed_hotels.sql`, o cliente tipado (`frontend/packages/api-client`) e o `test_rotas.sh`.
**Achados no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Os quatro achados tratados estão fechados de verdade: reproduzi cada um e, com mutação, confirmei que os testes novos pegam a regressão. Não achei 🔴 nem 🟡. O CHECK `payments_paid_has_paid_at` não quebra o webhook PIX nem o seed. A allowlist de `method` não derruba nada que funcionava: o frontend não chama `/payments`, o cliente tipado já tinha esse enum, e nenhum controller, script ou seed passa pela API com outro valor.

Sobram três 🟢, todos de borda:
- a validação de data ainda aceita dia inexistente (30/02 vira 02/03);
- uma linha legada PAID sem data recebe 500 num PUT só de método;
- o default `status = 'PAID'` do model ficou sem `paid_at`, o que é uma armadilha para fixtures e código novo.

**Verificação real.** Banco próprio, `postgres:17` em `pg-qa0613b`, porta 5453, removido no fim. O `.env.test` foi apontado para 5453 só durante as rodadas e restaurado depois.
- Suíte completa com `--coverage`: **40 arquivos, 881 passed, 1 skipped**, exit 0.
- Cobertura: statements 83,76%, branches 79,67%, functions 88,76%, lines 86,16%. `paymentInput.js` tem 100%.
- `bash scripts/qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.`, exit 0. Os três avisos são anteriores à branch (Swagger de `corporate-client`/`event-quote`/`room-category` e dois avisos de frontend).
- As reproduções usaram um teste temporário, `tests/zz_qa0613b_tmp.test.js`, apagado depois de rodar. As mutações foram desfeitas com `git checkout` (trap no script). O working tree de `services/` está limpo.

### Achados anteriores: reprodução
| Achado anterior | Cenário | Antes (c191eb6) | Agora |
|---|---|---|---|
| 🟡-1 | `PUT {paid_at: null}` em PAID | 200, receita 200 → 0 | **400**; `paid_at` e `realized.total` intactos |
| 🟡-1 (banco) | `INSERT`/`UPDATE` de PAID com `paid_at` nulo | aceito | recusado por `payments_paid_has_paid_at`; PENDING sem data continua aceito |
| 🟢-1 | `PUT {method: 'BITCOIN'}` / `{method: null}` / `{paid_at: 'lixo'}` | 200 / 500 / 500 | 400 / 400 / 400 |
| 🟢-1 (repasse do POST) | `POST {method: 'CARTAO'}` / `{paid_at: 'lixo'}` | 201 / 500 | 400 / 400; nada gravado |
| 🟢-2 | `no_show_risk` e corridas sem teste | — | 3 testes de `no_show_risk` + 2 corridas de 6 rodadas |
| 🟢-4 | comentário "conforme D-3" no `unpaid` | enganoso | diz "sem nenhum PAID; saldo > 0 fica para a T-01.4" |
| 🟢-3 | cliente tipado desatualizado | — | **segue aberto**, por decisão do coordenador (pendência 2 do histórico: regenerar depois do merge) |

### Prova de que os testes novos não dão falso verde (mutação)
| Mutação | Teste que pega | Resultado |
|---|---|---|
| `CheckOutController` trava `payments` da reserva **depois** da reserva (ciclo com o estorno, que trava pagamento → reserva) | "estorno ∥ check-out da mesma reserva" | falha 3/3 (`deadlock detected` → 500) |
| `GetAlertsController` sem `p.status = 'PAID'` no `ON` | "no_show_risk: PAID não está em risco…" e "só PIX PENDING está em risco" | falham os 2 |
| `UpdatePaymentController` sem a checagem de `paid_at` | "paid_at nulo, vazio, inválido ou não-texto → 400" | falha |

**Determinismo:** `payment-void.test.js` rodou 5 vezes seguidas sem mutação, 44/44 em todas. As corridas conferem só o estado final, que é o mesmo nas duas ordens de trava, e o status de cada resposta (200/200, 200/201). Nenhuma asserção depende de quem ganha a corrida. O `no_show_risk` usa o `CURRENT_DATE` do próprio banco (sessão em UTC). Com o processo em BRT, a data do banco é sempre ≥ a data local, então a reserva "de hoje" nunca cai no passado para a validação da API.

---

## Achados no escopo

### 🟢-1 [Validação · dinheiro no mês errado] `isValidPaidAt` aceita data de calendário inexistente, e o ano 0000 ainda vira 500
**Onde:** `services/core-service/app/utils/paymentInput.js:22-25`. O regex só confere o formato `AAAA-MM-DD`, e `Date.parse` normaliza o dia que estoura o mês em vez de recusar.
**Cenário (reproduzido no teste temporário):**
- `POST /payments {paid_at: '2026-02-30T10:00:00Z'}` → **201**, gravado `2026-03-02T10:00:00Z`;
- `'2026-02-31'` → 201, `2026-03-03`;
- `'2026-04-31T12:00:00Z'` → 201, `2026-05-01`;
- `PUT {paid_at: '2026-02-30T10:00:00Z'}` → 200, `2026-03-02`;
- `POST` ou `PUT {paid_at: '0000-01-01'}` → **500** (`DateTimeParseError` do Postgres).

Um erro de digitação do ADMIN ("31/04") muda o pagamento de mês em `GET /analytics/revenue`, sem aviso. Quem lê o 400 dos outros casos supõe que a data foi validada. O caso `'2026-02-30T99:00'` do teste (`payment-void.test.js`, "POST com paid_at inválido") dá 400 por causa da **hora** 99, não do dia 30/02. O teste parece cobrir o dia inexistente e não cobre.
**Regra violada:** Fail Fast; e o próprio objetivo do 🟢-1 anterior (dado inválido → 400, nunca gravado nem 500).
**Correção sugerida:** depois do `Date.parse`, conferir que ano, mês e dia do texto são os mesmos da data obtida, e recusar ano < 1, por exemplo `^\d{4}-\d{2}-\d{2}` comparado com `toISOString().slice(0, 10)` quando o texto não tem fuso. Trocar o caso do teste por `'2026-02-30T10:00:00Z'`.

### 🟢-2 [Legado] Linha PAID sem `paid_at`, anterior ao CHECK, recebe 500 num `PUT` só de método
**Onde:** `UpdatePaymentController.js:60` (`PaymentModel.update({ method, paid_at })`) contra o CHECK NOT VALID de `applyDbConstraints.js:341-343`. O NOT VALID não confere o que já existe, mas confere **toda linha atualizada**.
**Cenário (reproduzido):** banco antigo com um PAID de `paid_at` nulo. Essas linhas podiam nascer pelo próprio 🟡-1 antes deste delta, e o comentário do `applyDbConstraints` admite que existem.
- `PUT /payments/<id> {method: 'PIX'}` → **500** "Erro ao atualizar pagamento." (violação do CHECK);
- `PUT {paid_at: '…'}` → 200, a correção possível;
- `POST /payments/<id>/void` → 200, porque VOIDED não é PAID.

Dinheiro não se perde. Mas a recepção vê um erro genérico sem saber que basta informar a data.
**Regra violada:** Fail Fast (erro previsível respondido como 500).
**Correção sugerida:** no PUT, se `payment.paid_at` é nulo e `paid_at` não veio, responder 422 "informe paid_at: pagamento sem data". A outra opção é registrar no comentário do `applyDbConstraints` que corrigir essas linhas pede `paid_at` no corpo.

### 🟢-3 [Model · armadilha] `PaymentModel` tem `status` default `'PAID'` e `paid_at` sem default: `create` sem data agora falha no banco
**Onde:** `services/core-service/app/Models/PaymentModel.js:48-52` (default `'PAID'`) e `:93` (`paid_at` `allowNull: true`, sem default nem validação).
**Cenário:** `PaymentModel.create({ tenant_id, account_id, amount, method })` era o atalho usado nas fixtures e agora estoura `payments_paid_has_paid_at`. Por isso este delta teve de acrescentar `paid_at` em cinco pontos de `account-payments.test.js`. Os dois caminhos de produção que criam pagamento estão certos: `CreatePaymentController` usa `paid_at ?? new Date()` e o `CreateBookingController` grava PENDING. Mas o próximo `create` manual (migração de dado, job, teste) tropeça na mesma regra, e só descobre no banco.
**Regra violada:** Fail Fast e KISS (o default do model contradiz um CHECK do banco).
**Correção sugerida:** uma validação de model (`validate: { paidHasPaidAt() { … } }`) com a mesma regra do CHECK, para o erro aparecer com nome e mensagem antes do INSERT. A outra opção é documentar no comentário do `status` que PAID exige `paid_at`.

---

## Repassados a outro dev
Nenhum. O repasse de dono indefinido da rodada anterior (`CreatePaymentController` sem allowlist) foi corrigido nesta própria branch, no mesmo util do PUT. Reproduzi a correção acima, e ele não precisa mais de arquivo de repasse.

## O que foi verificado e está correto
- **CHECK `payments_paid_has_paid_at`:**
  - criado como NOT VALID nos dois caminhos: `applyDbConstraints.js:341-343` e o `ALTER` de `db/schema.sql:238-240`;
  - idempotente: `DROP IF EXISTS` + `ADD`. Rodei `applyDbConstraints` duas vezes seguidas e ficou uma constraint, `convalidated = false`;
  - linha legada PAID sem data não trava o migrate (teste da suíte e reprodução);
  - em banco zerado também termina NOT VALID, porque o `ALTER` do `schema.sql` substitui o CHECK inline. Isso não é defeito: vale para todo INSERT/UPDATE novo, e um `VALIDATE CONSTRAINT` fica possível quando a consulta de conferência do comentário voltar vazia.
- **Webhook PIX e PIX online:**
  - `PixWebhookController.js:132-134` grava `status = 'PAID'` e `paid_at = new Date()` no mesmo `save`, então o CHECK passa;
  - `CreateBookingController` cria PENDING com `paid_at: null`, permitido;
  - os testes de webhook (Mercado Pago, Asaas, sinal antes e depois do check-out) passam na suíte completa.
- **Seed:** as duas cargas de `seed_hotels.sql` (linhas 258 e 430) gravam `paid_at` explícito, então o CHECK passa. Elas usam `method = 'CARTAO'`, mas por INSERT direto: a allowlist é da API, e não há CHECK de método no banco, decisão documentada em `ARQ_DATABASE.md`. Uma linha do seed com `CARTAO` continua editável por `PUT {paid_at}` (200, o método fica). Só `PUT {method: 'CARTAO'}` dá 400, e isso é intencional. O histórico registra a pendência 3 (decidir se o seed vira `CARTAO_CREDITO`).
- **Allowlist de `method` sem regressão:**
  - os valores aceitos são os quatro que o Swagger já declarava e que o cliente tipado já tipava (`schema.d.ts:2364`, `:3672`);
  - nenhum `frontend/apps/*` chama `/payments`;
  - `test_rotas.sh` e `scripts/` não lançam pagamento;
  - nos testes, só `payments.test.js` usava `'CARTAO'`, num teste de 404, trocado com justificativa;
  - o Swagger passa a importar `PAYMENT_METHODS`/`PAYMENT_STATUSES` da fonte única, sem lista duplicada.
- **POST e PUT com `paid_at`:**
  - POST: ausente ou `null` usa agora; `''` → 400;
  - PUT: ausente não mexe (`PUT {}` → 200, método e data intactos); `null`/`''`/número/objeto/booleano → 400;
  - a validação roda antes de abrir a transação e antes da checagem de UUID, sem custo de banco.
- **Testes alterados:** as cinco fixtures de `account-payments.test.js` ganharam `paid_at`, consequência direta do CHECK, e nenhuma asserção mudou. A troca `'CARTAO'` → `'CARTAO_CREDITO'` em `payments.test.js` está no histórico.
- **Outros:** ESM sem `require`. Nenhum `Number()` novo sobre DECIMAL. Os logs novos não têm PII. O Swagger descreve os novos 400 do POST e do PUT.

## Não foi possível verificar
- **Migração real** de um banco de dev antigo, com PAID sem data gravado pelo PUT de antes, via `node command.js migrate`. Validei pelo teste da suíte, que derruba o CHECK, insere a linha e roda `applyDbConstraints`, e pelo teste temporário.
- **Regeneração do cliente tipado (🟢-3 anterior):** fora deste delta por decisão do coordenador. Não muda o enum de `method`, que já estava certo no cliente.
