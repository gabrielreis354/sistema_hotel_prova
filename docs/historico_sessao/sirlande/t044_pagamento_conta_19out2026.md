### 2026-10-19 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t044-payment-account` (sai de `develop` em `ee5a685`) · **Tarefa:** T-04.4 (SPEC-04 §5)
- **Objetivo:** ligar pagamento a conta: `payments.account_id`, `payments_made` real no bill da conta, `CLOSED → PAID`, com o fluxo PIX intacto (CA-04.4.a a e)

#### Contexto de abertura

- Mesma sessão do fechamento da T-04.3; PR #98 já mergeado, `main` igual ao `develop`.
- Research:
  - `payments.reservation_id` era NOT NULL;
  - o bill da conta tinha `payments_made = 0` fixo (D-34);
  - o webhook PIX e o motor de reserva só conhecem a reserva;
  - o evento `payment.*` do outbox publica `reservation_id`;
  - `fromCents` quebrava com valor negativo;
  - lançar e excluir item já usam allowlist `OPEN`, então conta `PAID` já fica bloqueada para item.

#### Decisões desta sessão

D-42 a D-44 foram aprovadas no plano; D-45 e D-46 vieram dos 🟡 de regra da 1ª auditoria, também aprovadas pelo Sirlande. Justificativa completa em `docs/specs/anexos/SPEC-04-decisoes-T-04.4.md`.

| # | Decisão | Escolha |
|---|---|---|
| D-42 | Pagamento da reserva sem conta | É crédito das contas da reserva (substitui a D-34); titular = conta de diária mais antiga |
| D-43 | Quando vira `PAID` | Só `CLOSED → PAID`, com pagamento e saldo ≤ 0; volta a `CLOSED` se o saldo reabrir; conta de total 0 só com pagamento direto |
| D-44 | Pagamento a maior | Aceito, saldo negativo; conta `PAID` e `INTERNAL` não recebem por `account_id` |
| D-45 | Rateio do crédito | Fechadas primeiro, pela ordem de fechamento; depois as abertas, titular primeiro; sobra na primeira com total |
| D-46 | Bill da reserva cancelada | Diária 0, como nas contas |
| D-47 | Coerência no banco | Trigger `payments_account_consistency` em vez de FK composta |
| D-48 | Ordem de trava | Reserva → contas em todo caminho que paga ou fecha conta (`lockAccount`) |
| D-49 | `amount` | Positivo, até 2 casas, dentro de NUMERIC(12,2); CHECK `NOT VALID` |
| D-50 | `migrate` | Acerta `CLOSED ↔ PAID` das contas existentes; idempotente |

#### O que foi feito

1. **TDD:** `tests/account-payments.test.js` escrito antes do código, com 27 testes falhando pelos motivos certos.
2. **Teste existente alterado (um só):** em `account-bill.test.js`, o CA-04.3.a esperava `payments_made = 0` (D-34). Passou a esperar o sinal na conta titular, em commit separado. No plano eu tinha dito que nenhum teste existente mudaria, e esse caso só apareceu na leitura dos testes.
3. **Banco:**
   - `account_id` e `DROP NOT NULL` explícito, pela lição da T-04.2;
   - o CHECK reserva-ou-conta;
   - trigger de coerência no lugar da FK composta. A FK exigia um UNIQUE total que o guarda `db-constraints.test.js` recusa;
   - CHECK de valor.
4. **Regra:**
   - `accountCharges.js` (o que a conta cobra) saiu de `accountBill.js`, para evitar import circular;
   - `accountPayments.js` cuida do razão da reserva e do rateio;
   - `settleAccount` e `settlePaymentAccount` fazem o acerto;
   - `lockAccount` impõe a ordem de trava.
5. **Controllers:** `POST`, `PUT` e `DELETE /payments`; fechamento de conta; webhook PIX (uma chamada a mais, na transação que confirma); bill da reserva cancelada.
6. **`migrate`:** passo 3 de `closeEndedStayAccounts`.
7. **qa-redteam, 1ª rodada: APROVADO COM RESSALVAS.** 🟡-1 e 🟡-2 eram regra de dinheiro e foram ao Sirlande. O 🟡-1 era o efeito colateral que eu tinha avisado no plano, e o auditor mostrou que ele pega o caso mais comum (um quarto e uma conta de bar). Viraram D-45 e D-46. O 🟡-3 (deadlock reproduzido) e o 🟡-4 (valor negativo aceito) foram corrigidos direto, assim como os 🟢.
8. **2ª rodada: REPROVADO.**
   - 🔴-1: o rateio da D-45 abriu uma corrida. Dois fechamentos em paralelo ficavam com o mesmo crédito.
   - 🟡-1: deadlock em dois pagamentos pela reserva.

   Os dois foram corrigidos estendendo a ordem reserva → conta ao fechamento e ao `POST` pela reserva. Também entraram seis 🟢: sobra estável, relógio do banco, razão calculado uma vez, soma com sinal, teto do valor e teste de ordem determinístico.
9. **3ª rodada: APROVADO COM RESSALVAS.**
   - O auditor desfez cada correção da 2ª e confirmou que os testes pegam o defeito.
   - Ressalvas, corrigidas antes do merge:
     - deadlock com reserva excluída (`paranoid: false` na trava);
     - conta de total 0 só vira `PAID` com pagamento direto;
     - total do bill derivado das partes.

