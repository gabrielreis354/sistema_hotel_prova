# SPEC-04 · Anexo — Decisões da T-04.7 (relatório de consumo interno, seed, Swagger e isolamento)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 26/10/2026
**Estado da tarefa:** ✅ concluída — CA-04.7.a a f entregues; qa-redteam APROVADO COM RESSALVAS (0 🔴), achados corrigidos; `/security-review` sem achados
**Fonte:** relatório `docs/historico_sessao/sirlande/t047_consumo_interno_seed_26out2026.md`
**Continua:** `SPEC-04-decisoes-T-04.6.md` (D-58 a D-62). A numeração segue daqui.

> A SPEC-04 diz o que entregar (CA-04.7.a–f). Aqui ficam as escolhas que ela não fixava e **por quê**.

---

## 1. O que foi produzido

| Entrega | CAs | Onde |
|---|---|---|
| `GET /analytics/internal-consumption` | a, b, c | `AnalyticsApi/GetInternalConsumptionController.js`, rota em `analyticsRouter.js` com `requireRole('ADMIN')` |
| Fuso do hotel | — (🟡-1 do qa-redteam) | `app/utils/hotelTimezone.js` (`HOTEL_TIMEZONE`) |
| Seed da comanda | d | `seed/seed_consumo.sql`; `command.js seed` e `npm run seed:db` rodam `seed_hotels.sql` e depois ele |
| Swagger | e | `config/swagger.js` — `/accounts` já estava completo (as 64 respostas 2xx da API têm schema); entrou só a rota nova. `api-client` regenerado |
| Isolamento | f | `tests/tenant-isolation.test.js` — blocos de Product e Account |

Testes novos: `tests/internal-consumption.test.js` (20), `tests/seed-consumo.test.js` (11) e 8 testes novos em `tenant-isolation.test.js`.

**O relatório prova o modelo**, como a SPEC pedia: agrupar por motivo é um `GROUP BY reason` sobre `account_items` com JOIN em `accounts`, sem nenhuma tabela ou coluna nova.

---

## 2. Decisões

### D-63 — Item de conta INTERNAL sem motivo vai no grupo `reason: null`

A conta `INTERNAL` aceita item faturável, e o item faturável não tem `reason` (a regra da T-04.1 proíbe motivo nele). O CA-04.7.b manda contar todo item de conta INTERNAL, então esse item entra no relatório num grupo `null`.

**Por quê:** é o mesmo princípio da D-25 (autoria desconhecida fica nula). Atribuir `INTERNAL_USE` ao item seria inventar um motivo que ninguém registrou. O Swagger explica o `null`.

### D-64 — Período por `consumed_at`, datas opcionais e juntas, 400 explícito

- O filtro usa `consumed_at`, não `created_at`. O item que a fila offline do garçom entrega no dia seguinte continua no dia em que foi consumido (D-26).
- `start` e `end` são opcionais, como nos outros relatórios, mas vêm juntos e incluem as duas pontas.
- A resposta é 400 para: só uma das datas, data que não existe (`2026-02-30`), ano `0000`, formato diferente de `YYYY-MM-DD`, parâmetro repetido e `start > end`. Os relatórios antigos deixam a data inválida virar 500. A validação nova vale só nesta rota; os antigos não mudaram (fora do escopo).

### D-65 — O que entra na conta

- Ficam de fora o item excluído e o item de conta excluída.
- Conta em qualquer status entra: o consumo interno de uma conta INTERNAL já fechada continua sendo custo do mês.
- `count` é o número de lançamentos, não a soma das quantidades. `total` é a soma de `total` (quantidade × preço gravados, RN-007).
- A ordem é do maior valor para o menor. O formato é uma lista, como o `payment-mix`.
- O JOIN também compara `a.tenant_id = ai.tenant_id`. Não há FK composta de item para conta, e um item gravado direto no banco com o hotel errado vazaria para o relatório do outro hotel. Há teste para isso (🟢-3 do qa-redteam).

### D-66 — Conteúdo do seed

- Cardápio nos dois hotéis (14 produtos, 1 inativo).
- Conta da suíte em **toda** reserva `CHECKED_IN` dos hotéis do seed, Aurora e Sol: ROOM, cobrando diária, no quarto principal, `Suíte <n>`, aberta às 14h de Brasília do dia da entrada. É o que o check-in faz desde a D-58. O plano falava só do Aurora; incluir o Sol evita que a demonstração tenha hóspede com check-in feito e sem conta.
- No Aurora:
  - Suíte 106 com 3 lançamentos e uma cortesia;
  - Mesa 3 lançada pelo garçom (só itens faturáveis do cardápio, D-8);
  - day-use com uma cortesia;
  - conta INTERNAL com refeição de funcionário, perda e uso interno.
