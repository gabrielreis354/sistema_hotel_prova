# QA Red Team — T-04.7 relatório de consumo interno, seed da comanda, Swagger e isolamento
**Branch:** feature/t047-consumo-interno-seed · **Dev:** Sirlande · **Base:** develop@b4966cd · **Data:** 26/10/2026
**Arquivos auditados:** 10 (`GetInternalConsumptionController.js`, `analyticsRouter.js`, `seed/seed_consumo.sql`, `command.js`, `config/swagger.js`, `api-client/openapi.json`, `api-client/src/schema.d.ts`, `tests/internal-consumption.test.js`, `tests/seed-consumo.test.js`, `tests/tenant-isolation.test.js`)
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 3

## Veredito
**APROVADO COM RESSALVAS**

Nenhum achado é 🔴. A query não vaza dados entre tenants: o filtro usa `ai.tenant_id` e o tenant vem do JWT. Não há injeção. O papel está correto e nenhum dinheiro é gravado.

O 🟡-1 deveria ser corrigido antes do merge. O relatório agrupa os dias em UTC, não no horário de Brasília. Todo consumo lançado depois das 21:00 conta no dia seguinte, e o da noite do último dia do mês conta no mês seguinte. Isso desfaz justamente o que a D-64 quis garantir ao filtrar por `consumed_at`.

## Achados no escopo

### 🟡-1 [Data/fuso · D-64] `consumed_at::date` é calculado em UTC: o consumo da noite cai no dia (e no mês) seguinte
**Onde:** `services/core-service/app/Controllers/AnalyticsApi/GetInternalConsumptionController.js:37`
Causa: `database/connections/sequelize.js` não define `timezone`, e o Sequelize usa `+00:00` por padrão. Por isso ele executa `SET TIME ZONE INTERVAL '+00:00'` em toda conexão (`node_modules/sequelize/lib/dialects/postgres/connection-manager.js:175-181`).
**Cenário (reproduzido no banco de teste com a sessão em +00:00):** no sábado, 31/10, às 22:30 (BRT), o garçom lança uma cortesia. O valor gravado é `2026-11-01 01:30Z`.
- `('2026-10-31 22:30-03'::timestamptz)::date` devolve `2026-11-01`.
- `GET /analytics/internal-consumption?start=2026-10-01&end=2026-10-31` **não** traz essa cortesia. O relatório de novembro traz.
- No relatório de um dia só (`start=end`), tudo o que foi lançado entre 21:00 e 23:59 vai para o dia seguinte. É justamente o horário do bar e do jantar, quando mais se dá cortesia.

Os testes não pegam isso: `internal-consumption.test.js:73-74,79` posiciona todos os itens às 15:00Z, longe da virada do dia.
**Regra violada:** D-64 (o filtro por `consumed_at` existe para o item cair no dia em que foi consumido). Checklist §7: data sem fuso explícito `America/Sao_Paulo`.
**Correção sugerida:** trocar por `(ai.consumed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN :start AND :end`. O ideal é guardar o fuso em constante ou por tenant. Acrescentar um teste com um item em `2026-03-11T01:30:00Z`, que deve aparecer no dia 10/03 e não no dia 11/03. O mesmo padrão já existe em outros analytics, fora do escopo, e foi repassado (ver abaixo).

### 🟡-2 [Integração do seed · CA-04.7.d/D-66] O seed da comanda só roda por `node command.js seed`; o caminho de setup documentado não o aplica
**Onde:** `services/core-service/package.json:15` (`seed:db` roda só `seed/seed_hotels.sql` via psql), que é chamado por `scripts/setup_db.sh:28`. O próprio cabeçalho de `seed_hotels.sql:14-15` indica `npm run setup:db` como caminho de setup.
**Cenário:** alguém monta o banco da demonstração com `bash scripts/setup_db.sh` (ou `npm run seed:db`). O banco sobe sem cardápio, sem contas e sem `garcom@aurora.example`. Na defesa, o login do garçom responde 401 e a comanda aparece vazia. O teste `seed-consumo.test.js` não pega isso, porque replica a ordem do `command.js` e não a do script npm.
**Regra violada:** D-66 (o seed serve para a demonstração). Integração incompleta da entrega: um seed novo ligado a só um dos pontos de entrada.
**Correção sugerida:** fazer o `seed:db` chamar `node command.js seed`, ou acrescentar `-f seed/seed_consumo.sql` ao comando. A segunda opção depende do 🟢-1. O caminho do Kubernetes (`start.sh seed`) é de outra área e foi repassado.

