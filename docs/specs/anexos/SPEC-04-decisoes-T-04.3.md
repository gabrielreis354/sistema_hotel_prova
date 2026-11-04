# SPEC-04 · Anexo — Decisões da T-04.3 (bill da conta e fechamento)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 19/10/2026
**Estado da tarefa:** ✅ concluída — rateio revisado pelo Sirlande; qa-redteam APROVADO COM RESSALVAS na 3ª rodada
**Fonte:** relatório `docs/historico_sessao/sirlande/t043_bill_fechamento_conta_19out2026.md`
**Continua:** `SPEC-04-decisoes-T-04.2.md` (D-25 a D-32). A numeração segue daqui.

> A SPEC-04 diz o que entregar (CA-04.3.a–g). Aqui ficam as escolhas que ela não fixava e **por quê**.
> D-33 a D-36 e D-39 a D-41 foram escolhidas pelo Sirlande entre alternativas apresentadas. D-39 e D-40 vieram da revisão do rateio e da auditoria do qa-redteam (seção 5).

---

## 1. O que foi produzido

| Entrega | CAs | Onde |
|---|---|---|
| `GET /accounts/:id/bill`: diária, consumos, total, pagamentos, saldo e itens | a, b, c, d, e, f | `app/utils/accountBill.js`, `AccountApi/GetAccountBillController.js` |
| `PUT /accounts/:id/close`: `OPEN → CLOSED`, devolve o bill | g | `AccountApi/CloseAccountController.js` |
| Encerrar a estadia fecha as contas abertas dela | — (N-5 da T-04.2) | `app/utils/closeReservationAccounts.js` + 4 controllers |
| `migrate` fecha as contas que ficaram abertas em estadias já encerradas | — (N-5 da T-04.2) | `database/closeEndedStayAccounts.js`, `command.js` |
| Swagger das duas rotas, com schema de resposta | — | `config/swagger.js` (`AccountBill`) |

Testes: `tests/account-bill.test.js` e `tests/account-close.test.js`. O `tests/bill-consumptions.test.js` não foi alterado.

---

## 2. Decisões

### D-33 — A diária da conta é o rateio do total da reserva
- **O problema:** a reserva guarda um total só para todos os quartos (`total_amount`). Não existe valor de diária por quarto. Numa reserva-bloco B2B, esse total é o preço do contrato, não preço × noites.
- **Decisão:** o `total_amount` é dividido na proporção do preço da categoria de cada quarto. A conta do quarto principal fica com a sobra dos centavos. **Entre quem** o total é dividido mudou na D-40: entre as contas que cobram diária, não entre os quartos.
- **Alternativas descartadas:**
  - *preço atual × noites*: diverge do total da reserva quando o preço da categoria muda depois da reserva, e erra a reserva B2B;
  - *total inteiro na conta do quarto principal*: os outros quartos ficam com 0, e a soma erra quando a recepção abre uma conta por quarto.
- **Justificativa:** a soma das diárias das contas é sempre o total da reserva, centavo por centavo. O preço atual da categoria só define a proporção, nunca o valor. Teste: 3 quartos iguais num contrato de R$ 1.000 dão 333,34 + 333,33 + 333,33.
- **Detalhe técnico:** a conta é feita em centavos inteiros, com `BigInt`. Total em centavos × preço em centavos passa de 2^53 numa reserva grande.

### D-34 — `payments_made` é 0 até a T-04.4
- **O problema:** o pagamento só se liga à reserva. `payments.account_id` nasce na T-04.4.
- **Decisão:** `payments_made` é `'0.00'` e `balance` é igual a `total`. O saldo real da estadia continua em `GET /reservations/:id/bill`.
- **Alternativa descartada:** atribuir os pagamentos da reserva à conta que cobra a diária. Seria uma regra provisória que a T-04.4 vai trocar, e não há resposta certa quando a suíte divide a conta.
- **Registrado no Swagger**, no campo `payments_made`.

