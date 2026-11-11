# QA Red Team — analytics-cutover (T-01.4, etapa H.3)
**Branch:** feature/analytics-cutover@5376786 · **Dev:** Gabriel (IA orquestrada) · **Base:** develop@fbe086d · **Data:** 02/11/2026
**Arquivos auditados:** 51 (diff `origin/develop...origin/feature/analytics-cutover`)
**Achados no escopo:** 10 (🔴 0 · 🟡 4 · 🟢 6) · **Repassados:** 2

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. As 7 consultas isolam o tenant, inclusive com referências cruzadas forjadas
entre hotéis. As permissões e a validação do JWT batem com o core. PAID/VOIDED, D-1 e D-3 estão
corretos, e o dinheiro sai em string com arredondamento único. As ressalvas:
- a rede de testes não pega regressão de tenant em 3 das 7 consultas (🟡-1);
- os testes de regra financeira saem do CI (🟡-2);
- o nginx do compose passou a depender do contêiner do analytics para subir (🟡-3);
- no k8s, broker fora derruba a tela de indicadores (🟡-4).

Os 🟡-1 e 🟡-2 devem ser resolvidos antes do merge, porque são a garantia de que o isolamento e a
regra de receita continuam valendo. Os 🟡-3 e 🟡-4 dependem da revisão do Weslley.

---

## Achados no escopo

### 🟡-1 [Testes / multi-tenancy] Regressão de tenant em seasonality, revenue-by-category e top-guests passa verde
**Onde:** `services/analytics-service/tests/analytics-queries.test.js:135-155`, bloco "Isolamento por tenant"
**Cenário:** o hotel B do teste só tem 1 categoria e 1 quarto, sem hóspede, reserva ou pagamento,
e o teste lê só 5 das 7 rotas pelo B. Rodei 24 mutações nas consultas. Cada uma foi conferida
contra `analytics-queries` + `auth-isolation`. Sobreviveram:

| Mutação | Efeito real | Suíte oficial |
|---|---|---|
| M15: `GetSeasonalityController.js:20` sem `tenant_id = :tenantId` | A vê reservas e receita de **todos** os hotéis por mês | **passa** |
| M16: `GetRevenueByCategoryController.js:23-25` sem os 3 filtros de tenant | A soma as reservas de B nas categorias | **passa** |
| M17: `GetTopGuestsController.js:24` sem `r.tenant_id` no JOIN | reserva de outro hotel apontando para o hóspede de A entra no LTV | passa |
| M4: `GetRevenueController.js:62`, subquery de pagos sem tenant | pagamento de B abate o saldo da reserva de A | passa |
| M8: `GetAlertsController.js:33`, NOT EXISTS sem tenant | pagamento de B tira a reserva de A do no-show | passa |
| M5/M9: LEFT JOIN de hóspede sem `g.tenant_id` | nome do hóspede de B aparece na lista de A | passa |
| M10: `GetAlertsController.js:44`, LEFT JOIN de categoria sem tenant | nome de categoria de B aparece no alerta de limpeza de A | passa |
| M18: `GetTopGuestsController.js:25` sem `g.tenant_id` | hóspede de B aparece no ranking de A | passa |

M15 e M16 são vazamento direto: qualquer refatoração que perca a linha do tenant passa no CI.
M4, M5, M8, M9, M10, M17 e M18 são defesa em profundidade, porque exigem referência cruzada no
evento. Mesmo assim, o código as tem e o teste não as protege. A minha sonda adversarial
(abaixo) matou todas, menos M15 e M17.
**Regra violada:** qa-redteam §8, "falta teste de isolamento entre tenants no recurso novo"; CA-01.4.m.
**Correção sugerida:** semear o hotel B com hóspede, reserva (valores distintos, ex.: 5555.00) e
pagamento PAID, e conferir que **os 7** endpoints de A devolvem exatamente os totais esperados
(igualdade, não `not.toContain`). Acrescentar 3 eventos cruzados: reserva de A com `guest_id` de
B, quarto de A com `category_id` de B, e pagamento de B com `reservation_id` de A. A sonda
`zz-qa-redteam.test.js` descrita em "O que foi verificado" serve de modelo.