### 🟢-1 [Seed · fuso/idempotência] Datas do seed sem fuso: o instante gravado depende da sessão, e a idempotência também
**Onde:** `services/core-service/seed/seed_consumo.sql:77, 96-100, 135-149, 156`
**Cenário:**
- **Pelo `command.js`** (sessão +00:00): `'2026-06-15 21:30'` vira 21:30Z, ou seja, 18:30 BRT. O item que o arquivo diz ser consumido às 21:30 aparece às 18:30 na tela.
- **Por psql** (aqui o servidor tem `timezone = America/Sao_Paulo`): o mesmo literal vira 00:30Z do dia seguinte. A perda de `'2026-06-12 22:00'` passa a ser `2026-06-13 01:00Z`.
- **Rodar pelos dois caminhos** quebra o `NOT EXISTS` da linha 156, que compara `consumed_at`. Os 12 lançamentos são duplicados e os totais do relatório dobram.
**Correção sugerida:** escrever os literais com offset (`'2026-06-15 21:30-03'`) e usar `(r.check_in_date + time '14:00') AT TIME ZONE 'America/Sao_Paulo'` na linha 77.

### 🟢-2 [Entrada inesperada → 500] Ano 0000 passa no validador e o PostgreSQL rejeita
**Onde:** `services/core-service/app/Controllers/AnalyticsApi/GetInternalConsumptionController.js:11-15`
**Cenário:** `?start=0000-01-01&end=2026-01-01`. Em JS, `new Date('0000-01-01T00:00:00Z').toISOString()` devolve `0000-01-01…`, então `isCalendarDate` aceita a data. O PostgreSQL responde `date/time field value out of range: "0000-01-01"` (confirmado no banco de teste), e a API devolve 500 em vez de 400.
**Correção sugerida:** exigir ano ≥ 1 (por exemplo, `value >= '0001-01-01'`), ou um intervalo plausível como 1900–9999.

### 🟢-3 [Testes] Mutante que sobrevive no JOIN e falta de teste na virada do dia
**Onde:** `GetInternalConsumptionController.js:51-53` e `tests/internal-consumption.test.js`
**Cenário:** remover `AND a.tenant_id = ai.tenant_id` não reprova nenhum teste, como o próprio autor relatou. O banco não tem FK composta `(account_id, tenant_id)` (`db/schema.sql:372`): um item do tenant A apontando para uma conta INTERNAL do tenant B é aceito pelo schema. Nesse caso o `a.type = 'INTERNAL'` de B incluiria no relatório de A um item faturável. Hoje a API não produz esse estado, então isto é defesa em profundidade sem teste. Também falta o teste de virada de dia citado no 🟡-1.
**Correção sugerida:** criar um teste que insira direto no banco um item com tenant divergente da conta e verifique que ele não aparece. Criar também o teste de fuso do 🟡-1.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Mesmo erro de fuso: `paid_at::date` em sessão UTC põe o pagamento das 21:00–23:59 no dia ou mês seguinte | `GetRevenueController.js:10`, `GetPaymentMixController.js:10` | Gabriel (analytics, T-01.4) | `docs/qa/repasses/para_gabriel_26102026.md` |
| 🟡 | `start.sh seed` procura `seed/seed_hotels.sql` na raiz, que não existe desde a SPEC-01, e não aplica `seed_consumo.sql`: a demo no K8s fica sem seed nenhum | `start.sh:101-104` | Weslley | `docs/qa/repasses/para_weslley_26102026.md` |
| 🟢 | Seed cria reservas CHECKED_IN em quartos AVAILABLE. Com esta branch, elas também ganham conta de diária aberta, e o rack mostra a suíte ocupada como livre | `seed/seed_hotels.sql:76-87, 218-222, 404-406` | DONO INDEFINIDO | `docs/qa/repasses/para_indefinido_26102026.md` |

