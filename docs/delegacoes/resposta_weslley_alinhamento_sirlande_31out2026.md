# Resposta ao alinhamento — o que foi feito e o que o ambiente exige

**De:** Weslley · **Para:** Sirlande · **Data:** 31/10/2026 (semana 2 do plano)
**Responde a:** `docs/delegacoes/alinhamento_weslley_28out2026.md` (seu alinhamento de 28/10, aceite de A, C e D em 30/10)
**Conferido no git em:** 31/10, `develop` em `4234915`

> **Para que serve.** Você listou o que estava comigo e ofereceu ajuda. Aqui está o retorno: o que já saiu, o que falta, e as dependências do ambiente que apareceram no caminho. Várias delas tocam o seu domínio (seed, schema, pagamento), por isso estão detalhadas na §3.

---

## 1. O que já saiu (as coisas boas)

| Item do alinhamento | Situação | Evidência |
|---|---|---|
| **1.2** T-05.6, critérios b e c (passo 7) | ✅ na `develop` em 31/10 | Merge `8b1f774`. Tela `/indicadores` só para o ADMIN: no desktop, cartões do dia, receita por mês, sazonalidade, categoria × meio de pagamento e ranking; no celular, só os 4 cartões. qa-redteam "mergear com ressalvas", sem 🔴 no escopo, e as 🟡 corrigidas antes do merge |
| Ranking de hóspedes (RT-51) | ✅ junto da T-05.6 | `/analytics/top-guests` só para o ADMIN (`e991361`) e sem o e-mail do hóspede (`d2d51c8`, minimização da LGPD). Teste novo: outro hotel recebe o ranking vazio |
| **B** · `./start.sh seed` | ✅ na `develop` desde 30/10 | `157a6bf` (caminho e ordem dos dois arquivos) e `5b7edc9` (trava `ALLOW_SEED=1`). Por isso o B não precisou passar para você |
| **2.2** Painel do RabbitMQ no Grafana | ✅ na `develop` em 30/10 | Merge `625e0a7`, com as ressalvas do qa-redteam. Falta só o atraso de consumo (CA-01.4.f continua parcial) |
| Repasses do RabbitMQ (23 e 29/10) | ✅ na `develop` em 30/10 | Merge `062734f`: *policy* `at-least-once` na fila do analytics e DLQ sem limite de entregas |
| **2.3** Swagger do webhook PIX | ✅ na `develop` em 31/10 | `f9397ba` descreve a autenticação de cada provedor (simulado, Mercado Pago e Asaas). `a3b394f` completa os status de resposta (`not_approved` e `pending`) |
| **1.4** Doc 08 | 🟡 v1.2 pronta, esperando o Gabriel | Commit `94638ae` na branch `entrega-8-sprints` do fork, ainda local: o push espera o ok do Gabriel. A v1.2 registra a Sprint 8 até 31/10 e já anota A e C como seus. A v1.3 sai depois do ponto de controle de 03/11 |
| **2.1** T-01.5, CI por serviço | 🟡 parcial | O job do `analytics-service` está pronto em `feature/ci-analytics-service` e entra junto da H.2 do Gabriel. Falta o job do frontend (CA-01.5.a) |

**Uma boa notícia para o seu domínio.** Em 31/10 subi o banco do Gesway num PostgreSQL 17.11 gerenciado (Amazon RDS, numa conta temporária de workshop, sem custo para o time). O seu `schema` e os seus dois arquivos de seed rodaram **sem nenhuma mudança**, pelo mesmo `node command.js migrate` e `seed` do Docker. Resultado: 17 tabelas, 34 chaves estrangeiras e o seed completo (2 hotéis, 25 quartos, 60 hóspedes, 40 reservas, 28 pagamentos, 9 contas, 12 itens de conta e 14 produtos). A API rodou contra esse banco e o isolamento entre hotéis se manteve: o ADMIN do Sol vê 20 hóspedes, e o do Aurora vê 40. Relato completo em `docs/historico_sessao/weslley/banco_rds_conta_workshop_31out2026.md` (branch `docs/rds-workshop`).

