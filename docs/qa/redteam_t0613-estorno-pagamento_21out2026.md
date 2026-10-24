# QA Red Team — T-06.13 estorno de pagamento (VOIDED no lugar da exclusão)
**Branch:** fix/t0613-estorno-pagamento · **Dev:** Gabriel · **Base:** develop@c6742b2 · **Commits:** 07277f4, c1cb04b, 9147c82, 5b67b84, a3302e9 · **Data:** 21/10/2026
**Arquivos auditados:** 21 no diff. Também li os caminhos que travam pagamento, reserva ou conta, para checar a ordem de lock: `PixWebhookController`, `CreatePaymentController`, `CheckOutController`, `CancelReservationController`, `CloseAccountController`, `accountBill.js` (`settlePaymentAccount`, `settleAccount`, `lockAccount`), `accountPayments.js` (`reservationLedger`, `accountBalance`) e `closeEndedStayAccounts.js`. Li ainda o trigger do outbox em `applyDbConstraints.js`, `ListPayment`, `GetBookingStatus` e o cliente tipado do frontend.
**Achados no escopo:** 5 (🔴 0 · 🟡 1 · 🟢 4) · **Repassados:** 1 (registrado neste relatório, ver a seção própria)

## Veredito
**APROVADO COM RESSALVAS**

Não achei 🔴 no escopo. O estorno está certo nos pontos que mexem com dinheiro:
- allowlist só `PAID → VOIDED`, e pagamento de PSP recebe 409;
- trava `FOR UPDATE` no pagamento, com `UPDATE` condicionado ao status lido;
- a conta volta a CLOSED na mesma transação;
- o tenant vem do JWT nas duas leituras;
- motivo obrigatório, aparado e limitado a 500 caracteres;
- os três CHECKs no banco.

A ressalva principal é o 🟡-1. O `PUT` reescrito ainda deixa um ADMIN tirar da receita um pagamento efetivado sem estornar (`paid_at: null`). É o mesmo tipo de divergência que a T-06.13 fecha.

**Verificação real.** Banco próprio, `postgres:17` em `pg-qa0613`, porta 5447, removido no fim. Suíte completa com `--coverage`: 40 arquivos, 865 passed, 1 skipped, exit 0. Statements 83,65%, branches 79,53%, functions 88,7%, lines 86,1%, acima do portão de 60%.

As reproduções usaram um teste temporário, `tests/qa0613_probe.test.js`, apagado depois de rodar. O `.env.test` foi restaurado e o working tree de `services/` está limpo.

### Reproduções (teste temporário)
| Cenário | Resultado observado |
|---|---|
| `PUT /payments/:id {paid_at: null}` (ADMIN) em PAID que quitava a conta titular | **200**; `realized.total` 200 → **0**; a conta segue **PAID** |
| `PUT {method: 'BITCOIN'}` | **200**, e o método é gravado |
| `PUT {paid_at: 'lixo'}` / `PUT {method: null}` | **500** / **500** |
| `PUT {amount: 10}` (número) num pagamento de `'10.00'` | 200 (toCents compara certo) |
| `void` ∥ `check-out` da mesma reserva, 6 rodadas | 200/200 e conta **CLOSED** em 6/6 |
| `void` ∥ `POST /payments {account_id}` na mesma conta (70, 30 estornado + 40), 6 rodadas | 200/201 e conta **CLOSED** em 6/6, com saldo 30 |
| `no_show_risk` com reserva CONFIRMED de hoje e só PIX PENDING | a reserva **aparece**, como manda a D-3 |

---

## Achados no escopo

