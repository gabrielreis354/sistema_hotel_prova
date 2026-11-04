# SPEC-04 · Anexo — Decisões da T-04.6 (check-in cria a conta da suíte)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 26/10/2026
**Estado da tarefa:** ✅ escopo do MVP concluído, aprovado na reauditoria delta do qa-redteam — CA-04.6.a, c, d entregues (escopo do MVP, painel de 21/10); CA-04.6.e e f já atendidos; **CA-04.6.b fica para o 5º semestre**
**Fonte:** relatório `docs/historico_sessao/sirlande/t046_checkin_conta_26out2026.md`
**Continua:** `SPEC-04-decisoes-T-04.5.md` (D-54 a D-57). A numeração segue daqui.

> A SPEC-04 diz o que entregar (CA-04.6.a–f). Aqui ficam as escolhas que ela não fixava e **por quê**.

---

## 1. O que foi produzido

| Entrega | CAs | Onde |
|---|---|---|
| Check-in abre a conta da suíte na mesma transação | a, c | `ReservationApi/CheckInController.js`, `app/utils/reservationRoomAccount.js` (`openStayAccount`) |
| Contas da reserva | d | `ReservationApi/ListReservationAccountsController.js`, rota em `reservationRouter.js` |
| Crédito da reserva paga primeiro a diária sem conta | — (🟡-1 da T-04.5) | `app/utils/accountPayments.js` (`reservationLedger`) |
| Swagger do check-in e da rota nova | — | `config/swagger.js` |

Testes: `tests/checkin-account.test.js` (novo). `tests/bill-consumptions.test.js` não muda.

**CA-04.6.e e f:** já atendidos pela T-04.1 (`POST /accounts` com `DAY_USE` e sem reserva, em `tests/accounts.test.js`) e pela T-04.3 (diária só em conta ROOM). O CA-f ganhou um teste explícito em `checkin-account.test.js`.

---

## 2. Decisões

### D-58 — O que o check-in abre

Uma conta ROOM, `OPEN`, no quarto principal, cobrando diária, com o hóspede da reserva e o rótulo do sistema (`Suíte 201`, sem nome — D-15). Na reserva de vários quartos, essa conta leva a diária inteira (D-40).

- **Mesma transação, depois da trava da reserva** (D-48): se a conta falha, o check-in volta inteiro (CA-04.6.c).
- **Reaproveita qualquer conta de diária da reserva**, inclusive em outro quarto. A rota antiga de consumo cria a conta da suíte em qualquer status (D-28), então a reserva pode chegar ao check-in com ela. Criar outra dividiria a diária em duas.
- **Não chama o realinhamento** (`realignStaleLodgingAccount`, D-32): ele roda em outra conexão, e o check-in segura a trava da reserva (restrição da D-53). Desde a D-51 a troca de quarto já leva a conta.
- **Corrida com a rota antiga:** ela passa a travar a reserva antes de criar a conta (`reservationRoomAccount`), como o check-in. Quem lança consumo durante o check-in espera e encontra a conta dele. Sem essa trava, os dois INSERTs se esperavam (FK na reserva travada × índice da RN-005) e o banco derrubava o consumo por deadlock — 🟡-1 do qa-redteam. O savepoint do check-in fica como defesa para um caminho que crie conta de diária sem travar a reserva.

### D-59 — A resposta do check-in não muda

Continua sendo a reserva. A conta aberta aparece em `GET /reservations/:id/accounts`.

**Por quê:** o contrato do check-in já é usado; acrescentar um campo não era necessário para nenhum CA.

### D-60 — `GET /reservations/:id/accounts`

Mesmo formato de `GET /accounts`, da mais antiga para a mais nova. Fechadas e pagas entram; excluídas não. 404 para reserva de outro hotel, inexistente ou id não-UUID. O garçom é barrado pela allowlist (`/reservations` não está liberado).

### D-61 — Sem conta de diária, o crédito paga primeiro a diária da reserva

No razão (`reservationLedger`), quando nenhuma conta ROOM cobra diária, o crédito da reserva abate antes a diária que ficou na reserva (D-54: `total_amount`, ou 0 se cancelada ou excluída). Só a sobra é rateada entre as contas (D-45).

**Por quê:** corrige o 🟡-1 do qa-redteam da T-04.5. Antes, o sinal ia inteiro para a conta do acompanhante, que mostrava saldo negativo e fechava `PAID` — a recepção podia devolver o sinal que paga a diária. Com a D-58 o caso não nasce mais em estadia nova; continua possível em estadia com check-in anterior ao deploy e nas reservas `CHECKED_IN` do seed (SQL direto, sem conta).

**Dados existentes:** o `migrate` (`closeEndedStayAccounts`) já recalcula `CLOSED ↔ PAID` das contas fechadas; rodá-lo no deploy corrige o status das contas afetadas.

### D-62 — O encerramento fecha as contas pela ordem do crédito, titular primeiro

