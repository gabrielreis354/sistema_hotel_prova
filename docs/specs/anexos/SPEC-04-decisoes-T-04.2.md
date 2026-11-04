# SPEC-04 · Anexo — Decisões da T-04.2 (migração `Consumption` → `AccountItem`)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 19/10/2026
**Estado da tarefa:** ✅ concluída
**Fonte:** relatório `docs/historico_sessao/sirlande/t042_migracao_consumo_19out2026.md`
**Continua:** `SPEC-04-decisoes-T-04.1.md` (D-1 a D-24). A numeração segue daqui.

> A SPEC-04 diz o que entregar (CA-04.2.a–e). Aqui ficam as escolhas que ela não fixava e **por quê**.

---

## 1. O que foi produzido

| Entrega | CAs | Onde |
|---|---|---|
| Migração dos dados de `consumptions` para `account_items`, idempotente e numa transação, no fim do `node command.js migrate` | a, b, c | `database/migrateConsumptions.js`, `command.js` |
| Rotas antigas `/reservations/:id/consumptions` (POST, GET, DELETE) com o mesmo contrato, gravando e lendo via conta | d | `ConsumptionApi/*`, `app/utils/reservationRoomAccount.js`, `app/utils/itemAsConsumption.js` |
| Bill da reserva lendo os itens das contas, contrato idêntico | e | `GetBillController.js` — `tests/bill-consumptions.test.js` passa **sem alteração** |
| Colunas `origin` e `consumed_at` em `account_items` | — | `AccountItemModel`, `applyDbConstraints`, `schema.sql` |

**Garantias da migração:**
- Cada consumo vira um item com o **mesmo id**: links e DELETEs antigos continuam valendo.
- Valor igual (`quantity 1`, `unit_price = total = amount`); `created_at`, `consumed_at`, `deleted_at` e `deleted_by` preservados.
- Por reserva (D-31): reserva com dado inválido (valor que não cabe na coluna nova, hotel do consumo diferente do da reserva) fica para trás **inteira**, as outras migram, e o `migrate` sai com erro listando-as. Enquanto isso, o bill e a lista dela respondem 503.
- Verificação linha a linha no fim (id, hotel, reserva, descrição, quantidade, preço, total, `created_at`, `consumed_at`, `deleted_at`, `deleted_by`): divergência ali é defeito da migração e desfaz tudo.
- Rodar de novo não duplica nada.

**Ensaiada num banco real no estado do `develop`, com dados** — não só no banco de teste, que nasce vazio. O ensaio achou dois defeitos que os testes não pegariam (seção 3). Auditada pelo qa-redteam, que reprovou a primeira versão por um 🔴 (seção 3); as correções estão nas decisões D-30 a D-32.

---

## 2. Decisões

### D-25 — Origem do item; autoria desconhecida fica nula
- **O problema:** `consumptions` não registrava quem lançou, e em `account_items` o `created_by` era obrigatório.
- **Alternativas descartadas:** atribuir ao criador da reserva ou ao primeiro ADMIN do hotel. As duas **inventam** autoria numa trilha financeira.
- **Decisão:** coluna `origin` (`ACCOUNT` | `LEGACY_CONSUMPTION`). `created_by` pode ser nulo **só** quando `origin = LEGACY_CONSUMPTION`, garantido por CHECK (`account_items_created_by_required`). Todo item lançado pela API continua com autor obrigatório.
- **Ganho extra:** o relatório da T-04.7 consegue separar o que veio da migração.

### D-26 — `consumed_at` separado de `created_at`
- **O problema:** o consumo antigo tinha `consumed_at` (enviável pelo cliente), e o CA-04.2.b exige preservar o `created_at` original. Sem coluna nova, um dos dois se perderia.
- **Decisão:** coluna `consumed_at NOT NULL DEFAULT now()`: quando o hóspede consumiu. `created_at` é quando o servidor gravou.
- **Valor de produto:** na fila offline, o garçom lança às 20h e sincroniza às 22h; a conta deve mostrar 20h.
- **Regras:** consumo é passado — a rota antiga recusa `consumed_at` mais de 1 minuto no futuro. Num item da API (`origin = ACCOUNT`), um `consumed_at` mais de 1 minuto **depois** do `created_at` é impossível e volta para o `created_at` a cada `migrate` (era o caso dos itens anteriores à coluna, que recebiam o horário do `migrate`). A folga é a mesma nos dois lados, para nenhum lançamento válido ser alterado. O consumo antigo migrado não é tocado: pode ter horário agendado.
- **Fica para depois:** a API nova (`POST /accounts/:id/items`) ainda não aceita `consumed_at`; entra quando o app do garçom tiver fila offline.

