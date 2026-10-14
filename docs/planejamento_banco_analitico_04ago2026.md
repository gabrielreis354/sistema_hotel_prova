# Banco Analítico — Comparativo de Opções e Plano de Preparação
**Data:** 04/08/2026 | **Responsável:** Sirlande | **Status:** Decisão pendente

---

## 1. Contexto

O banco atual (`gestao_hotel`, PostgreSQL 17) é **transacional (OLTP)**: 14
tabelas normalizadas (3FN), otimizadas para escrita e leitura pontual —
criar reserva, registrar pagamento, buscar hóspede por CPF. O módulo
Analytics (`GET /analytics/*`, 7 endpoints) já existe, mas roda **queries
agregadas direto sobre o banco transacional**, sem schema dedicado nem ETL —
documentado em `docs/planejamento_analytics_27jun2026.md`, seção 2:
"Zero mudanças de schema".

Isso funciona hoje porque o volume é pequeno (seed de 165 registros, poucos
tenants). Mas duas necessidades motivam um banco analítico dedicado:

- **Acadêmica:** demonstrar modelagem dimensional (fato/dimensão) como
  complemento ao modelo relacional 3FN já entregue — mostra domínio de dois
  paradigmas de banco de dados, não só um.
- **Produto:** conforme o volume de reservas/pagamentos cresce, queries de
  agregação pesadas (sazonalidade, LTV de hóspede, ranking por categoria)
  competem por I/O com o tráfego transacional (check-in, criar reserva) no
  mesmo banco. Separar a carga analítica da operacional é uma prática padrão
  de arquitetura de dados.

Este documento compara as duas abordagens técnicas possíveis e recomenda uma
antes de qualquer implementação, seguindo a metodologia RPI (Research → Plan
→ Implement) do projeto.

---

## 2. Estado atual do banco (research)

| Métrica | Valor |
|---|---|
| Tabelas | 14 (`tenants`, `users`, `room_categories`, `rooms`, `guests`, `reservations`, `reservation_rooms`, `payments`, `consumptions`, `corporate_clients`, `event_quotes`, `quote_services`, `contracts`, `contract_installments`) |
| Motor | PostgreSQL 17, único, compartilhado (schema `public`) |
| Isolamento multi-tenant | `tenant_id` em toda tabela filha, índices compostos `(tenant_id, ...)` |
| Proteção de integridade | `EXCLUDE USING gist` anti-double-booking em `reservations`, `CHECK` constraints, soft delete via `deleted_at` |
| Analytics hoje | 7 endpoints, `sequelize.query()` direto sobre OLTP, sem cache, sem schema próprio |
| Infra atual | 1 StatefulSet Postgres + 1 Deployment backend + MinIO + Nginx, tudo em `k8s/` |

**Nota lateral encontrada durante o research:** `docs/db/ARQ_DATABASE.md`
documenta só 8 das 14 tabelas — ficou parado em 18/06 e nunca foi atualizado
com o módulo B2B (`consumptions`, `corporate_clients`, `event_quotes`,
`quote_services`, `contracts`, `contract_installments`). Isso é uma dívida
de documentação independente da decisão do banco analítico, registrada aqui
para não se perder — ver seção 6.

---

## 3. Opção A — Data Warehouse relacional (star schema em PostgreSQL) — RECOMENDADA

### Arquitetura

Mesmo motor (PostgreSQL 17), **schema separado** (`analytics`) dentro do
mesmo banco ou, se o professor exigir bancos fisicamente distintos, uma
segunda instância Postgres no `docker-compose`/`k8s` — o modelo de dados não
muda em nenhum dos dois casos.

**Modelagem dimensional (Kimball) proposta**, grão = 1 linha por reserva /
1 linha por pagamento:

```
Tabelas fato:
  fact_reservations   → 1 linha por reserva. Métricas: nights, total_amount,
                         lead_time_days (dias entre criação e check-in)
  fact_payments       → 1 linha por pagamento. Métricas: amount

Tabelas dimensão:
  dim_date            → 1 linha por dia (date_key, year, month, day,
                         day_of_week, is_weekend, month_name) — populada uma
                         vez, cobre vários anos
  dim_tenant          → tenant_id, name, subdomain (snapshot, sem SCD)
  dim_room_category   → category_id, name, price_per_night_at_load
  dim_guest           → guest_id, full_name, is_repeat_guest (calculado)
  dim_payment_method  → PIX, CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO
```