### 🟡-2 [Testes / CI] Regras financeiras dos indicadores deixam de rodar em qualquer CI
**Onde:** `services/core-service/tests/analytics.test.js:26` (`describePipeline = pipelineConfigured ? describe : describe.skip`), `services/core-service/tests/payment-void.test.js:329-331, 412-413, 586-588`
**Cenário:** antes desta branch, CA-06.13.f (VOIDED fora da receita), 🟢-2 (no-show só com PAID) e
o isolamento do top-guests rodavam no `ci-core-service.yml` contra o core. Agora:
- esses casos estão no bloco do pipeline, pulado sem `RABBITMQ_HOST`, e o CI do core não tem broker;
- o `analytics-queries.test.js` não roda em CI nenhum: `develop@fbe086d` não tem workflow do
  analytics (só `ci.yml`, `ci-core-service.yml` e `ci-frontend.yml`). O workflow
  `ci-analytics-service.yml` existe só na `origin/feature/ci-analytics-service`, ainda sem merge.

Mergeada a H.3 antes dela, uma mudança que volte a somar VOIDED na receita (mutação M2, morta
localmente) passa no CI. O 🟡-1 de `payment-void.test.js` também perdeu a conferência de ponta a
ponta: antes lia `realized.total = 200`, agora confere só `status = 'PAID'`.
**Regra violada:** qa-redteam §8 (portão de CI); CLAUDE.md §7 (risco financeiro).
**Correção sugerida:** mergear a `feature/ci-analytics-service` **antes ou junto** da H.3. Assim o
`analytics-queries.test.js` cobre PAID/VOIDED/D-3 no CI, o que basta, desde que o 🟡-1 seja
corrigido. O broker no CI do core fica com o Weslley (repasse abaixo).

### 🟡-3 [Infra / disponibilidade] Com o contêiner do analytics parado, o nginx do compose não sobe e o PMS inteiro cai
**Onde:** `docker/nginx/default.conf:14-17` (`upstream analytics_pool { server analytics-service:3001; }`), `docker-compose.yml:257-261`
**Cenário (reproduzido):** com o contêiner `analytics-service` parado, o nginx é reiniciado (deploy,
`docker compose up -d`, reboot):

```
nginx: [emerg] host not found in upstream "analytics-service:3001" in /etc/nginx/conf.d/default.conf:15
```

O nginx sai, e com ele caem login, reservas e pagamentos. O DNS do Docker só resolve contêiner em
execução. Basta o analytics em crash-loop (migrate falhando, chave JWT ausente) ou um
`docker compose stop analytics-service`. O comentário do compose diz que o analytics fora "não
pode derrubar o PMS inteiro", mas o `service_started` só cobre a primeira subida.
**Regra violada:** isolamento de falha entre serviços (ADR-003); o próprio objetivo declarado no comentário.
**Correção sugerida:** resolução tardia, que devolve 502 só em `/analytics/*`:
```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
location /analytics/ { set $analytics http://analytics-service:3001; proxy_pass $analytics; ... }
```
O upstream `analytics_pool` sai. No k8s o Service sempre resolve, mas vale manter a paridade
(regra 10), com o resolver do kube-dns.

### 🟡-4 [Infra / disponibilidade] No k8s, broker fora tira o analytics do Service, e os 7 indicadores dão 502
**Onde:** `infra/k8s/analytics.yaml:184-190` (readinessProbe em `/health`), com `services/analytics-service/routes/router.js:31-48` (503 quando o consumidor não está `consuming`)
**Cenário (confirmado por leitura; não executei em cluster, por restrição da tarefa):** com o RabbitMQ
reiniciando, o consumidor vai para `reconnecting`. O `/health` responde 503, o pod fica NotReady e
o Service `analytics-service` fica sem endpoint. O nginx recebe conexão recusada e a tela
/indicadores mostra erro nos 7 blocos, mesmo com o banco do analytics no ar e as projeções
legíveis, só um pouco defasadas. Na primeira subida, os indicadores só respondem depois do broker.
O compose não tem esse comportamento, porque o nginx fala direto com o contêiner. Na H.2 a
decisão fazia sentido: o serviço ainda não recebia tráfego de usuário. A H.3 pôs a tela atrás dela.
**Regra violada:** paridade compose × k8s; degradação graciosa. A demonstração para a banca depende desta tela.
**Correção sugerida:** separar as duas perguntas:
- readiness = "consigo responder HTTP": banco do analytics no ar;
- consumidor parado vira métrica e alerta (CA-01.4.f), ou campo `consumer` no `/analytics/health`.