### D-35 — Reserva cancelada ou excluída não cobra diária
- **Decisão:** `room_charges` é 0. Os consumos lançados antes seguem cobrados.
- **Justificativa:** cancelada não houve hospedagem. A multa de no-show está fora do escopo da SPEC-04. Já o que foi consumido foi consumido. A exclusão de reserva é correção de cadastro do ADMIN e vale a mesma regra.
- **Vale para a conta ainda aberta** quando a reserva é cancelada ou excluída. Uma conta já fechada mantém a diária gravada (D-39 prevalece): excluir a reserva depois do check-out não muda o que foi apresentado ao hóspede. Escolha do Sirlande sobre o N-2 da reauditoria.

### D-36 — Encerrar a estadia fecha as contas abertas dela
- **Onde:** `closeReservationAccounts`, chamado na transação de quem encerra:
  - check-out;
  - cancelamento;
  - cancelamento do contrato B2B (a reserva-bloco);
  - exclusão da reserva.
- **Regras:**
  - fecha só as contas `OPEN`; o `closed_at` de uma conta já fechada continua o original;
  - se o fechamento falha, o encerramento inteiro volta atrás;
  - a exclusão de reserva passou a usar transação e trava a reserva, porque agora toca duas tabelas.
- **Justificativa:** resolve o N-5 da reauditoria da T-04.2. Antes, a conta da suíte ficava aberta para sempre na lista do garçom, e o DELETE antigo respondia diferente conforme a origem da conta.
- **Arquivos do Gabriel:** os quatro controllers são do módulo de reservas e contratos. A mudança é um import e uma chamada em cada; repasse em `docs/qa/repasses/para_gabriel_19102026.md`.
- **Ordem das travas:** quem lança item trava a conta e lê a reserva sem trava. Quem encerra trava a reserva e depois as contas. Sem ordem cruzada, não há deadlock. Um lançamento em andamento termina antes do fechamento, e o item dele entra no que foi fechado. Teste: lançamento e fechamento simultâneos, 8 rodadas.
- **Uma a uma, em ordem de id:** cada conta fechada grava a diária (D-39) e entra como gravada no rateio da seguinte.
- **Limite conhecido:** uma conta **aberta** exatamente durante o encerramento (`POST /accounts`, ou a rota antiga criando a conta da suíte) pode ficar `OPEN`. Ela não recebe item, porque o lançamento confere a estadia já com a conta travada (D-22 em `/accounts`; na rota antiga desde o 🟢-1 do qa-redteam), e o próximo `migrate` a fecha (D-37). Fechar essa corrida exigiria travar a reserva na abertura de conta, e a rota antiga cria a conta fora de transação de propósito (D-28).

### D-37 — O `migrate` fecha as contas antigas
- **Decisão:** `closeEndedStayAccounts` fecha as contas `OPEN` de reservas com check-out, canceladas ou excluídas. Roda a cada `migrate` e é idempotente.
- **`closed_at` = hora do `migrate`:** a hora real do encerramento não está registrada, e não é inventada (mesmo princípio da D-25).
- **Também grava a diária** das contas fechadas que ainda não a têm (D-39): as fechadas antes da T-04.3, inclusive as que a migração da T-04.2 criou `CLOSED` (D-30).
- **Numa transação só**, e duas vezes por `migrate`: antes da migração de consumo, que pode sair com erro (D-31) e não deve impedir esta, e depois dela, para as contas que ela cria já fechadas receberem a diária na mesma rodada (N-3 da reauditoria, ensaiado num upgrade direto da `main`).

### D-38 — Formato e acesso do bill
- **Valores em texto** (`'24.00'`), como no resto de `/accounts`. O bill antigo da reserva usa número, e não muda (CA-04.5.b).
- **Conta `INTERNAL`:** diária, consumos e total 0 (CA-04.3.f, RN-006). Os itens continuam listados com o valor gravado, e o custo segue visível no `GET /accounts/:id` (D-24).
- **Sem dado do hóspede** na resposta (D-15). Sem `created_by` nos itens: quem lançou é dado interno da equipe.
- **Fechamento com o hóspede hospedado:** permitido para conta que não cobra diária, porque acertar o bar antes de sair é rotina. A conta que cobra diária só fecha com a estadia encerrada (D-41).
- **Papéis:** ADMIN e RECEPTIONIST. O garçom já é barrado pela allowlist (`app/utils/roles.js`), e o `requireRole` na rota repete a regra para ela não depender de um arquivo distante.
- **Consumo antigo não migrado:** o bill e o fechamento respondem 503 (D-31). O fechamento não pode apresentar um total menor.
- **Rota antiga de consumo durante a estadia:** o 🟢-2 do qa-redteam apontou que fechar a conta da suíte no meio da estadia desligava a rota antiga, que usa sempre a conta que cobra a diária. Com a D-41 essa conta não fecha mais no meio da estadia, e o problema deixou de existir.
- **Frigobar conferido depois do check-out:** não ganhou código. A recepção abre uma conta `DIRECT` para o hóspede, o que já funciona. Reabrir conta `CLOSED` não está na máquina de estados da SPEC.