`fact_reservations` referencia `dim_date` duas vezes (check-in e check-out —
role-playing dimension), `dim_tenant`, `dim_room_category`, `dim_guest`.

### ETL

Um novo subcomando em `command.js` (mesmo padrão do `migrate` existente):

```bash
node command.js etl-analytics
```

- **Extract:** `SELECT` nas tabelas OLTP com `WHERE updated_at > :lastRun`
  (carga incremental) ou full reload (mais simples, aceitável no volume
  atual)
- **Transform:** calcular métricas derivadas (nights, lead_time), resolver
  chaves substitutas (surrogate keys) das dimensões
- **Load:** `INSERT ... ON CONFLICT DO UPDATE` (upsert idempotente, mesmo
  padrão já usado no seed — ver `requisitos_banco_17062026.md`)

Agendamento: `CronJob` do Kubernetes (recurso ainda não usado no projeto,
mas nativo do k8s — sem nova dependência de infra) rodando o comando
periodicamente.

### O que falta pra funcionar de ponta a ponta

| Item | Descrição |
|---|---|
| Schema `analytics` | Novo arquivo `db/schema_analytics.sql` com DDL das 7 tabelas (2 fato + 5 dimensão) |
| Models Sequelize | Novos models em `app/Models/Analytics/` ou schema apontado via `schema:` option do Sequelize |
| Script de ETL | `command.js` — novo subcomando, idempotente, testável isoladamente |
| CronJob k8s | `k8s/analytics-etl-cronjob.yaml` — agenda o ETL (ex: a cada 1h ou 1x/dia) |
| Endpoints novos (opcional) | `GET /analytics-dw/*` lendo do star schema em vez de recalcular ao vivo — só se quiser mostrar o ganho de performance |
| Diagrama dimensional | `modelagem/star_schema.mmd` — mesmo padrão do `DER.mmd` já existente |
| Documentação | Seção nova em `docs/db/ARQ_DATABASE.md` ou arquivo próprio `docs/db/ARQ_ANALYTICS.md` |
| Testes | Idempotência do ETL (rodar 2x, mesmo resultado) + 1-2 queries de validação (ex: soma de `fact_payments.amount` bate com `SUM(payments.amount)` do OLTP) |

### Trade-offs

- ✅ Zero infra nova — mesmo Postgres, mesma imagem Docker, mesmo cluster k8s
- ✅ Risco baixo de quebrar algo perto da entrega/defesa
- ✅ Conteúdo clássico e bem documentável para banca (grão, fato, dimensão, SCD se quiser aprofundar)
- ✅ Separa fisicamente a carga de leitura pesada da carga transacional (ainda que no mesmo servidor — já ajuda porque índices/plano de execução são independentes por schema)
- ⚠️ Não demonstra um motor de banco diferente (se a disciplina pedir explicitamente "SGBD não-relacional" ou "colunar", essa opção não atende)
- ⚠️ Separação de carga é lógica, não física — um pico de ETL ainda compete por CPU/IO com o Postgres transacional se estiverem na mesma instância

---

## 4. Opção B — Motor colunar/OLAP dedicado (ClickHouse ou DuckDB)

### Arquitetura

Um motor de banco **diferente do PostgreSQL**, otimizado para varredura
colunar e agregação em massa.

- **ClickHouse:** servidor dedicado — novo `StatefulSet` + `PVC` + `Service`
  + `Secret` em `k8s/`, mesmo padrão do `postgres.yaml`/`minio.yaml` atuais.
  Cliente Node via `@clickhouse/client`.
- **DuckDB:** embutido (roda como biblioteca dentro do processo Node, como
  SQLite) — sem novo serviço no cluster, mas também sem alta disponibilidade
  nem acesso concorrente de múltiplos pods do backend (réplicas do
  Deployment seriam um problema, já que o projeto roda 3 réplicas do
  backend em k8s).

### ETL / Sync

Mesmo princípio da Opção A (extract/transform/load), mas a carga é escrita
num motor diferente:
- ClickHouse: `INSERT` via cliente HTTP/TCP, formato colunar nativo
- DuckDB: exportar Postgres → Parquet/CSV, `duckdb.sql("COPY ... FROM ...")`

### O que falta pra funcionar de ponta a ponta