`closeReservationAccounts` continua travando as contas em ordem de id (dois encerramentos nunca travam em ordens diferentes), mas fecha na ordem de `creditOrder`: a titular (conta de diária mais antiga) primeiro, depois as outras pela abertura.

**Por quê:** o crédito da reserva preenche as contas fechadas pela ordem em que fecharam (D-45). Fechando em ordem de id, quem recebia o sinal dependia do sorteio dos UUIDs: o sinal do titular podia pagar o consumo do acompanhante, que aparecia quitado sem ter pago. O total da reserva não mudava; a divisão entre quem paga, sim — que é a razão de existir conta separada. Defeito da T-04.4, revelado pelo teste do 🟢-2 (titular do check-in + acompanhante + sinal + check-out), que passava ou falhava conforme os UUIDs.

**Premissa:** a ordem do crédito compara `closed_at` em milissegundos (`Date` do JS), e o banco grava microssegundos. Duas contas fechadas no mesmo milissegundo voltariam a desempatar por id. Não acontece na prática — cada fechamento faz várias idas ao banco —, mas fica registrado (🟢-3 da reauditoria delta).

---

## 3. Testes antigos

Com a D-58, 78 testes das T-04.1 a T-04.5 quebravam: faziam check-in e abriam a conta da suíte à mão, o que a RN-005 passou a recusar (422). Eles testam a mecânica das contas abertas pela recepção, na ordem e com os rótulos que cada regra precisa.

O helper `tests/helpers/legacyStay.js` (`checkInWithoutAccount`) faz o check-in e remove só a conta que ele criou — o estado real das estadias com check-in anterior ao deploy. Em cada arquivo muda só a chamada do check-in. Um teste mudou de valor por causa da D-61 (`account-payments`, "conta de total 0 com só a sobra": o pagamento sobe de 100 para 300, para sobrar 100 depois da diária).

O fluxo novo é testado em `checkin-account.test.js`, inclusive de ponta a ponta (check-in → consumo → pagamento → check-out → conta `PAID` e reserva zerada).

---

## 4. Verificação

- **TDD:** testes antes; 9 de 17 falharam no código anterior. O deadlock do 🟡-1 e o defeito da D-62 ganharam testes determinísticos que falham sem a correção.
- **Mutação:** 17 mutações manuais (check-in, `openStayAccount`, D-61, rota nova). Uma sobreviveu e foi morta com o teste da conta de diária em outro quarto; outra é equivalente (o check-in não usa o retorno da conta depois da corrida).
- **Suíte inteira:** verde.

---

## 5. Pontos em aberto

| # | Ponto | Quando |
|---|---|---|
| 1 | CA-04.6.b — check-in com `accounts: [...]` criando N contas, com ao menos uma cobrando diária (herdado da T-04.3, ponto 5) | 5º semestre |
| 2 | Seed: as reservas `CHECKED_IN` entram por SQL, sem conta | T-04.7 |
| 3 | Reserva excluída: `GET /reservations/:id/accounts` responde 404 (como todas as rotas da reserva); as contas dela seguem em `GET /accounts` (🟢-3) | — |
| 4 | Reserva-bloco B2B: o check-in abre uma conta só, "Suíte <1º quarto>", com o total do contrato (D-40). Contas por quarto são o CA-04.6.b (🟢-4) | 5º semestre |

---

## 6. Auditoria

| Rodada | Veredito | Relatório |
|---|---|---|
| 1ª, diff inteiro | APROVADO COM RESSALVAS (🔴 0 · 🟡 1 · 🟢 4) | `docs/qa/redteam_t046-checkin-account_26out2026.md` |
| Delta das correções | APROVADO (🔴 0 · 🟡 0 · 🟢 3) | `docs/qa/redteam_t046-checkin-account_delta_26out2026.md` |

| Achado | Tratamento |
|---|---|
| 🟡-1 deadlock check-in × consumo pela rota antiga (consumo perdido com 500) | Corrigido: a rota antiga trava a reserva antes de criar a conta. Teste determinístico reproduz o deadlock sem a correção |
| 🟢-1 CA-c só com erro de aplicação | Corrigido: teste com erro real do Postgres dentro do savepoint |
| 🟢-2 sem teste de titular + acompanhante + sinal + check-out | Corrigido; o teste revelou o defeito da D-62 |
| 🟢-3 reserva excluída responde 404 em `/accounts` | Ponto em aberto 3 |
| 🟢-4 reserva-bloco B2B com uma conta só | Ponto em aberto 4 |
| Delta 🟢-1 estadia encerrada durante a espera da trava ganhava conta nova | Corrigido: a trava lê status e exclusão; o consumo responde 422. Teste falha sem a correção |
| Delta 🟢-2 a releitura com trava não tem teste próprio (o `catch` do índice cobre) | Mantida: a releitura é o caminho normal, o `catch` é a rede |
| Delta 🟢-3 empate de `closed_at` no mesmo milissegundo | Registrado como premissa da D-62 |