#### Verificação

- `npm test`: **836 passed + 1 skip**, em 39 arquivos. Antes eram 775.
  - `public-booking.test.js` e `bill-consumptions.test.js` não foram alterados.
  - Os testes de webhook do Mercado Pago e do Asaas passam.
- **Mutação:** 4 rodadas, 40 mutações nos pontos críticos.
  - Sobreviventes que viraram teste:
    - conta sem diária aberta antes da titular;
    - titular primeiro entre as abertas;
    - ordem entre as fechadas.
  - Uma equivalente foi removida do código: a checagem de INTERNAL no acerto.
  - Uma mal escrita foi refeita: a soma com sinal.
- **Deadlocks:** cada correção foi conferida desfazendo-a. Sem ela, o teste de concorrência dá `deadlock detected` nas 3 rodadas; com ela, passa.
- **Ensaio num banco no estado do `develop`, com dados:** worktree do `develop`, `migrate` e dados pela API do `develop`. O ensaio foi feito duas vezes, a segunda depois do rateio. No banco havia 7 contas: estadia paga na reserva, estadia com só o sinal, hospedada paga, mesa, suíte mais bar pagos pela reserva, e interna.
  - O `migrate` desta branch saiu com código 0 e acertou 3 contas para `PAID`: a estadia paga, a suíte e o bar.
  - Na segunda rodada, acertou 0.
  - CHECK, trigger e `DROP NOT NULL` ficaram no banco.
  - Pela API nova: pagar o resto na conta, pagar a mesa e fazer check-out da hospedada deixaram todas `PAID`, e o saldo de cada reserva bateu com a soma das contas.
  - Banco e worktree apagados ao final.
- **`qa_checks.sh`:** sem erro. Os 3 avisos são do frontend e anteriores a esta branch.

#### Commits

| Hash | Mensagem |
|------|----------|
| `55c5613` | `test(payments): testes RED da T-04.4 - pagamento ligado a conta (CA-04.4.a a e)` |
| `166f8a1` | `test(accounts): CA-04.3.a espera o pagamento da reserva na conta titular` |
| `15d2a32` | `fix(utils): fromCents formata valor negativo` |
| `2b61bbf` | `test(payments): teste do NOT NULL roda antes dos pagamentos sem reserva` |
| `2d35d77` | `feat(db): payments.account_id, CHECK reserva-ou-conta e FK composta (CA-04.4.a e b)` |
| `f0baea1` | `feat(accounts): payments_made real e acerto CLOSED <-> PAID (CA-04.4.c)` |
| `b58e4e6` | `feat(payments): POST /payments aceita account_id e acerta a conta (CA-04.4.a)` |
| `5f1796f` | `feat(pix): webhook acerta a conta do pagamento confirmado (CA-04.4.d)` |
| `7e369e0` | `feat(db): migrate marca PAID as contas fechadas ja pagas` |
| `56ef5dc` | `fix(db): trigger de coerencia pagamento-conta no lugar da FK composta` |
| `6ad02e5` | `test(payments): mata os mutantes sobreviventes da T-04.4` |
| `a5a6596` | `docs(api): pagamento da conta no Swagger e comentarios do ciclo da conta` |
| `da4125e` | `fix(payments): achados do qa-redteam da T-04.4 (deadlock, valor, trigger, migrate)` |
| `fd4aeb0` | `feat(accounts): credito da reserva rateado entre as contas (D-45, 🟡-1)` |
| `d40f1dc` | `fix(reservations): bill da reserva cancelada nao cobra diaria (D-46, 🟡-2)` |
| `c027710` | `test(payments): RED da reauditoria delta da T-04.4` |
| `9f6dae4` | `fix(accounts): achados da reauditoria delta da T-04.4` |
| `3c359b9` | `test(payments): RED da 3a rodada do qa-redteam da T-04.4` |
| `b15c903` | `fix(accounts): achados da 3a rodada do qa-redteam da T-04.4` |
| (este) | `docs(accounts): relatorio, decisoes D-42 a D-50 e auditorias da T-04.4` |

#### Pendências para o próximo

- **T-04.5** (delegação do bill da reserva): a soma dos saldos das contas já é o `balance_due`, inclusive na reserva cancelada (D-46). O helper `expectAccountsMatchReservation` serve de base para o CA-04.5.a.
- **T-04.6:** a primeira conta de diária criada no check-in vira a titular (D-42). Ao menos uma conta precisa cobrar diária (herdado da T-04.3).
- **Deploy (repasse ao Weslley, soma ao da T-04.2 e T-04.3):** rodar o `migrate` antes e depois do rollout. Ele:
  - cria `payments.account_id`, o CHECK e o trigger;
  - acerta `CLOSED ↔ PAID`, inclusive o que um pod antigo deixar desatualizado no rolling update.
- **Frontend:** `api-client/schema.d.ts` desatualizado (falta `/accounts` desde a T-04.1 e `account_id`).
- **Gabriel:** o catálogo de eventos diz que `payment.reservation_id` é UUID, mas agora pode vir nulo. Estorno ou chargeback depois de `PAID` não é tratado. Repasse em `docs/qa/repasses/para_gabriel_19102026.md`.
- **Dono indefinido:** `PUT` e `DELETE /payments` sem restrição de papel. Repasse em `docs/qa/repasses/para_indefinido_19102026.md`; a correção de fundo é o estorno da SPEC-06.
