### 2026-10-21 — Gabriel (orquestrando Claude Code)

- **Branch:** `fix/t0613-estorno-pagamento` (a partir de `origin/develop` em `c6742b2`)
- **Objetivo da sessão:** T-06.13 da SPEC-06 — estorno (`VOIDED`) no lugar da exclusão de pagamento (CA-06.13.a a i)
- **Estado:** implementada, com push. **Sem PR e sem merge**: aguarda o `qa-redteam`.

#### Contexto

Lançamento financeiro não se apaga — se estorna (D-2 do catálogo de eventos, 04/10). Antes,
`DELETE /payments/:id` fazia *soft delete* sem motivo nem autor, a receita seguia somando o excluído,
qualquer papel excluía, e (desde a T-04.4) excluir o pagamento que quitava uma conta a devolvia de PAID
para CLOSED sem trilha. O `PUT` deixava reduzir o valor do mesmo jeito (repasse de 19/10,
`docs/qa/repasses/para_indefinido_19102026.md`).

#### O que foi feito

| Peça | Mudança |
|---|---|
| `POST /payments/:id/void` (`VoidPaymentController.js`, novo) | Só ADMIN. `reason` obrigatório (texto não vazio, aparado, até 500). Allowlist só `PAID → VOIDED`; VOIDED de novo, PENDING/FAILED/EXPIRED e pagamento de PSP (`provider` preenchido) → 409. Grava `status`, `void_reason`, `voided_by` (JWT), `voided_at` (relógio do banco) num UPDATE só, condicionado ao status lido. Acerta as contas na mesma transação (`settlePaymentAccount`): a conta que ele quitava volta a CLOSED. Resposta pelo `defaultScope` (sem dados do PSP) |
| `DELETE /payments/:id` | `DeletePaymentController.js` removido. A rota responde 405 com `Allow: GET, PUT` e o caminho do `void`, atrás do `requireRole('ADMIN')` (RECEPTIONIST → 403, conforme o critério da delegação) |
| `PUT /payments/:id` | Só ADMIN. Corrige método ou data de pagamento PAID manual; `amount` só é aceito igual ao gravado (diferente → 409: estorno + novo lançamento). VOIDED, PENDING/EXPIRED/FAILED e PSP → 409. Trava o pagamento contra estorno simultâneo. Sem acerto de conta: valor, reserva e conta não mudam mais por ele |
| `app/utils/paymentEnums.js` (novo) | `PAYMENT_STATUSES` (com VOIDED), `VOIDABLE_STATUSES`, `EDITABLE_STATUSES`, `VOID_REASON_MAX_LENGTH` — fonte única para model, CHECK e controllers |
| `PaymentModel` | `validate: isIn` no status; colunas `void_reason`, `voided_by` (FK `users`), `voided_at` |
| Banco (`applyDbConstraints.js` + `db/schema.sql`) | `payments_status_allowlist` (DROP do `payments_status_check` automático do schema.sql antigo, que recusaria VOIDED), `payments_voided_has_trail`, `payments_trail_only_voided`. NOT VALID no migrate, como o `payments_amount_check` |
| Analytics | `GetRevenueController` e `GetPaymentMixController`: só `status = 'PAID' AND deleted_at IS NULL` (CA-06.13.f e defeito D-2). `unpaid` e `no_show_risk` (`GetAlertsController`): só pagamento PAID tira a reserva da lista (D-3), para o estornado não esconder a reserva |
| `GetBillController` | Lista o estornado com `void_reason` e `voided_at`; `total_paid` continua só PAID (CA-06.13.g) |
| Swagger | `/payments/{id}/void`, 405 no DELETE, PUT novo, VOIDED e trilha no `Payment` e no bill, notas de receita e mix |
| Docs | Catálogo de eventos §4.6 (VOIDED via `payment.status_changed`; `payment.deleted` não sai mais por rota), `ARQ_DATABASE.md`, SPEC-06 T-06.13 marcada com evidência |

**Integração com a conta (T-04.4):** nenhuma regra de fechamento mudou. O razão
(`reservationLedger`/`accountBalance`) já somava só `PAID`; o estorno só chama o `settlePaymentAccount`
existente. Ordem de trava do estorno: pagamento → reserva → contas, a mesma do webhook PIX.

**Testes alterados (previstos pela SPEC):** `payments.test.js` (204 → 405), `account-payments.test.js`
(DELETE → void; PUT de valor → 409 ou estorno + novo lançamento), `outbox.test.js` (o `payment.deleted`
agora vem de exclusão lógica por SQL; novo teste do `status_changed` PAID → VOIDED).

#### CA → evidência (`tests/payment-void.test.js`, salvo indicação)