### 🟡-1 [Financeiro · trilha] `PUT /payments/:id` com `paid_at: null` tira da receita um pagamento PAID sem estorno nem motivo
**Onde:** `services/core-service/app/Controllers/PaymentApi/UpdatePaymentController.js:22` e `:51`. O `paid_at` vem do corpo sem validação e vai direto para o `PaymentModel.update`. O model aceita nulo (`PaymentModel.js`, `paid_at` com `allowNull: true`).
**Cenário:**
1. ADMIN envia `PUT /payments/<id> { "paid_at": null }` num pagamento manual PAID de R$ 200,00 que quitava a conta titular.
2. A resposta é 200.
3. `GET /analytics/revenue` cai de 200 para 0, porque `GetRevenueController` e `GetPaymentMixController` exigem `paid_at IS NOT NULL`.
4. A conta segue PAID: `reservationLedger` soma por `status = 'PAID'`, sem olhar `paid_at`.

O resultado é um efetivado que quita conta, mas não é receita, sem `void_reason`/`voided_by`. A única pista é um `payment.updated` no outbox. É a mesma divergência entre receita e saldo que o CA-06.13.f fecha, por uma porta lateral. O controller foi reescrito nesta branch com a promessa de "corrigir método ou data", então a porta é dele.
**Regra violada:** CA-06.13.f ("a receita é a soma dos efetivados"), D-2 do catálogo (lançamento financeiro não some sem trilha) e Fail Fast.
**Correção sugerida:** no PUT, recusar `paid_at` nulo ou inválido com 400 (`paid_at` presente precisa ser data válida). Com isso, `status = 'PAID'` implica `paid_at` preenchido. Opcional: um CHECK `status <> 'PAID' OR paid_at IS NOT NULL` (NOT VALID) ao lado dos três novos.

### 🟢-1 [Validação] PUT aceita qualquer `method` e devolve 500 para `paid_at`/`method` inválidos
**Onde:** `UpdatePaymentController.js:22` e `:51`.
**Cenário:**
- `PUT {method: 'BITCOIN'}` → 200, e o `payment-mix` passa a ter um método fora da lista.
- `PUT {paid_at: 'lixo'}` → 500.
- `PUT {method: null}` → 500, por violação de NOT NULL.

O Swagger novo do PUT (`config/swagger.js`) declara `method` com enum, e a API não o aplica.
**Regra violada:** Fail Fast, e o contrato do Swagger (enum declarado e não aplicado).
**Correção sugerida:** allowlist de método (ex.: `PAYMENT_METHODS` em `paymentEnums.js`, que já é a fonte única de status) e 400 para data inválida. Isso cabe junto com o 🟡-1.

### 🟢-2 [Testes] A mudança do `no_show_risk` não tem teste, e as corridas do estorno só cobrem estorno ∥ estorno
**Onde:** `GetAlertsController.js:18`. Nenhum teste da suíte cita `no_show_risk` (`grep -rln no_show_risk tests/` vazio). `payment-void.test.js` testa só a corrida de dois `void`.
**Cenário:** um revert do filtro `p.status = 'PAID'` no alerta passaria verde. A corrida estorno ∥ check-out e estorno ∥ novo pagamento está correta hoje (reproduzi 6/6), mas nenhum teste a protege. A ordem pagamento → reserva → contas depende de nenhum outro caminho travar pagamento depois da reserva, e só uma corrida testada pega a quebra dessa condição.
**Correção sugerida:** um teste de `no_show_risk` (reserva só com estornado aparece; com PIX PENDING aparece; com PAID some) e uma rodada de `void` ∥ `check-out`.

### 🟢-3 [Contrato frontend] Cliente tipado desatualizado: sem `VOIDED`, sem `/void`, ainda com o DELETE de 204
**Onde:** `frontend/packages/api-client/src/schema.d.ts:2480` (`delete` "Remove pagamento (soft delete)") e `:3653`/`:3674`/`:3812` (enum de status sem `VOIDED`).
**Cenário:** uma tela futura que mostre pagamento tipa `status` sem `VOIDED`, e um `switch` exaustivo ignora o estornado. Hoje não quebra nada: nenhum `frontend/apps/*/src` chama `/payments`, como confirmei por grep. O cliente já estava atrás do Swagger desde a T-04.x, e o executor registrou isto como pendência 2.
**Regra violada:** checklist §6 (cliente tipado do frontend), sem dano imediato.
**Correção sugerida:** `pnpm --filter api-client generate` antes do PR de release.

