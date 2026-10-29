# SPEC-04 · Anexo — Decisões da T-04.5 (bill da reserva soma as contas)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 26/10/2026
**Estado da tarefa:** ✅ concluída — decisões D-54 a D-57 aprovadas pelo Sirlande no plano
**Fonte:** relatório `docs/historico_sessao/sirlande/t045_bill_reserva_contas_26out2026.md`
**Continua:** `SPEC-04-decisoes-repasses-gabriel.md` (D-51 a D-53). A numeração segue daqui.

> A SPEC-04 diz o que entregar (CA-04.5.a–c). Aqui ficam as escolhas que ela não fixava e **por quê**.

---

## 1. O que foi produzido

| Entrega | CAs | Onde |
|---|---|---|
| Bill da reserva calculado a partir das contas, pelo mesmo cálculo do bill de cada conta | a | `app/utils/reservationBill.js` (novo) |
| Controller só abre a transação de leitura e chama o util | a, b | `ReservationApi/GetBillController.js` |
| Razão da reserva guarda diária, consumo e se a conta cobra diária | — | `app/utils/accountPayments.js` (`reservationLedger`, só acrescenta campos) |
| Lista de consumos lê na mesma transação | — | `app/utils/itemAsConsumption.js` (`transaction` opcional) |

Testes: `tests/reservation-bill-accounts.test.js` (novo, 11 testes). `tests/bill-consumptions.test.js` passa **sem alteração** (CA-04.5.c). Nenhum teste existente mudou.

O contrato de resposta é o mesmo (CA-04.5.b): mesmos campos, valores em número. Swagger não muda.

---

## 2. Decisões

### D-54 — Diária que nenhuma conta cobra fica na reserva

Se a reserva não tem nenhuma conta ROOM ativa com `charges_lodging: true`, o `room_total` é o `total_amount` da reserva (0 se cancelada, D-46).

**Por quê:** até a T-04.6, o check-in não cria conta. Toda reserva antes do check-in, e toda estadia sem consumo, não tem conta. Somar só as contas zeraria a diária desses bills — o hotel deixaria de cobrar a estadia. A regra também cobre a estadia que só tem conta de acompanhante (`charges_lodging: false`).

### D-55 — Com conta de diária, vale a soma das diárias das contas

`room_total` é a soma de `room_charges` das contas. A diária gravada no fechamento (`closed_room_charges`, D-39) vale sobre o `total_amount` atual.

**Por quê:** é o que a conta apresentou ao hóspede. O bill da reserva mostrar outro valor era exatamente a divergência que a T-04.5 existe para acabar — e foi o único teste que falhou no código anterior.

### D-56 — Pago e pendente seguem vindo dos pagamentos da reserva

`total_paid` e `total_pending` somam os pagamentos da reserva, como antes.

**Por quê:** com conta de diária, é o mesmo número que a soma do que as contas receberam: o razão põe a sobra do crédito em alguma conta (D-45). Sem conta, é o único lugar onde o sinal PIX aparece. Os valores passam a ser somados em centavos inteiros, não em float — o resultado não muda para valores de 2 casas.

**Limite (🟡-1 do qa-redteam):** sem conta de diária mas com outra conta (só a do acompanhante), o razão da T-04.4 põe o crédito inteiro nessa conta, sem saber que a diária ficou na reserva (D-54). O bill da reserva fica certo; o da conta sai negativo (ex.: sinal 150, diária 400, suco 8 → reserva deve 258, conta mostra −142) e a conta fecha como PAID. Defeito anterior a esta tarefa; ver ponto em aberto 2.

### D-57 — Leitura numa foto só, sem trava

O bill roda numa transação `REPEATABLE READ` com `SET TRANSACTION READ ONLY` imposto no banco (o `readOnly` do Sequelize 6 só escolhe a conexão — 🟢-1 do qa-redteam). Reserva, contas, itens e pagamentos saem do mesmo instante.

**Por quê:** sem isso, um item lançado entre a leitura das contas e a dos itens deixaria `consumptions_total` diferente da lista `consumptions`. Sem trava nenhuma, a ordem reserva → contas (D-48, D-53) não é tocada, e o bill não espera por quem está pagando.

---

## 3. Verificação

- **TDD:** os testes vieram antes. Só o caso da D-55 falhou no código anterior (400 no lugar de 350).
- **Mutação:** 11 mutações manuais em `reservationBill.js`. Uma sobreviveu (`fully_paid` na fronteira, `<= 0` → `< 0`) e foi morta com o teste de pagamento exato; outra era equivalente (só muda com total negativo) e foi descartada.
- **Suíte inteira:** verde.

---

## 4. Pontos em aberto

| # | Ponto | Quando |
|---|---|---|
| 1 | Com a T-04.6 criando conta no check-in, a D-54 passa a valer só para reserva antes do check-in. Reavaliar se ainda vale existir depois | T-04.6 |
| 2 | 🟡-1: o razão (`reservationLedger`) precisa separar a diária sem conta do crédito antes de ratear, senão a conta do acompanhante recebe o sinal que paga a diária e pode ser devolvido. A T-04.6 evita o caso em estadia nova (CA-04.6.b exige conta de diária); estadia antiga continua exposta | T-04.6 |
| 3 | 🟢-3: o bill segura uma conexão por ~3–4 consultas por conta, com o pool no `max: 5` padrão. Medir e configurar o pool | infra |

---

## 5. Auditoria

qa-redteam no diff, 26/10: **APROVADO COM RESSALVAS** (🔴 0 · 🟡 1 · 🟢 3) — `docs/qa/redteam_t045-reservation-bill_26out2026.md`.

| Achado | Tratamento |
|---|---|
| 🟡-1 crédito da reserva vai inteiro para a conta do acompanhante quando nenhuma conta cobra diária | Anterior à T-04.5 (razão da T-04.4). Texto da D-56 e JSDoc corrigidos; correção no razão vira o ponto em aberto 2 |
| 🟢-1 `readOnly` do Sequelize não impõe só leitura | Corrigido: `SET TRANSACTION READ ONLY` no início da transação |
| 🟢-2 teste em paralelo não provava a foto única | Corrigido: os bills lidos no meio das escritas são conferidos por dentro (total − pago = saldo; lista = total de consumos) |
| 🟢-3 conexão presa pelo bill, pool padrão | Ponto em aberto 3 |