Se a decisão for manter, registrar como ADR/decisão, com o efeito na tela.

### 🟢-1 [Testes / dinheiro] O arredondamento único do RevPAR (decisão 2) não está preso por teste
**Onde:** `services/analytics-service/tests/analytics-queries.test.js:252-258`
**Cenário:** o teste usa ADR 300 e taxa 50%, que não deixam resto. A mutação M24, que volta à
fórmula do core (`ROUND(adr,2) × ROUND(taxa,2)`), passa na suíte oficial. Para o mesmo seed, o
core antigo dava `revpar 111.1` e o analytics dá `"111.11"` (1000,00 em 3 noites, 1 de 3 quartos).
**Correção sugerida:** acrescentar esse caso, que espera `adr '333.33'` e `revpar '111.11'`.

### 🟢-2 [Contrato] Mudanças de contrato não declaradas no relatório
**Onde:** `services/analytics-service/app/Controllers/AnalyticsApi/GetAlertsController.js:42, 59, 22, 55`
**Cenário:**
- `pending_too_long[].hours_pending` passou de string NUMERIC sem arredondar (core:
  `EXTRACT(...)/3600`, sem cast) para número com 1 casa;
- `cleaning_since` mudou de semântica: agora é o instante do evento, e não `rooms.updated_at`;
- `guest` e `category` podem vir `null`;
- em `unpaid`, reserva de valor 0 ou já paga por inteiro some da lista (efeito da D-3).

Nenhuma dessas mudanças quebra a /indicadores, que não consome `/analytics/alerts` e já trata
`category ?? 'Sem categoria'`. Mesmo assim, ficaram fora da tabela "Asserções alteradas".
**Correção sugerida:** acrescentar as quatro ao relatório, na seção de decisões (item 1).

### 🟢-3 [Datas] "Hoje" e o filtro por dia continuam em UTC
**Onde:** `GetRevenueController.js:20` e `GetPaymentMixController.js:15` (`paid_at::date`); `GetAlertsController.js:29` (`CURRENT_DATE`)
**Cenário:** pagamento às 22h de 02/11 em Brasília (01h UTC de 03/11). A tela pede
`start=end=2026-11-02`, e o cartão "Recebido hoje" não o conta. Depois das 21h, o no-show "de
hoje" já olha o check-in de amanhã. O comportamento veio do core, sem regressão, mas o código foi
reescrito nesta branch.
**Correção sugerida:** `(paid_at AT TIME ZONE 'America/Sao_Paulo')::date` e
`(now() AT TIME ZONE 'America/Sao_Paulo')::date`, ou o fuso do tenant quando ele existir.
Registrar como pendência se não entrar agora.

### 🟢-4 [KISS / desempenho] Listas sem limite em `unpaid` e nos alertas
**Onde:** `GetRevenueController.js:48-71`, `GetAlertsController.js:52-67`
**Cenário:** medi com 20 hotéis, 1 M de reservas e 2 M de pagamentos (50 mil reservas por hotel).
Tudo ficou abaixo do `statement_timeout` de 5 s, com pior caso de 949 ms. Mesmo assim,
`/analytics/revenue` devolveu 1,9 MB (7.887 linhas em `unpaid`) e `/analytics/alerts` 2,2 MB. A tela
usa só `realized`. O comportamento veio do core.
**Correção sugerida:** registrar como pendência um `limit` ou uma rota própria para a lista de
em aberto. Por ora não há risco de timeout.

### 🟢-5 [Consistência] revenue-by-category ainda some com a linha quando a projeção do quarto ou da categoria não chegou
**Onde:** `GetRevenueByCategoryController.js:23-24` (INNER JOIN)
**Cenário:** a decisão 3 do relatório diz que "a linha não some" (LEFT JOIN). Aqui a reserva cujo
`room.created` ou `room_category.created` ainda não foi consumido sai da tabela. O total da tabela
fica menor que o `expected`, e na sonda a reserva de 77,00 sumiu. O core também usava INNER JOIN.
**Correção sugerida:** LEFT JOIN em `proj_rooms` e `proj_room_categories`, com `category` null. O
frontend já mostra "Sem categoria".