### D-27 — Model sai, tabela fica
- **Decisão:** `ConsumptionModel` e as relações saem do código. A tabela `consumptions` **fica no banco, sem escrita**, como trilha para auditoria e rollback; o `schema.sql` a marca como legado.
- **Justificativa:** apagar dado financeiro antes de confirmar a migração em produção não tem volta. O DROP vira pendência (seção 4).

### D-28 — Rotas antigas mantêm as regras de antes (exceção registrada; ajustada pela D-30)
- **O conflito:** a T-04.1 exige check-in para abrir conta `ROOM` e para lançar nela (Bloco C e D-22). Mas o `tests/bill-consumptions.test.js`, que o CA-04.2.e proíbe editar, lança consumo numa reserva **PENDING**. O contrato antigo nunca exigiu check-in.
- **Decisão:** as rotas antigas lançam em reserva sem check-in, como sempre fizeram. As regras novas continuam valendo em `/accounts`. Estadia encerrada é a exceção da exceção (D-30).
- **Conta usada:** a `ROOM` que cobra a diária do quarto principal da reserva — reaproveitada se a recepção já abriu por `/accounts`, senão criada `OPEN`, com rótulo "Suíte 201" **sem nome de hóspede** (coerente com a D-15). Na corrida de duas criações, o índice da RN-005 barra a segunda e ela usa a conta da primeira.
- **O que muda no contrato:**
  - o que antes virava 500 — `amount` acima de 99.999.999,99, `consumed_at` inválido e id que não é UUID — agora dá 400/404;
  - entrada que `/accounts` já recusava agora também é recusada aqui (400): `amount` com 3 casas, booleano ou lista; `consumed_at` que não é texto de data; `description` acima de 200 caracteres;
  - reserva encerrada (D-30) e conta fechada dão 422.

### D-29 — Lista e bill antigos: itens faturáveis de todas as contas da reserva
- **Decisão:** "consumo" no contrato antigo é item **faturável e não excluído** de **qualquer** conta da reserva (inclusive a conta dividida de um acompanhante), em ordem de consumo. Uma consulta só (`reservationConsumptionItems`) serve a lista e o bill, para os dois nunca divergirem.
- **Cortesia fica de fora:** não é consumo cobrado, e o formato antigo não tem como dizer "este não conta".

### D-30 — Estadia encerrada não recebe consumo; a conta migrada nasce fechada
- **Achado do qa-redteam (🟡-2):** a migração criava conta `OPEN` para reservas com check-out, canceladas ou excluídas. Ninguém as fecharia (a T-04.3 fecha no check-out, que já passou) e elas lotariam o `GET /accounts?status=OPEN` do garçom.
- **Decisão:** na migração, essas contas nascem `CLOSED`, com `closed_at`. A rota antiga recusa consumo em reserva `CHECKED_OUT` ou `CANCELLED` (422) — a mesma regra da D-22 em `/accounts`.
- **Custo aceito:** muda o contrato antigo nesse ponto (antes aceitava). Nenhum consumidor real depende disso: o frontend não usa a rota, e o teste protegido usa reserva `PENDING`.

### D-31 — Migração por reserva; bill recusa (503) em vez de mentir
- **Achado do qa-redteam (🔴-1):** uma linha inválida de qualquer hotel abortava a migração inteira, mas o schema novo já estava aplicado. O app seguia sem erro e **sem enxergar nenhum consumo antigo**: no ensaio do auditor, o bill de um hotel cobrou R$ 244 em vez de R$ 494.
- **Decisão:**
  - a migração separa as reservas com dado inválido, migra as outras numa transação e, depois do commit, lança erro listando as que ficaram (o `migrate` sai com código 1);
  - reserva nunca migra pela metade: uma linha inválida tira a reserva inteira;
  - o bill e a lista antiga respondem **503** enquanto a reserva tiver consumo vivo não migrado. Recusar é melhor que mostrar um valor menor ao hóspede;
  - o procedimento de deploy (rodar o `migrate` antes de os pods novos receberem tráfego) é infraestrutura: foi repassado ao Weslley (`docs/qa/repasses/para_weslley_19102026.md`).
- **Ensaiado num banco real:** com um consumo de R$ 150 milhões no hotel B, o hotel A migrou, a reserva do hotel B ficou inteira para trás e marcada como pendente, e o `migrate` saiu com código 1. Corrigido o dado, o `migrate` seguinte migrou o resto e saiu com 0.