| Item | Descrição |
|---|---|
| Infra k8s (ClickHouse) | `k8s/clickhouse.yaml` — StatefulSet + PVC + Service + Secret, replicar padrão de `postgres.yaml` |
| Driver/dependência Node | `@clickhouse/client` ou `duckdb` no `package.json` |
| Modelagem de tabelas no novo motor | DDL próprio do motor (sintaxe MergeTree no ClickHouse, por exemplo) |
| Pipeline de sync | Mesmo ETL da Opção A, mas escrevendo no motor novo — sem suporte nativo do Sequelize, então SQL/driver cru |
| Estratégia de concorrência (DuckDB) | Se usar DuckDB, decidir entre 1 réplica dedicada ao ETL+leitura, ou aceitar que cada pod tem seu próprio arquivo local (inconsistente entre réplicas) |
| Testes de infra | Health checks, probes, resource limits pro novo serviço (ClickHouse) |
| Documentação | Justificativa de escolha do motor, diagrama de arquitetura com o novo componente |

### Trade-offs

- ✅ Demonstra polyglot persistence de verdade — dois motores diferentes, não só dois schemas
- ✅ Mais alinhado com o que se usa em produto real de grande escala (Fase 3 do roadmap)
- ⚠️ ClickHouse: dobra a superfície de infra (mais um serviço com estado pra manter saudável no k8s, mais uma peça que pode falhar perto da defesa)
- ⚠️ DuckDB: não é multi-réplica-safe do jeito que o backend roda hoje (3 réplicas) — exigiria repensar onde ele vive
- ⚠️ Maior esforço total: driver novo, sintaxe de DDL nova, pipeline sem o conforto do Sequelize
- ⚠️ Maior risco de não terminar a tempo, dado o estágio do roadmap (próximo marco é documentação + defesa)

---

## 5. Comparativo lado a lado

| Critério | A — Star schema PostgreSQL | B — Motor colunar dedicado |
|---|---|---|
| Infra nova | Nenhuma | ClickHouse: StatefulSet completo. DuckDB: sem infra, mas inconsistente com múltiplas réplicas |
| Esforço estimado | Baixo-médio (schema + ETL em SQL + 1 CronJob) | Médio-alto (driver novo + DDL novo + pipeline sem ORM + infra k8s) |
| Risco pro prazo (defesa em breve) | Baixo | Médio/alto |
| Valor acadêmico | Alto (modelagem dimensional é conteúdo padrão de BD) | Alto (mas mais sobre infra/stack do que sobre modelagem) |
| Valor de produto real | Real, mas separação lógica (mesma instância) | Real e mais robusto, mas over-engineering pro volume atual (poucos tenants, seed de 165 registros) |
| Reaproveita conhecimento do projeto | Sim — mesmo Postgres, mesmo Sequelize, mesmo padrão de `command.js` | Parcial — conceito de ETL se repete, tudo o resto é novo |

---

## 6. Recomendação

**Opção A — Star schema em PostgreSQL.** Cobre as duas motivações (acadêmica
e de produto) com o menor risco de infra e o maior reaproveitamento do que
já existe no projeto. É também a evolução natural do que já foi entregue: o
banco operacional já está em 3FN e documentado (`ARQ_DATABASE.md`,
`modelagem/`); o star schema é o contraponto dimensional que fecha a
narrativa "sei modelar tanto pra transação quanto pra análise" numa banca.

A Opção B fica registrada como evolução natural de **Fase 3 — Produto de
Mercado** (`docs/PRODUCT_ROADMAP.md`), quando o volume de dados e a escala
de tenants justificarem um motor colunar de verdade.

---

## 7. Próximos passos, se a Opção A for aprovada

1. Corrigir a dívida de documentação encontrada no research (seção 2) —
   atualizar `docs/db/ARQ_DATABASE.md` com as 6 tabelas B2B que faltam,
   antes de somar mais tabelas novas em cima de uma doc desatualizada
2. Desenhar o diagrama dimensional (`modelagem/star_schema.mmd`) e revisar
   o grão de cada fato com você antes de gerar DDL
3. Criar `db/schema_analytics.sql` (fato + dimensão) e os models Sequelize
   correspondentes
4. Implementar o ETL em `command.js` com carga idempotente, testado
   isoladamente (rodar 2x, comparar totais)
5. Criar o `CronJob` de agendamento em `k8s/`
6. Documentar e (opcional) expor endpoints `/analytics-dw/*` lendo do novo
   schema

Cada um desses vira uma branch própria com plano detalhado (critérios de
aceite, arquivos, ordem), seguindo o RPI do `CLAUDE.md`, assim que a decisão
de motor for confirmada.

---

*Documento gerado em: 04/08/2026*
*Metodologia: RPI (Research → Plan → Implement) — este arquivo cobre Research + comparação de Plan, aguardando aprovação antes de Implement.*