| CA | Teste |
|---|---|
| a | `CA-06.13.a — responde 405 indicando o estorno…`; `payments.test.js > DELETE /payments/:id` |
| b | `estorno feliz…`; `400 sem motivo, com motivo vazio, só de espaços, não-texto ou longo demais` |
| c | `estornar de novo → 409`; `pagamento de PSP → 409`; `pagamento PENDING/FAILED/EXPIRED → 409`; `estorno concorrente: um 200 e um 409, nunca 500` (5 rodadas, 1 evento só) |
| d | `RECEPTIONIST → 403 no POST void, no PUT e no DELETE`; `RECEPTIONIST segue registrando e lendo pagamento` |
| e | bloco `CA-06.13.e — banco` (allowlist, trilha obrigatória, trilha só no anulado, FK `users`, troca do CHECK antigo) |
| f | `revenue e payment-mix deixam de contar o anulado (e o excluído antigo)`; `reserva cujo único pagamento foi anulado volta a aparecer como não paga` |
| g | `aparece na listagem e na conta da reserva com status e motivo; não soma no pago` |
| h | `pagamento de outro hotel → 404 no void e no PUT`; `id inexistente ou não UUID → 404` |
| i | todos os acima + `Estorno acerta a conta na mesma transação` (PAID → CLOSED; novo lançamento quita de novo) e `PUT` (valor → 409, VOIDED → 409, PSP → 409, status pelo corpo ignorado) |
| eventos | `outbox.test.js > estorno (T-06.13) gera payment.status_changed PAID → VOIDED` |

#### Verificação real

Banco de teste próprio (`pg-t0613`, porta 5442).

Baseline (`origin/develop`, antes da mudança):
```
 Test Files  39 passed (39)
      Tests  836 passed | 1 skipped (837)
Statements   : 83.4% ( 2719/3260 )
```

RED (só os 4 arquivos tocados, antes da implementação): `Tests 32 failed | 87 passed (119)` — todas as
falhas eram dos testes da T-06.13.

Depois (`npx vitest run --coverage`, suíte completa):
```
 Test Files  40 passed (40)
      Tests  865 passed | 1 skipped (866)
   Duration  99.89s
Statements   : 83.65% ( 2759/3298 )
Branches     : 79.53% ( 1426/1793 )
Functions    : 88.7% ( 322/363 )
Lines        : 86.1% ( 2498/2901 )
```

`bash scripts/qa_checks.sh`: saída idêntica antes (worktree de `origin/develop`) e depois (`diff` sem
diferença) — `⚠ 3 aviso(s). Nenhum erro bloqueante.`, exit 0. Os 3 avisos são do frontend, anteriores.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `07277f4` | `test(payments): RED do estorno VOIDED no lugar da exclusao (T-06.13)` |
| `c1cb04b` | `fix(payments): estorno VOIDED no lugar da exclusao de pagamento (T-06.13)` |
| `9147c82` | `docs(swagger): estorno de pagamento e 405 no DELETE (T-06.13)` |
| `5b67b84` | `docs(payments): catalogo de eventos, schema e SPEC-06 com o estorno (T-06.13)` |
| (este) | `docs(historico): add session report 2026-10-21 (gabriel)` |

#### Decisões de implementação (para o qa-redteam conferir)

1. **DELETE atrás do ADMIN:** RECEPTIONIST recebe 403, ADMIN recebe 405. Segue o critério da delegação
   ("RECEPTIONIST → 403 em POST void, PUT e DELETE").
2. **PUT só em PAID manual:** além do valor, recusa (409) VOIDED, status de PSP e pagamento de PSP —
   mesma razão do CA-06.13.c. Antes o PUT aceitava qualquer status.
3. **`unpaid`/`no_show_risk` só com PAID:** necessário para o estornado não esconder a reserva; muda
   também o caso de cobrança PIX PENDING/EXPIRED (que agora deixa a reserva na lista), o que é a D-3 do
   catálogo, já aceita. A versão "saldo > 0" da D-3 para `unpaid` continua pendente (projeção T-01.4).
4. **Ordem de trava pagamento → reserva → contas**, a do webhook; não cruza com a do POST (reserva →
   conta) porque o POST não trava pagamento existente.

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Rodar o `qa-redteam` sobre a branch antes do merge | 🔴 Alta | Push feito; sem PR nem merge, por instrução |
| 2 | Regerar `frontend/packages/api-client/openapi.json` e `src/schema.d.ts` | 🟡 Média | `pnpm --filter api-client generate` com os node_modules do frontend; não instalados neste worktree. O frontend não chama `DELETE /payments` (pesquisa de 12/10 da SPEC) |
| 3 | `REFUNDED` (devolução pelo PSP) e o estorno no PSP ignorado pelo webhook | 🟡 Média | Fora do escopo (SPEC-06 T-06.13); ver 🟡-4 de `docs/qa/redteam_mercadopago-pix_delta_12out2026.md` |
| 4 | `revenue.unpaid` como "saldo > 0" (D-3 refinada) | 🟢 Baixa | Hoje é "sem nenhum PAID"; a forma definitiva vai na projeção do analytics (T-01.4) |
| 5 | Fechamento de caixa por turno (RF-056) consumir os VOIDED | 🟢 Baixa | Fora do escopo |

---

### 2026-10-21 (2ª entrada) — Gabriel (orquestrando Claude Code): ressalvas do qa-redteam