### 🟢-6 [nginx] O prefixo `/analytics/internal-consumption` sem fronteira e a diferença de caixa
**Onde:** `docker/nginx/default.conf:113` e `infra/k8s/nginx.yaml:121`
**Cenário (reproduzido):** `/analytics/internal-consumptionX` vai para o core, que responde 404.
`/analytics/Internal-Consumption` vai para o analytics, que responde 404, embora o Express do core,
que não diferencia caixa, servisse o caminho. Não há impacto de segurança: nenhum caminho
alcança rota que não deveria. É só ambiguidade.
**Correção sugerida:** `location ~* ^/analytics/internal-consumption/?$`, ou documentar o comportamento.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Indicadores sem CI: mergear `feature/ci-analytics-service` antes ou junto da H.3 | `.github/workflows/` | Weslley | `docs/qa/repasses/para_weslley_02112026.md` |
| 🟡 | Broker no `ci-core-service.yml` para o pipeline do `analytics.test.js` deixar de ser pulado | `.github/workflows/ci-core-service.yml` | Weslley | `docs/qa/repasses/para_weslley_02112026.md` |

Os 🟡-3, 🟡-4 e 🟢-6 estão no diff desta branch, marcados com `[revisão do Weslley]`, e ficam no
escopo. Ele revisa a correção.

---

## O que foi verificado e está correto

**Ambiente:** worktree destacado `/home/gabri/wt-qah3` @5376786, `pg-qah3` (5463), `rmq-qah3`
(5699, `--user rabbitmq`, topologia do `infra/k8s/rabbitmq-setup.sh`). Analytics do pipeline na
porta 3067. Nada aplicado em cluster. Nenhum comando AWS ou Terraform.

**Suítes (saída real):**
- analytics (`npx vitest run --coverage`, RabbitMQ real): `Test Files 9 passed (9)` · `Tests 162 passed (162)` · Statements 96.58% · Branches 92.49% · Functions 90.72% · Lines 96.52%
- core (`npx vitest run --coverage`, pipeline ativo, 28 casos do `analytics.test.js` rodados e nenhum pulado): `Test Files 52 passed (52)` · `Tests 1126 passed | 1 skipped (1127)` · Statements 86.05% · Branches 82.75% · Functions 90.36% · Lines 87.92%. O pulado é o de sempre (`reservations.test.js`, cancelamento de CONFIRMED)
- `bash scripts/qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.` São os 3 avisos de antes: swagger de 3 routers do core, `<button>` cru em GuestsListPage e classes repetidas

**Isolamento adversarial** (sonda `zz-qa-redteam.test.js`, fora do repo):
- cenário: hotel B com categoria "SEGREDO-CAT-B", hóspede "SEGREDO-HOSPEDE-B", reserva de 5555.00
  e pagamento com método "SEGREDO-METODO-B";
- dados cruzados: reserva de A com o hóspede de B, quarto de A com a categoria de B, e pagamentos
  de B apontando para reservas de A;
- resultado: as 7 rotas de A não trazem nada de B. O `guest` e o `category` cruzados vêm `null`, o
  saldo de A não é abatido, a reserva continua em risco de no-show e `realized` fica em `0.00`.

**JWT e papéis** (rota `/analytics/top-guests`):
- 401: chave de outro emissor, token expirado, sem `tenantId`, `tenantId` não-UUID, tenant
  inexistente, `alg: none`, RS512 com a chave certa e HS256 assinado com a chave pública;
- 403: sem role, `role: 'admin'` em minúsculas, WAITER e RECEPTIONIST. O hotel suspenso já tem
  cobertura em `auth-isolation.test.js`.

**Mesmo seed, core antigo × analytics** (controllers da `develop` montados ao lado do analytics, no
mesmo banco do pipeline; valores 333.33, sinal de 100.10, estorno de 50.05 e pagamento de 0.01):
- payment-mix, seasonality, revenue-by-category, top-guests e alerts: **idênticos** depois de
  normalizar o dinheiro para centavos e remover os campos declarados (`guest_phone` → `guest_id`);