### D-39 — A conta fechada guarda a diária que apresentou
- **O problema (revisão do Sirlande e 🟡-1 do qa-redteam):** o bill era recalculado a cada leitura. Se o preço de uma categoria mudasse, ou se a reserva mudasse de datas, a diária de uma conta já `CLOSED` mudava. O auditor reproduziu contas fechadas passando de 200/200 para 100/300. Isso contraria a D-23: o que foi apresentado não muda.
- **Decisão:** coluna `closed_room_charges` em `accounts`, gravada no fechamento (manual, encerramento da estadia e `migrate`). O bill da conta fechada lê esse valor.
- **Efeito sobre as abertas:** dividem só o que sobra do total depois das diárias gravadas. Sem isso, a conta fechada com 600 e a aberta recalculada com o preço novo somariam mais que o total da reserva. Se o total mudar depois (prorrogação), as abertas absorvem a diferença. Se cair abaixo do que já foi gravado, as abertas ficam com 0: o apresentado não é desfeito.
- **Não fere o CA-04.3.b**, que proíbe gravar o **saldo**. O saldo continua calculado a cada leitura.
- **Banco:** CHECK `accounts_closed_room_charges_only_closed` (conta aberta não tem valor gravado) e `accounts_closed_room_charges_non_negative`. O CHECK não exige o contrário (fechada ⇒ gravada), porque as contas fechadas antes da T-04.3 só recebem o valor no fim do `migrate`. Enquanto não recebem, calculam na hora.

### D-40 — O total da reserva é dividido entre as contas que cobram diária
- **O problema (🔴-1 do qa-redteam):** o rateio da D-33 dividia entre os **quartos**. Numa reserva Luxo + Standard de R$ 1.500 com uma conta só, a conta fechava com R$ 910, e o bill da reserva dizia R$ 1.510. A diária do quarto sem conta não entrava em conta nenhuma. Isso já acontecia com as contas da rota antiga e da migração da T-04.2, que criam uma conta por reserva.
- **O mesmo defeito na troca de quarto (🟡-3):** a regra herdada da D-32 ("só cobra diária a conta cujo quarto ainda é da reserva") deixava a conta do quarto antigo com 0, e nenhuma outra cobrava. Havia um teste prendendo esse comportamento.
- **Decisão:** o total é dividido entre as **contas** da reserva que cobram diária. O peso de cada conta é o preço da categoria do quarto dela, inclusive se o quarto saiu da reserva. Com uma conta só, ela leva o total. A sobra dos centavos fica na conta do quarto principal, ou, sem ela, na mais antiga.
- **Alternativa descartada:** dividir entre os quartos que têm conta, mantendo a D-32. Depois de uma troca de quarto, o total ficaria sem cobrança até a recepção abrir conta no quarto novo.
- **Substitui** a regra da D-32 para o bill. O realinhamento da D-32 continua, só para conta aberta (🟡-1).
- **Duas contas depois de uma troca** (N-1 da T-04.2): dividem o total, nunca o dobram.

### D-41 — A conta que cobra diária só fecha com a estadia encerrada
- **O problema (N-1 da reauditoria, 🔴):** fechada no meio da estadia, a conta gravava a diária (D-39) e não acompanhava uma mudança de datas. Com uma conta por reserva, que é o caso comum da D-40, não sobra conta aberta para absorver a diferença. O auditor reproduziu os dois lados:
  - **prorrogação:** a conta ficou em R$ 300, a reserva foi a R$ 500, e não dá para abrir outra conta de diária no mesmo quarto (RN-005). R$ 200 sem cobrança;
  - **encurtamento:** a conta ficou em R$ 400, a reserva caiu a R$ 100, e o hóspede seria cobrado por noites que não ficou.