---

## 2. O que ainda falta

| Item | Prazo | Situação |
|---|---|---|
| **1.3** PIX na demonstração (M6): webhook real com ngrok e plano B com o provedor simulado | 17/11 | 🔲 o backend está pronto; falta o ensaio |
| **1.5** O roteiro inteiro sobe no compose (M8) | 17/11 | 🔲 depende do seu seed do roteiro (ver §3.1) e da H.3 |
| **2.1** Job do frontend no CI (CA-01.5.a) | semana 3 | 🔲 |
| **2.4** Decidir o `e2e/` com Playwright no CI | antes de 24/11 | 🔲 |
| **3.1** SPEC-03 com o Asaas no lugar do Mercado Pago | junto do Doc 08 | 🔲 |
| **3.2** Três 🟡 do Asaas (validade de 1 ano, 404 que pode pausar a fila, CPF malformado vira 503) | antes de produção | 🔲 |

---

## 3. Dependências do ambiente

Tudo abaixo foi descoberto rodando de verdade entre 30 e 31/10, no Windows com WSL. Os itens **3.1 a 3.3** tocam diretamente o que você faz.

### 3.1 Seed (seu domínio) — datas fixas no passado

O seed tem datas fixas. As 4 reservas `CHECKED_IN` são de 14 a 21/06/2026, e nenhum pagamento tem `paid_at` no dia corrente. Na demonstração, os 4 cartões do dia da T-05.6 (ocupação, ADR, RevPAR e recebido hoje) aparecem **zerados**, e o painel "Hoje" do Gabriel (T-05.3) deve sofrer o mesmo.

**Pedido para o seed do roteiro (M8):** ancorar as datas no dia em que o seed roda (`CURRENT_DATE`), com pelo menos uma estadia `CHECKED_IN` que cubra hoje, uma chegada e uma saída do dia, e um pagamento `PAID` com `paid_at` de hoje. Para conferir na verificação, criei pela API uma estadia de teste no banco local: walk-in no quarto 101, de 31/10 a 03/11, com PIX de R$ 200. Os cartões mostraram 6,7%, R$ 150,00, R$ 10,00 e R$ 200,00.

### 3.2 Pagamento e receita — o dia é contado em UTC

O `/analytics/revenue` e o `/analytics/payment-mix` cortam o dia com `paid_at::date` numa sessão em UTC. Um pagamento feito depois das 21h no horário de Brasília cai no dia seguinte, no cartão "Recebido hoje" e nas somas por mês. Está no repasse ao Gabriel de 26/10, ainda aberto. Como a reverificação do `payment-mix` (item **D**) ficou com você, vale olhar os dois juntos. A sua regra D-68, do relatório de consumo interno, já conta o dia no horário de Brasília e pode servir de modelo.

### 3.3 Banco — SSL e versão do Node

- **SSL.** O `database/connections/sequelize.js` não tem opção de SSL. Num banco gerenciado, que exige SSL, só conectou com a variável `PGSSLMODE=no-verify`. Funciona para teste, mas não valida o certificado. Para produção (5º semestre), a sugestão é um `dialectOptions.ssl` explícito com `verify-full`. Como o arquivo de conexão é seu, a decisão também é.
- **Node.** O projeto pede o Node 24. O `migrate`, o `seed` e a API rodaram também no Node 20 (o do CloudShell da AWS), sem erro. O WSL daqui está no 22, e o `pnpm` avisa sobre a versão, sem quebrar nada.

### 3.4 Testes do core-service