- Usuário `garcom@aurora.example` (WAITER, `senha123`), para a comanda poder ser demonstrada.
- **Idempotência:** `ON CONFLICT` nos índices únicos (usuário, produto, conta de diária); `NOT EXISTS` por (tipo, rótulo) nas contas avulsas e por (conta, descrição) nos itens. A guarda dos itens não usa `consumed_at`: no ensaio, um banco já semeado com o horário em outro fuso duplicou os 12 itens.
- **Horários com `-03`:** o instante gravado não depende do fuso da sessão (psql ou `command.js`) (🟢-1).
- Só toca os tenants `aurora` e `sol`, e só lança em conta `OPEN`: rodar de novo depois de a demonstração fechar contas não reabre nem altera nada.
- `npm run seed:db` passou a chamar `node command.js seed`. Antes ele aplicava só o `seed_hotels.sql` (🟡-2).

### D-67 — A rota fica no core-service

Junto com os outros 7 endpoints de `/analytics`. O `analytics-service` ainda não existe e, quando nascer na T-01.4, leva todos juntos.

### D-68 — O dia do relatório é o de Brasília *(aprovada em 26/10, 🟡-1 do qa-redteam)*

A sessão do Sequelize roda em UTC, então `consumed_at::date` jogava para o dia seguinte tudo o que acontece entre 21h e meia-noite em Brasília. A cortesia das 22:30 de 31/10 caía no relatório de novembro, e isso desfazia o propósito da D-64.

- O filtro é `(consumed_at AT TIME ZONE :timezone)::date`, com `HOTEL_TIMEZONE = 'America/Sao_Paulo'` em `app/utils/hotelTimezone.js`.
- **Uma constante para o produto, não um fuso por hotel:** os hotéis não têm fuso cadastrado, e todos os clientes do MVP estão no horário de Brasília. Hotel em Manaus ou Fernando de Noronha pede uma coluna em `tenants`, o que fica para depois do MVP.
- **Não fixa o `timezone` na conexão do Sequelize:** isso mudaria a leitura e a escrita de datas no sistema inteiro, inclusive em código de outras trilhas.
- Os relatórios de receita (`revenue`, `payment-mix`) têm o mesmo erro e ficaram como repasse ao Gabriel, com a constante pronta para reaproveitar.

---

## 3. Verificação

- **Suíte inteira:** 983 testes passando.
- **Mutação manual na query:** 11 mutantes, todos mortos depois do 🟢-3. Foram eles: tenant, item excluído, conta excluída, regra INTERNAL, regra `billable`, `created_at` no lugar de `consumed_at`, limites do período, `start > end`, data do calendário, ordem e tenant no JOIN.
- **Mutação nos testes de isolamento:** tirar o filtro de tenant de `ListAccountController`, `GetProductController` e da busca de hóspede no `CreateAccountController` derruba um teste em cada caso.
- **Mutação no seed:** tirar a guarda dos itens ou a criação das contas de diária derruba os testes.
- **Ensaio em banco criado pelo `node command.js migrate`:** seed rodado pelo `command.js`, pelo `npm run seed:db`, e por psql em Brasília e em UTC. Resultado sempre 12 itens e 9 contas. O `migrate` rodado depois não alterou nenhuma conta.
- **Auditorias:** qa-redteam em `docs/qa/redteam_t047-consumo-interno_26out2026.md`; `/security-review` sem achados (SQL só com `replacements`, papel ADMIN, tenant do JWT).

## 4. Pontos em aberto

1. Fuso por hotel (coluna em `tenants`), quando houver cliente fora do horário de Brasília.
2. Tela do relatório: CA-05.6.d (SPEC-05).
3. Repasses do qa-redteam:
   - Gabriel: fuso de `revenue` e `payment-mix`;
   - Weslley: `start.sh seed` com caminho antigo e sem o seed da comanda;
   - sem dono: as reservas `CHECKED_IN` do `seed_hotels.sql` estão em quartos `AVAILABLE`.
4. Do DoD da SPEC-04, ainda falta o MER promover `ACCOUNTS` e `ACCOUNT_ITEMS` para ✅, além do CA-04.6.b (5º semestre).