### D-32 — A conta da suíte acompanha a troca de quarto
- **Achado do qa-redteam (🟡-3):** a reserva ainda sem check-in troca de quarto depois de um consumo (rotina, por causa da D-28), e o consumo seguinte criava uma segunda conta cobrando diária. O fechamento da T-04.3 cobraria duas vezes.
- **Decisão:** ao lançar, a conta que cobra diária num quarto que já não é da reserva passa a apontar para o quarto principal atual. O rótulo acompanha só se for o gerado pelo sistema.
- **Onde:** `realignStaleLodgingAccount` em `reservationRoomAccount.js`, chamado pelas rotas antigas **e pelo `POST /accounts`** antes da checagem da RN-005 (a reauditoria mostrou que, só na rota antiga, abrir a conta do quarto novo por `/accounts` ainda criava a segunda diária). O `UpdateReservationController`, que é do Gabriel, não foi tocado.
- **Limite:** realinha no máximo uma conta, porque o quarto principal só comporta uma. Remover um quarto extra que tinha conta deixa essa conta apontando para fora da reserva — a causa raiz está na troca e remoção de quarto, que não cuidam das contas, e foi repassada ao Gabriel (`docs/qa/repasses/para_gabriel_19102026.md`). Para a T-04.3 fica a regra: **só cobra diária a conta cujo quarto ainda pertence à reserva.**
- **Rótulo escolhido pela recepção não acompanha** ("Suíte 906 — João" num quarto 907): sobrescrever o que a recepção escreveu seria pior.

---

## 3. Achados do ensaio num banco real

| Achado | Correção |
|---|---|
| Com FK na coluna, o `sync({ alter: true })` do Sequelize só refaz a FK e **não tira o NOT NULL** de `created_by`. A migração morria com "null value in column created_by" | `applyAccountConstraints` faz `ALTER COLUMN created_by DROP NOT NULL` explícito. Teste simula o banco antigo |
| Itens que já existiam ganharam `consumed_at` = horário do `migrate`, posterior ao próprio `created_at` | Regra da D-26, aplicada a cada `migrate`. Teste cobre os dois sentidos (corrige o impossível, preserva o offline) |
| `DataTypes.NOW` não vira `DEFAULT` no banco: adicionar coluna `NOT NULL` numa tabela com linhas falharia | `defaultValue: literal('now()')`, que gera `DEFAULT now()` |

**Auditoria do qa-redteam:**
- 1ª rodada (`docs/qa/redteam_t042-consumption-migration_19out2026.md`): **REPROVADO** por um 🔴, com 3 🟡 e 3 🟢. Todos corrigidos (D-30 a D-32, commit `66fca6c`).
- Reauditoria (`docs/qa/redteam_t042-consumption-migration_delta_19out2026.md`): **APROVADO COM RESSALVAS**, sem 🔴; o 🔴 reproduzido como fechado num banco real. Corrigidos N-1 (realinhamento também no `POST /accounts`), N-2 (Swagger), N-3 (índice em `consumptions.reservation_id`) e N-6 (503 no DELETE antigo, conferindo o hotel antes); commit `d96c0d1`. N-4 e N-5 ficam registrados (D-32 e seção 4).

---

## 4. Pontos em aberto

| # | Ponto | Quando |
|---|---|---|
| 1 | `DROP TABLE consumptions` depois de a migração rodar e ser conferida em produção (D-27) | Após o deploy da T-04.2 |
| 2 | `POST /accounts/:id/items` aceitar `consumed_at` (D-26) | Quando o app do garçom tiver fila offline |
| 3 | `db/schema.sql` não é idempotente: a segunda aplicação para nos `CREATE TRIGGER` sem `IF NOT EXISTS`. Já era assim no `develop` | Dívida do `schema.sql` (Sirlande) |
| 4 | MER: `origin` e `consumed_at` em `ACCOUNT_ITEMS`; `CONSUMPTIONS` como legado | Próxima versão do Doc 04 |
| 5 | Rodar o `migrate` antes **e depois** do rollout (os pods antigos gravam em `consumptions` até saírem) (D-31) | Weslley — repasse de 19/10 |
| 6 | `GET /accounts/:id` de uma conta cuja reserva tem consumo não migrado mostra o total sem ele (o 503 cobre só bill e lista antiga) | Some com a migração concluída; revisar na T-04.3 |
| 7 | Só cobra diária a conta cujo quarto ainda pertence à reserva; fechar a conta no check-out e no cancelamento, inclusive as abertas antes; caminho para cobrar consumo descoberto depois do check-out (reauditoria N-1 e N-5) | T-04.3 |
| 8 | Troca e remoção de quarto cuidarem das contas da suíte (causa raiz do N-1) | Gabriel — repasse de 19/10 |