- A suíte precisa de um Postgres na porta **55432**, com as credenciais do `.env.test`. Ela cria o próprio banco (`gestao_hotel_test`). Em 31/10: 45 arquivos, 991 testes passando, 1 pulado, em cerca de 2,5 minutos.
- O container que usei foi recriado assim, lendo as variáveis do `.env.test` sem mostrar a senha:
  ```bash
  cd services/core-service && set -a && . ./.env.test && set +a
  docker.exe run -d --name hotel-test-pg -p ${POSTGRES_PORT}:5432 \
    -e POSTGRES_USER="$POSTGRES_USER" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -e POSTGRES_DB=postgres postgres:17
  ```
- Use a imagem `postgres:17`, a mesma do CI. A `postgres:17-alpine` não estava baixada, e o *pull* dela travou.

### 3.5 Docker no Windows com WSL

- Pelo WSL, use o `docker.exe` do Windows: o *socket* do Docker não existe dentro do WSL.
- Se o Docker Desktop travar ("still waiting for init control API"), rode `docker.exe desktop stop --force` e depois `docker.exe desktop start`. O "Restart" da bandeja não resolve.
- No RabbitMQ, use `docker exec -u rabbitmq`, por causa do *cookie* do Erlang.

### 3.6 Frontend

- **pnpm.** Não está no PATH do WSL. Use `corepack pnpm`. O pacote do PMS se chama `app-pms`: `corepack pnpm --filter app-pms dev`.
- **Vite em `/mnt/c`.** Não recarrega quando um arquivo muda, porque o Windows não avisa o WSL. Depois de editar, **reinicie o Vite**. Em 31/10 a tela rodou código antigo por isso, e só o restart resolveu.
- **Vitest com pouca memória.** O WSL tem 2 GB. Com o backend e o Vite no ar, o vitest do `apps/pms` estourou memória. A opção `--maxWorkers=1` quebra o vitest 2.1.9 ("minThreads and maxThreads must not conflict"). O que funcionou foi `npx vitest run --poolOptions.forks.singleFork`.
- **Sessão.** O login fica salvo no `localStorage` (`hotel-pms-auth`), então F5 não desloga.

### 3.7 Rodar o backend fora do Docker

- **Chaves JWT.** O backend não sobe sem elas. Gere com `node scripts/gerar_chaves_jwt.js`, dentro de `services/core-service`; elas vão para `keys/`, que está no `.gitignore`.
- **Variáveis.** No compose, `PIX_WEBHOOK_SECRET`, `RABBITMQ_CORE_PASSWORD`, `MINIO_ROOT_PASSWORD` e `MINIO_PRESIGN_PASSWORD` são obrigatórias, e o `up` falha sem elas. Fora do compose, só o banco e as chaves JWT bastam para a API responder.
- **Seed.** Sem `ALLOW_SEED=1`, tanto o `node command.js seed` quanto o `./start.sh seed` recusam rodar, porque criam usuários com a senha conhecida `senha123`.

---

## 4. Para você saber (não é pedido)

- **🔴 do qa-redteam, área do Gabriel.** O *logout* não limpa o cache do React Query. O próximo usuário da mesma aba pode ver dados do anterior, inclusive de outro hotel. Atinge a lista de hóspedes e a comanda, que é sua no frontend. Repasse em `docs/qa/repasses/para_gabriel_31102026.md`. Nos indicadores, eu já separei o cache por usuário.
- **Barra de baixo do celular.** Com a aba Indicadores, o ADMIN passou a ter 6 abas, e em 375 px os rótulos se encostam. Também foi para o Gabriel, dono da casca.

---

## 5. Resumo dos pedidos para você

1. **Seed do roteiro (M8):** datas relativas a `CURRENT_DATE`, com estadia, chegada, saída e pagamento no dia (§3.1).
2. **Item D (`payment-mix`):** olhar junto o corte do dia em UTC (§3.2).
3. **SSL no `sequelize.js`:** decidir, para o 5º semestre, se entra um `dialectOptions.ssl` com `verify-full` (§3.3).

Se algum desses não couber na sua semana, me avise no grupo. Discutimos no ponto de controle de 03/11.