- **Branch:** `fix/t0613-estorno-pagamento` (mesma)
- **Origem:** `docs/qa/redteam_t0613-estorno-pagamento_21out2026.md` (commit `c191eb6`), **APROVADO COM RESSALVAS**
- **Banco de teste:** `pg-t0613`, porta 5442, recriado para esta rodada e removido no fim

#### O que foi feito

| Achado | Correção |
|---|---|
| 🟡-1 `PUT {paid_at: null}` tirava da receita um PAID sem estorno | `UpdatePaymentController` recusa `paid_at` nulo, vazio, inválido ou não-texto (400). Novo CHECK `payments_paid_has_paid_at` (`status <> 'PAID' OR paid_at IS NOT NULL`) em `applyDbConstraints.js` e `db/schema.sql`, criado **NOT VALID** como os outros: a linha antiga PAID sem data fica, só não entra nova (consulta para conferir no comentário do `applyDbConstraints`) |
| 🟢-1 `method` livre e 500 em `paid_at`/`method` inválidos | `PAYMENT_METHODS` em `app/utils/paymentEnums.js` (a lista do Swagger) e validadores em `app/utils/paymentInput.js`, usados no PUT **e** no `CreatePaymentController` (fecha também o repasse de dono indefinido do relatório do qa, mesma área — não foi gravado arquivo de repasse). O Swagger passa a importar `PAYMENT_METHODS` e `PAYMENT_STATUSES` e descreve os novos 400 |
| 🟢-2 sem teste de `no_show_risk` e das corridas | Testes de `no_show_risk` (PAID tira da lista; estornado, PIX PENDING e sem pagamento deixam) e corridas estorno ∥ check-out e estorno ∥ novo pagamento na mesma conta, 6 rodadas cada. São determinísticos porque conferem o estado final, que é o mesmo nas duas ordens |
| 🟢-4 comentário "D-3" no `unpaid` | `GetRevenueController` diz o que a consulta faz (sem nenhum PAID) e que o "saldo > 0" da D-3 fica para a projeção da T-01.4 |
| 🟢-3 cliente tipado do frontend | Fora, por decisão do coordenador: regenerado depois do merge, junto com as outras frentes |

**Testes existentes ajustados (consequência prevista do novo CHECK e da allowlist):** fixtures de
`account-payments.test.js` que gravavam `PAID` sem `paid_at` ganharam a data, e `payments.test.js`
trocou `'CARTAO'` (fora da allowlist) por `'CARTAO_CREDITO'` no teste do 404.

**RED:** `Tests 6 failed | 109 passed (115)` nos 3 arquivos, todas as falhas das regras novas. Os testes
de `no_show_risk` e das corridas já passavam: protegem o comportamento atual.

#### Verificação real

`npx vitest run --coverage`, suíte completa:
```
 Test Files  40 passed (40)
      Tests  881 passed | 1 skipped (882)
   Duration  89.63s
Statements   : 83.76% ( 2775/3313 )
Branches     : 79.67% ( 1443/1811 )
Functions    : 88.76% ( 324/365 )
Lines        : 86.16% ( 2510/2913 )
```

`bash scripts/qa_checks.sh`: saída idêntica à de `origin/develop` (`diff` vazio) —
`⚠ 3 aviso(s). Nenhum erro bloqueante.`, exit 0.

#### Orientação de uso — LGPD do `void_reason`

O motivo do estorno é **texto livre da gerência** e aparece na listagem (`GET /payments`) e no bill da
reserva para todo papel com acesso a pagamentos. Ele não vai ao outbox nem é exportado. Orientação para o
hotel e para o frontend: **descrever o lançamento, não o hóspede**. Exemplos: "valor digitado errado",
"lançado na reserva errada", "duplicado". Não usar nome, CPF, telefone nem dado de cartão — a reserva e o
pagamento já identificam o caso. Quando a tela de estorno existir, o campo deve trazer essa orientação
como texto de apoio. Revisar junto com o fechamento de caixa (RF-056), que vai exibir os anulados.

#### Commits gerados (2ª entrada)

| Hash | Mensagem |
|------|----------|
| `71a108e` | `test(payments): RED das ressalvas do qa-redteam da T-06.13` |
| `71c829d` | `fix(payments): ressalvas do qa-redteam da T-06.13` |
| (este) | `docs(historico): ressalvas do qa-redteam da T-06.13 (gabriel)` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Abrir o PR da branch | 🟡 Média | Não aberto, por instrução |
| 2 | Regerar o cliente tipado do frontend (🟢-3) | 🟡 Média | Depois do merge, junto com as outras frentes |
| 3 | O seed (`seed/seed_hotels.sql`) grava `method = 'CARTAO'`, fora da allowlist nova | 🟢 Baixa | A API não aceita mais esse valor, mas a linha antiga continua legível e entra no `payment-mix` como `CARTAO`. Decidir com o dono do seed se vira `CARTAO_CREDITO`; sem CHECK de método no banco por isso |
| 4 | `REFUNDED`, `unpaid` como "saldo > 0" e RF-056 | 🟢 Baixa | As mesmas da 1ª entrada |