- **Decisão:** `PUT /accounts/:id/close` responde 422 para conta `ROOM` com `charges_lodging: true` enquanto a reserva não tiver check-out nem cancelamento. Essa conta fecha pelo encerramento da estadia (D-36). Allowlist: só `CHECKED_OUT` e `CANCELLED` liberam. Reserva excluída também libera, porque a conta sobrou da corrida da D-36.
- **Acertar o consumo antes de sair** continua possível numa conta sem diária ou `DIRECT`.
- **Alternativa descartada:** proibir a mudança de datas e de quarto enquanto houver conta de diária fechada. Mexeria no `UpdateReservationController`, que é do Gabriel, e travaria a prorrogação na recepção.
- **Junto:** `closeAccount` só fecha conta `OPEN` e falha se não fechar nenhuma (N-4), para um chamador futuro não regravar conta fechada.

---

## 3. Efeito sobre pendências herdadas

| Pendência | Origem | Situação |
|---|---|---|
| Só cobra diária a conta cujo quarto ainda é da reserva | T-04.2 §4.7, D-32 | 🔁 **Substituída pela D-40.** A regra deixava a diária sem cobrança depois de uma troca de quarto. Agora o total é dividido entre as contas da reserva, e duas contas depois de uma troca dividem em vez de dobrar. O repasse ao Gabriel continua valendo para a conta não ficar apontando para o quarto errado |
| Fechar no check-out e no cancelamento, inclusive as abertas antes | T-04.2 §4.7, N-5 | ✅ D-36 e D-37 |
| Conta INTERNAL fecha com total 0 | T-04.1 §3.6, D-24 | ✅ D-38 |
| Caminho para cobrar consumo descoberto depois do check-out | N-5 | ✅ conta `DIRECT` (D-38), sem código novo |
| `GET /accounts/:id` com consumo não migrado mostra total sem ele | T-04.2 §4.6 | ➖ mantido: o bill e o fechamento, que é onde o valor é apresentado, respondem 503. Some com a migração concluída |

---

## 4. Pontos em aberto

| # | Ponto | Quando |
|---|---|---|
| 1 | `fromCents` não formata valor negativo. Hoje o saldo nunca é negativo (pagamento 0), mas na T-04.4 pode ser | T-04.4 |
| 2 | `payments_made` real, e `CLOSED → PAID` | T-04.4 |
| 3 | Corrida de abertura de conta durante o encerramento (D-36, limite) | Só se aparecer em uso real; o `migrate` limpa |
| 4 | Nenhuma rota de `/contracts` está no Swagger do core-service, então o fechamento de contas no cancelamento do contrato (D-36) só está registrado aqui | Gabriel (dono de contratos) |
| 5 | **Check-in com várias contas.** O CA-04.6.a cria uma conta no check-in sem corpo. Com a D-40 ela leva o total da reserva, o que está certo. Com `accounts: [...]` (CA-04.6.b), só as contas com `charges_lodging: true` dividem o total, e ao menos uma precisa cobrar diária, senão o total fica sem conta | T-04.6 |

---

## 5. Auditoria

| Rodada | Relatório | Veredito | Resultado |
|---|---|---|---|
| 1ª | `docs/qa/redteam_t043-account-bill_19out2026.md` | REPROVADO (🔴-1) | 🔴-1 e 🟡-3 → D-40; 🟡-1 → D-39 e realinhamento só de conta aberta; 🟡-2 → consulta na mesma transação; 🟢-1 → releitura na trava; 🟢-2 → documentado |
| 2ª (delta) | `docs/qa/redteam_t043-account-bill_delta_19out2026.md` | REPROVADO (N-1) | N-1 → D-41; N-2 → D-35 ajustada; N-3 → `migrate` grava duas vezes; N-4 → `closeAccount` só fecha conta aberta |
| 3ª (delta) | `docs/qa/redteam_t043-account-bill_delta2_19out2026.md` | APROVADO COM RESSALVAS | Sem 🔴 nem 🟡. N-5 e N-6 → testes novos; N-7 → o `migrate` grava a diária no `finally` da migração de consumo |