## O que foi verificado e está correto
- **Tenant:** `request.user.tenantId` vem do JWT, e o `WHERE ai.tenant_id = :tenantId` usa replacements. O `dateFilter` é um texto fixo, sem interpolação de entrada.
- **Entradas:** array (`start` repetido, `start[]`), string vazia, formato errado, 30/02 e `start>end` respondem 400. O par `start`/`end` é comparado como texto, o que funciona porque o formato ISO é fixo.
- **Papel:** `requireRole('ADMIN')` é encadeado depois do `use(... 'ADMIN','RECEPTIONIST')` do router. Recepção e garçom recebem 403, e sem token a resposta é 401 (testado).
- **CA-04.7.b, D-63, D-65:** entram `billable=false OR a.type='INTERNAL'`. O CHECK `account_items_reason_required` garante que `null` só aparece para item faturável de conta INTERNAL. Item excluído e conta excluída ficam de fora, conta de qualquer status entra, `count` = linhas, `total` = soma de `total`, a ordem é determinística e não há PII na resposta.
- **Dinheiro:** `SUM` em numeric é exato e o cast `::float` vem só no final, igual aos outros analytics. Para valores de 2 casas, a serialização em JSON não perde precisão.
- **CA-04.7.e:** todas as operações de `/accounts` já tinham schema de resposta. `openapi.json` está em sincronia byte a byte com `swagger.js` (verificado), e `schema.d.ts` tipa `reason` como `… | null`.
- **Seed contra regras da API:**
  - A conta de diária é igual à do `openStayAccount` (ROOM, OPEN, quarto principal, hóspede da reserva, rótulo `Suíte <n>`) e há NOT EXISTS para qualquer conta de diária da reserva (D-58).
  - Nenhum CHECK é violado (`room_requires_stay`, `no_guest_table_internal`, `reservation_only_room`, `total_matches`, `reason_required`).
  - O garçom só lança item faturável do cardápio em TABLE (D-8), INTERNAL não recebe pagamento e item só entra em conta OPEN.
  - Rodar de novo depois de a demo fechar contas não reabre nada, e a conta excluída não ganha item novo.
  - O guard de produção do `command.js:82` cobre os dois arquivos.
- **Testes:** os 49 testes dos 3 arquivos passaram nesta auditoria (`vitest run`). Os testes de isolamento de Product/Account cobrem listagem, GET, PUT, DELETE, bill, close, lançamento com `product_id` de outro tenant e DAY_USE com `guest_id` de outro tenant.

## Não foi possível verificar
- A cobertura global da CI (portão de 60%). Não rodei a suíte completa com `--coverage`; o autor relata 978 testes verdes.
- Como o seed se comporta no Postgres do K8s (fuso do servidor do StatefulSet). O 🟢-1 depende disso quando o seed roda por psql.

## Resolução (autor, 26/10/2026)

| Achado | Resolução | Commit |
|---|---|---|
| 🟡-1 fuso do relatório | Aprovado pelo dono como **D-68**: `(consumed_at AT TIME ZONE :timezone)::date` com `HOTEL_TIMEZONE = 'America/Sao_Paulo'` (`app/utils/hotelTimezone.js`); teste da virada 31/10 22:30 BRT, escrito antes da correção (RED) | `0fc4ff8` (RED) + `28cbf31` |
| 🟡-2 `npm run seed:db` sem o seed da comanda | `seed:db` chama `node command.js seed`, que aplica os dois arquivos | `d918950` |
| 🟢-1 horários do seed sem fuso | Literais com `-03`; abertura da suíte às 14h de Brasília; teste rodando o seed numa sessão em `America/Sao_Paulo`. No ensaio, um banco semeado com a versão anterior duplicou os itens, e a guarda dos itens passou a ser por (conta, descrição), sem `consumed_at` | `d918950`, `4a8cb83` |
| 🟢-2 ano 0000 dá 500 | Recusado com 400 | `d918950` |
| 🟢-3 mutante do JOIN por tenant | Teste com item gravado no banco com tenant diferente do da conta; o mutante agora morre | `d918950` |

Sem 🔴, então não houve reauditoria delta (fluxo da entrega). Cada correção tem um teste que falha quando a correção é desfeita, e a suíte inteira passa (983).