### 🟢-4 [Documentação] O comentário "D-3" no `unpaid` descreve a D-3 de antes do refinamento
**Onde:** `GetRevenueController.js:64`.
**Cenário:** a D-3 aprovada em 04/10 (§9.1 do catálogo) define `revenue.unpaid` como **saldo > 0**: uma reserva com sinal de 30% PAID continua devendo. A consulta usa "sem nenhum PAID". O comentário diz "conforme D-3", e quem lê conclui que a D-3 está implementada. O executor registra isto como pendência 4 (fica para a T-01.4). A CA-06.13.f pede exatamente o que foi feito, então não há regressão.
**Correção sugerida:** trocar o comentário para "D-3, 1ª parte (sem PAID); saldo > 0 pendente — T-01.4".

---

## Repassados a outro dev

O orquestrador pediu commit **só deste relatório**, então o arquivo de repasse não foi gravado. O achado fica registrado aqui para quem for gravá-lo em `docs/qa/repasses/para_indefinido_21102026.md`.

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | `POST /payments` também aceita qualquer `method` (sem allowlist), e um `paid_at` inválido vira 500. Mesma correção do 🟢-1, na criação | `services/core-service/app/Controllers/PaymentApi/CreatePaymentController.js:80-81` | DONO INDEFINIDO (PaymentApi genérico, como no repasse de 19/10) | a gravar em `docs/qa/repasses/para_indefinido_21102026.md` |

Defeitos já conhecidos e fora do escopo, sem repasse novo: `SUM(amount)::float` no analytics e `Number(p.amount)` no `GetBillController`. Os dois são anteriores à branch e estão registrados no catálogo de eventos (§9.1, "Dinheiro nas consultas sobre a projeção"). A branch tocou as linhas vizinhas, mas não introduziu a conversão.