- revenue: `realized` 100.11 (estorno fora) e `expected` 1999.98 iguais. `unpaid` passou de 1 para
  3 linhas: entram a reserva com sinal e a que tem 0.01 pago. É a D-3 refinada, declarada;
- occupancy: `revpar` 111.1 → `"111.11"`, a decisão 2, declarada.

**Mutações de PAID/VOIDED e papéis**, todas mortas pela suíte oficial:
- M2: receita sem `status = 'PAID'`;
- M3: em aberto sem PAID;
- M7: no-show sem PAID;
- M14: mix sem PAID;
- M23: `saldo >= 0`;
- M21: top-guests sem `requireRole('ADMIN')`;
- M22: WAITER liberado.

Também morreram M1, M6, M11, M12, M13, M19 e M20, todas de tenant.

**Entrada inválida:** 30 casos, nenhum 500. Entre eles:
- `date=2026-02-29`, `date[]=`, `date[a]=`, data repetida, `0000-01-01`;
- `start[]`, `end[x]`, `%00`, `'--`;
- `2026-02-31`, `2026-1-1`;
- `months` com valor vazio, `-1`, `1.5`, `1e1`, `%2012` e `[]`;
- `limit` com valor vazio, `9999`, `[]` e `1;DROP`.

Todos deram 400. `9999-12-31`, `0001-01-01`, `months=0060` e `limit=0100` deram 200, como esperado.

**Dinheiro:** strings `^\d+\.\d{2}$` em todas as rotas. ADR `333.33`, RevPAR `111.11`, ticket
médio de 0.01 e 0.02 = `0.02` (ROUND do NUMERIC arredonda a metade para longe do zero). Nenhum
`::float` em valor monetário. O frontend converte com `decimalToCents` (string → centavos exatos).

**Volume:** 1 M de reservas e 2 M de pagamentos. Tempos: revenue 809 ms · alerts 949 ms ·
payment-mix 111 ms · top-guests 70 ms · seasonality 57 ms · by-category 41 ms · occupancy 24 ms.
Todos abaixo dos 5 s.

**nginx** (o `default.conf` da branch, com backends simulados que ecoam o caminho; `nginx -t` OK):
- `/analytics/revenue` e `/analytics/health` vão para o analytics;
- `/analytics/internal-consumption`, com barra, com query ou com `%69` (normalizado), vai para o core;
- `/analytics/../users` e `/analytics/%2e%2e/users` vão para o core, normalizados;
- `/analytics/internal-consumption/../revenue` vai para o analytics com o URI cru, e lá dá 404;
- `/analytics/revenue/../internal-consumption` vai para o core com o URI cru, e lá dá 404;
- `/analyticsX` e `/ANALYTICS/revenue` vão para o core, que dá 404;
- `/analytics/%2e%2e/metrics` dá 404 no nginx.

Nenhum desvio alcança rota indevida. O core responde 404 nas 7 rotas (`analytics.test.js`, bloco CA-01.4.o).

**Infra:** `kubectl kustomize infra/k8s` renderiza 49 objetos. O único `Secret` é o `hotel-secret`:
o `analytics-db` não está no repositório e é criado por `scripts/k8s_garantir_secret_analytics.sh`
(senha `openssl rand -hex 24`, idempotente). O grep de segredo no diff só achou a senha de teste
`senha123`, já existente nos testes. Conferi a NetworkPolicy do analytics e do banco dele, o
`fsGroup`/`USER node` no mesmo padrão do backend e só a chave pública montada.

**LGPD:** a projeção de hóspede só guarda o nome. Não há e-mail nem telefone em ranking ou
alertas (D-1). Os logs registram só `error.message`.

## Não foi possível verificar
- **Comportamento em cluster** (🟡-4, probes, NetworkPolicy aplicada): a tarefa proíbe `apply`.
  Ficou só o render e a leitura.
- **Frontend:** não rodei `pnpm -r typecheck` nem o Playwright no meu worktree (os `node_modules`
  do pnpm são do worktree do executor). Conferi por leitura o `schema.d.ts` (dinheiro em `string`),
  `kpis.ts`, `shares.ts`, `IndicatorsPage.tsx` e `TopGuests.tsx`.
- **Mutações no core** (pipeline): não rodei. As regras de PAID/VOIDED moram nos controllers do
  analytics, onde as mutações foram feitas.