## O que foi verificado e está correto
- **Allowlist (CA-06.13.c):** `VOIDABLE_STATUSES = ['PAID']`, e qualquer outro status recebe 409. PSP é identificado pelo `provider`, lido com `unscoped()`. O paranoid continua valendo, então um pagamento soft-deletado antigo recebe 404. A resposta é relida pelo `defaultScope` e não vaza `pix_qr_code` nem `provider_charge_id`.
- **Corrida estorno ∥ estorno:** a trava `FOR UPDATE` serializa. O `UPDATE ... WHERE status = <lido>` e o `updated !== 1` são uma segunda barreira. O teste dá 200/409 e um evento só, em 5 rodadas.
- **Ordem de lock (D-48):** estorno e webhook seguem pagamento → reserva → contas. POST, fechamento, check-out e cancelamento seguem reserva → contas. Nenhum caminho trava pagamento depois da reserva (conferi por grep de `PaymentModel` com `lock`), então não há ciclo. Uma leitura sem lock da conta na transação do estorno é refeita depois que ele pega a trava da reserva, e o resultado final é correto (reproduzido).
- **Conta PAID → CLOSED na mesma transação:** `settlePaymentAccount` roda depois do UPDATE do status, e o razão soma só `status = 'PAID' AND deleted_at IS NULL`. Isso vale para conta direta, para crédito de reserva com uma conta e para crédito rateado entre duas contas.
- **Tenant isolation (CA-06.13.h):** `tenant_id` do JWT no `findOne`, no `update` e na releitura. Outro hotel recebe 404, e um id que não é UUID recebe 404 sem chegar ao Postgres.
- **Motivo e trilha (CA-06.13.b, e):** `voided_by` vem do JWT, nunca do corpo. `voided_at` vem de `clock_timestamp()`. O PUT ignora `status`, `void_reason`, `voided_by` e `voided_at` vindos do corpo (testado). Os CHECKs `payments_voided_has_trail` e `payments_trail_only_voided` e a FK para `users` estão testados por INSERT direto.
- **Migração em banco antigo:** `applyPaymentStatusConstraints` remove o `payments_status_check`, o nome automático que o Postgres dá ao `CHECK (status IN ...)` do schema.sql antigo, e recria os três CHECKs como NOT VALID. É idempotente: DROP IF EXISTS + ADD, rodado pelo globalSetup e de novo pelo teste. Só roda depois que o `sync({ alter })` criou `voided_at`. Se o sync falhar, o guard pula. Isso não piora nada: sem as colunas, o model novo já falharia em toda leitura de pagamento. O teste simula o CHECK antigo e estorna depois do migrate. O `db/schema.sql` usa `ADD COLUMN IF NOT EXISTS` e recria os CHECKs pelo mesmo nome. Um pod antigo, no rolling update, só grava PAID/PENDING com a trilha nula, compatível com os CHECKs.
- **PUT só ADMIN e sem troca de valor:** nenhum consumidor quebra. O frontend não chama `/payments`, e nenhum script, seed ou controller usa PUT ou DELETE de pagamento (grep no repo). Os testes antigos de PUT de valor viraram 409 ou "estorno + novo lançamento". O webhook não usa o PUT.
- **DELETE (CA-06.13.a):** 405 com `Allow: GET, PUT` e o caminho do `void` para ADMIN, e 403 para os outros papéis, conforme a decisão 1 do relatório. O pagamento permanece (testado).
- **Analytics e bill (CA-06.13.f, g):** receita e mix contam só `status = 'PAID' AND paid_at IS NOT NULL AND deleted_at IS NULL`. `unpaid` e `no_show_risk` filtram o PAID **no `ON` do LEFT JOIN**, então não há duplicação nem falso positivo. PIX PENDING ou EXPIRED deixa a reserva na lista, como manda a D-3 (é intencional, não regressão). O bill lista o VOIDED com `void_reason` e `voided_at`, fora de `total_paid` e de `total_pending`.
- **Outbox (catálogo §4.6):** o UPDATE do status dispara `payment.status_changed` com `previous_status: 'PAID'`. O payload tem as 6 chaves do catálogo, sem motivo nem autor (minimização), e o teste confere as chaves exatas.
- **Testes alterados:** `payments.test.js` (204 → 405) é justificado pelo CA-06.13.a. Os testes de PUT/DELETE em `account-payments.test.js` são justificados pelos CA-06.13.d e a (o executor também acrescentou `expectAccountsMatchReservation`). O `payment.deleted` em `outbox.test.js` passou a ser exercitado por SQL, porque não há mais rota de exclusão. Todos aparecem na lista de "testes alterados (previstos pela SPEC)" do relatório do executor.
- **Dinheiro:** nenhum `Number()` novo sobre DECIMAL. A comparação de valor do PUT usa `toCents`, e o acerto da conta usa centavos `bigint` do banco.
- **Outros:** ESM sem `require`. A rota `/:id/void` não colide com `/:id`, porque o método e o caminho são distintos. Swagger cobre `/void`, o PUT novo, o 405 e o VOIDED. Os `console.error` novos logam só `error.message`, sem PII.

## Não foi possível verificar
- **Migração real** num banco provisionado pelo `schema.sql` antigo seguido de `node command.js migrate`. Validei pelo teste da suíte, que simula o CHECK antigo, e pela leitura do SQL. Não subi um banco de dev antigo.
- **Regeneração do cliente tipado:** `node_modules` do frontend ausente no worktree.
- **LGPD do `void_reason`:** texto livre da gerência pode receber CPF ou nome de hóspede, e aparece no bill e na listagem para qualquer papel com acesso a `/payments`. Não há orientação no Swagger nem limite de conteúdo. É um ponto de atenção para o RF-056, não um achado: não vi o campo ser exportado nem enviado ao outbox.
