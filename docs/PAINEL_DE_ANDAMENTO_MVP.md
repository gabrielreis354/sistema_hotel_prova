# Painel de andamento — MVP até 10/12/2026

> **Leia isto antes de começar qualquer sessão de trabalho no Gesway**, humana ou de agente.
> Este arquivo diz **onde estamos, o que está em curso, o que vem a seguir e como trabalhar em
> paralelo sem atropelar as outras frentes**. A estratégia (o porquê dos cortes e da grade) está em
> [`docs/PLANO_MVP_ATE_10DEZ2026.md`](PLANO_MVP_ATE_10DEZ2026.md).
>
> **Regra zero:** o estado do git manda. Se este painel disser uma coisa e o `git log` disser
> outra, o git vence — e você corrige o painel.

**Última atualização:** 21/10/2026, pelo orquestrador (sessão do Gabriel).

---

## 1. Como começar uma sessão (5 minutos)

```bash
cd /home/gabri/sistema_gestao_hotel          # checkout principal, na develop
git fetch --all --prune
git log --oneline -10 origin/develop          # o que entrou
git worktree list                             # quem está trabalhando onde
bash scripts/estado.sh                        # risco de perda, branches, portão de QA
```

Depois, nesta ordem:
0. **`docs/retomada/`** — se você está **retomando** uma frente (depois de compactação, queda ou troca de sessão), leia primeiro o arquivo de retomada dela, na própria branch (`docs/retomada/<branch-com-hifens>.md`). Quem coordena começa por `docs/retomada/ORQUESTRADOR.md`. A regra está em `docs/retomada/README.md`.
1. **§3** — o que está em curso (não pegue uma frente que já tem dono ativo).
2. **§4** — a fila. Pegue o primeiro item **sem dono ativo** da sua trilha, ou o primeiro **livre**.
3. **§5** — as regras de paralelismo (worktree, banco e porta próprios).
4. A delegação ou o prompt indicado na fila.

Leitura de referência quando a tarefa pedir: `CLAUDE.md`, `docs/CODING_STANDARDS.md`,
`docs/FERRAMENTAL.md`, `frontend/DESIGN_PMS.md` (frontend), a SPEC da tarefa.

---

## 2. Decisões em vigor (não reabrir sem o Gabriel)

| Data | Decisão |
|---|---|
| 21/10 | **ADR-007 adiada para o 5º semestre.** Tudo é construído sobre o modelo atual de reserva (quarto principal + `reservation_rooms`) e o catálogo de eventos v1.0 |
| 21/10 | **Retenção do outbox: 7 dias** |
| 21/10 | **Promoção `develop → main` do PR #98 confirmada** pelo Gabriel |
| 21/10 | **Escopo do 4º semestre = o roteiro de demonstração** do `PLANO_MVP_ATE_10DEZ2026.md` §2. Nuvem (T-02.2/2.3/2.5), SPEC-07, rack completo e T-05.7 a T-05.12 são do 5º semestre |
| 21/10 | **Congelamento de funcionalidades em 24/11.** Depois, só correção e ensaio |
| 19/10 | Documentos oficiais passam pela **revisão do time** e podem ser corrigidos por ele antes da entrega |
| 14/10 | **Doc 07 (ADR) é do Gabriel** |

**Decisões pendentes do Gabriel** (registre aqui quando forem tomadas):
- [ ] Weslley sai da nuvem e vai para T-05.6 (financeiro) e T-01.5 (CI por serviço) — *recomendado*
- [ ] Entregar Docs 05, 06 e 07 num PR só — *recomendado*; **datas dos próximos encontros com o professor**
- [ ] Publicar este painel e o plano (commit em `docs/` + PR)

---

## 3. Em curso agora

> Antes de pegar qualquer item, confira se a branch abaixo ainda está ativa:
> `git log -1 --format='%ad %s' --date=relative origin/<branch>`. Branch sem commit há mais de 2 dias
> e sem relatório = pergunte ao Gabriel antes de assumir.

| Frente | Branch | Quem | Worktree | Portas | Estado em 21/10 |
|---|---|---|---|---|---|
| **H.2** — `analytics-service` (CA-01.4.g, h, i, j, l, m) | `feature/analytics-service` | agente (trilha Gabriel) | `/home/gabri/wt-h2-analytics` | PG 5441 · RabbitMQ 5682/15682 | em implementação |
| **T-06.13** — estorno `VOIDED` | `fix/t0613-estorno-pagamento` | agente | `/home/gabri/wt-t0613` | PG 5442 | em implementação |
| Repasses do QA ao Gabriel — conta de diária na troca de quarto; lock no ramo FAILED do webhook | `fix/repasses-gabriel-out` | agente | `/home/gabri/wt-repasses` | PG 5443 | RED do item 1 commitado |
| **T-05.1** — quartos e categorias (frontend) | `feature/t051-quartos-categorias` | agente | `/home/gabri/wt-t051` | PG 5444 · backend 3051 | `api-client` regenerado e no remoto (`0a0b9b4`) |
| **T-05.2** — reservas e check-in/out (frontend) | `feature/t052-reservas` | agente (trilha Gabriel) | `/home/gabri/wt-t052` | PG 5445 · backend 3052 | em implementação |
| **T-05.5** — comanda do garçom (Fase A) | `feature/t055-comanda` | **Sirlande** | — | — | delegação pronta (PR #99) |

**PRs abertos** (`gh pr list --repo gabrielreis354/sistema_hotel_prova`):
- **#97** — Doc 07 v1.0 (11 ADRs, ADR-007 adiada, ADR-008 com Asaas)
- **#99** — decisões de 21/10 e a delegação da T-05.5

**Fork da UniFAAT** (`gabrielreis354/UniFAAT-projeto-experimental-2027-1`) — branches de entrega prontas, **sem PR para o professor ainda**:
- `entrega-6-c4` — Doc 06 v1.1, auditado e **pronto**
- `entrega-5-arquitetura-nuvem` — Doc 05 v1.1, **não pronto** (ver §6)

---

## 4. A fila — em ordem de prioridade

Prioridade do projeto: trabalho em risco de perda → vulnerabilidade/dinheiro → bloqueio de outra
frente → condição de aprovação → produto demonstrável → polimento.

### Semana 1 — 21 a 27/10

| # | Tarefa | Trilha | Depende de | Como começar |
|---|---|---|---|---|
| 1 | Terminar as 5 frentes da §3 + **qa-redteam de cada uma** + PR | Gabriel | — | §7 (portão) |
| 2 | **T-05.5** comanda, Fase A | Sirlande | — | `docs/delegacoes/t055_comanda_frontend_sirlande_21out2026.md` (no PR #99) |
| 3 | Respostas do Weslley: data de criação da conta AWS e 1 nó × 2 nós | Weslley | — | mensagem enviada pelo Gabriel |
| 4 | Painel do RabbitMQ no Grafana (CA-01.4.f) | Weslley | — | `docs/historico_sessao/gabriel/outbox_core_15102026.md`, pendência 1 |

### Semana 2 — 28/10 a 03/11

| # | Tarefa | Trilha | Depende de | Como começar |
|---|---|---|---|---|
| 5 | **H.3** — as 7 consultas sobre as projeções, nginx `/analytics/` → analytics, remoção do `/analytics` do core, serviço no compose (CA-01.4.k, n, o, p, q) | Gabriel | H.2 mergeada | Prompt §8.1 |
| 6 | **T-05.3** — painel Hoje | Gabriel | T-05.2 mergeada | Prompt §8.2 |
| 7 | **T-04.5** — bill da reserva delegando às contas | Sirlande | — | SPEC-04 T-04.5 |
| 8 | **T-04.6 (só a)** — check-in cria a conta da suíte. Começa no fim da semana 2 ou na 3, assim que a T-04.5 entrar | Sirlande | T-04.5 | SPEC-04 CA-04.6.a, c, d. **b, e, f ficam para o 5º semestre** |
| 9 | **T-05.6** — financeiro e indicadores (consome o analytics) | Weslley | — (o caminho `/analytics` não muda pelo nginx) | Prompt §8.3 |
| 10 | **Doc 05** — aplicar a auditoria (§6) e entregar 05/06/07 | Gabriel | decisões §2 | §6 |

### Semana 3 — 04 a 10/11

| # | Tarefa | Trilha | Depende de | Como começar |
|---|---|---|---|---|
| 11 | Roteiro de demonstração de ponta a ponta no compose (as 7 etapas do plano §2) | Gabriel | 5, 6, 2, 9 | Prompt §8.4 |
| 12 | **T-01.5** — CI por serviço (build, imagem em *registry*, testes por serviço, cobertura global). **Deploy no cluster (CA-01.5.c) é do 5º semestre** | Weslley | H.2 | SPEC-01 T-01.5 |
| 13 | **T-04.7** — *seed* de demonstração e relatório de consumo interno | Sirlande | T-04.6 | SPEC-04 T-04.7 |
| 14 | **T-06.12** — dado pessoal fora do log | livre | — | SPEC-06 T-06.12 |
| 15 | `migrate` antes e depois do *rollout* (repasse) | Weslley | — | `docs/qa/repasses/para_weslley_19102026.md` |
| 16 | **Doc 08** reescrito com esta grade e o registro real | Weslley | — | `docs/sugestoes-documentos-oficiais/08-sprints/` |

### Semanas 4 a 7 — 11/11 a 10/12

| # | Tarefa | Trilha |
|---|---|---|
| 17 | T-05.4 rack **simplificado**, só se a semana 4 sobrar | Gabriel |
| 18 | Contingência: `docker compose up` sobe o roteiro inteiro, com o analytics | Weslley |
| 19 | 🧊 24/11 — congelamento · qa-redteam geral · cobertura (T-06.1) | todos |
| 20 | Ensaio geral · *release* `develop → main` · Doc 02 v1.4 e Doc 03 para a revisão final | todos |
| 21 | Folga e entrega final (até 10/12) | — |

---

## 5. Regras de paralelismo (o que evita uma frente quebrar a outra)

**Worktree próprio, sempre a partir de `origin/develop`:**
```bash
git -C /home/gabri/sistema_gestao_hotel fetch origin
git -C /home/gabri/sistema_gestao_hotel worktree add /home/gabri/wt-<tarefa> -b <tipo>/<tarefa> origin/develop
```
Nunca trabalhe no checkout principal nem no worktree de outra frente.

**Banco (e broker) de teste próprios.** O `globalSetup` do core cria um banco de nome fixo e cada
arquivo faz `truncateAll` — duas suítes no mesmo PostgreSQL se sabotam.
```bash
docker run --rm -d --name pg-<tarefa> -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p <porta>:5432 postgres:17
cp services/core-service/.env.test.example services/core-service/.env.test   # e ajuste POSTGRES_PORT=<porta>
```
Pare e remova o container no fim da sessão.

**Portas — anote a sua aqui antes de subir:**

| Porta | Uso | Frente |
|---|---|---|
| 5432 · 5672 · 6789 · 3000 | **Proibidas** (banco de teste compartilhado, outros projetos, backend local de dev) | — |
| 5441 · 5682 · 15682 | PG · RabbitMQ · painel | H.2 |
| 5442 | PG | T-06.13 |
| 5443 | PG | repasses |
| 5444 · 3051 | PG · backend | T-05.1 |
| 5445 · 3052 | PG · backend | T-05.2 |
| **5446 em diante · 3053 em diante** | livres | próxima frente |

**Arquivos onde as frentes se esbarram:**

| Arquivo | Regra |
|---|---|
| `frontend/packages/api-client/` | **Regenera, nunca edita.** Depois do *rebase* em `origin/develop`, rode `pnpm gen:api` de novo; se o Swagger não mudou, o arquivo sai idêntico |
| `frontend/apps/pms/src/App.tsx`, `routes/nav.ts` | Só **acrescente** sua rota e seu item de menu; não reordene as linhas dos outros |
| `frontend/packages/ui/` | Componente nasce em `features/<módulo>/components/` e só sobe quando o **segundo** módulo precisar. `StatusBadge` está sendo estendido pela T-05.1 — os outros não mexem até ela entrar |
| Layout, `AppShell`, `ProtectedRoute`, `RequireRole`, sessão | Gabriel. Mudança de forma exige acordo |
| `services/core-service/db/schema.sql`, `app/Models/` | Sirlande é o dono; avise antes |
| `infra/k8s/`, `docker-compose.yml`, `.github/workflows` | Weslley é o dono; marque `[revisão do Weslley]` no PR |
| `config/swagger.js` | Edição pontual no trecho do seu endpoint |
| `docs/specs/SPEC-*.md` | Marque só os CAs da sua tarefa |

**Commit e push a cada passo lógico concluído.** Em 21/10 cinco sessões caíram ao mesmo tempo por
falha de rede; o que estava commitado sobreviveu.

**Proibido, sempre:** `git add .`/`-A`; `require()`; query sem `tenant_id`; `Number()`/`parseFloat` em
dinheiro; `as unknown as` no frontend; editar o `api-client` à mão; segredo no repositório; comando
AWS/Terraform (regra absoluta de free-tier; nuvem é do 5º semestre).

---

## 6. Documentos oficiais — o que falta

| Doc | Onde está | Falta |
|---|---|---|
| 05 | fork, `entrega-5-arquitetura-nuvem` | Aplicar a auditoria de 19/10 (abaixo) |
| 06 | fork, `entrega-6-c4` | ✅ pronto |
| 07 | hotel, PR #97 | ADR-004 alinhada ao Doc 05 final; transcrever no fork quando for a vez |
| 08 | hotel, `docs/sugestoes-documentos-oficiais/08-sprints/` | Reescrever com esta grade e o registro real |
| 02 | entregue v1.3 | v1.4 na revisão final: RF-045 no `b2b-service`, RNF-023, exceção do RNF-003 na nuvem, nomes de módulo |
| 03 | entregue v1.2 | Revisão final: `PRODUCTS` 🔷 → ✅ e PDF de orçamento no D-005 |

**Doc 05 — achados da auditoria de 19/10 a aplicar** (o relatório não foi versionado; este é o resumo):
1. 🔴 **Modelo de free-tier:** o modelo de 12 meses vale só para contas anteriores a 15/07/2025 e já expirou para elas. Reescrever a §6 sobre o **plano de créditos** (US$ 100–200, 6 meses, conta fecha ao fim), com consumo de crédito por sessão, e registrar que a conta é criada perto do 5º semestre. No plano de créditos a `t3.small` é elegível: reavaliar 1 nó × 2 nós (decisão do Weslley/Gabriel).
2. 🟠 `cpu_credits = "standard"` nas instâncias T3 (o padrão *unlimited* cobra).
3. 🟠 SG de saída: liberar 5432 → `sg-db` e o tráfego entre nós (6443, 10250, UDP 8472), ou saída livre.
4. 🟠 Overlay `kustomize` da nuvem: sem postgres/redis/minio/`secret.yaml`, 1 réplica, PDB ajustado.
5. 🟠 RNF-003 (3 réplicas) declarado como exceção consciente na nuvem, citando a ADR-004.
6. 🟠 SSL obrigatório no RDS (PostgreSQL 15+): `dialectOptions.ssl` no Sequelize; URL assinada com papel IAM só de leitura (`sts:AssumeRole`).
7. 🟠 RNF-010 na nuvem: NetworkPolicy de saída para o RDS só dos serviços.
8. 🟡 Webhook do Asaas é por conta (trocar a URL a cada sessão); *credential provider* do ECR no k3s; Performance Insights/KMS desligados; endpoint *gateway* do S3; OIDC no CI; `REVOKE CONNECT … FROM PUBLIC` entre *databases*; onde o `app-pms` é hospedado.

**Regras de entrega ao professor:** título `[Gesway] - Entrega N - Descrição` (N = número do encontro
no README do repo do professor: 5 nuvem, 6 C4, 7 ADR, 8 sprints); branch a partir de `upstream/main`
com **só** os arquivos da entrega; **nunca renomear a branch de um PR aberto** (o GitHub fecha o PR).
PR para o professor só com autorização explícita do Gabriel.

---

## 7. Portão de QA e fluxo até a `develop`

1. `bash scripts/qa_checks.sh` limpo (frontend: regra 9).
2. Suíte completa verde no **seu** banco; cobertura ≥ 60% (core).
3. Frontend: `pnpm -C frontend typecheck` e `build` limpos; verificação real no navegador com o
   `playwright` (desktop e 375×812), sem erro de console.
4. **qa-redteam** com relatório em `docs/qa/` — ninguém audita o próprio código. Veredito
   REPROVADO → corrigir e reauditar (delta).
5. SPEC com os CAs marcados e evidência; relatório em `docs/historico_sessao/<dev>/`.
6. Push da branch e **PR para `develop`**. Merge diário, PRs pequenos, nenhum PR parado mais de 2 dias.
7. Atualize a §3 e a §4 deste painel no mesmo PR.

---

## 8. Prompts prontos para as próximas frentes

Todos seguem o contrato do `CLAUDE.md` §5. Antes de colar, troque `<porta>` por uma livre da §5.

### 8.1 H.3 — cutover do analytics (Gabriel, depois da H.2)

```
Você é o agente executor da trilha do Gabriel no Gesway. Tarefa: T-01.4 etapa H.3 — cutover do
analytics-service (CA-01.4.k, n, o, p, q da docs/specs/SPEC-01-microsservicos.md).
Leia antes: docs/PAINEL_DE_ANDAMENTO_MVP.md (§5 regras de paralelismo); a T-01.4 na SPEC-01;
docs/specs/anexos/SPEC-01-catalogo-eventos.md v1.0 (§4, §9.1 D-1 a D-4); docs/delegacoes/
rodada3_gabriel_04out2026.md ETAPA H (NUMERIC sem ::float, D-1 sem email/telefone, D-3 refinada,
CA-01.4.p com cada asserção alterada justificada); o relatório da H.2 em docs/historico_sessao/gabriel/;
as 7 consultas em services/core-service/app/Controllers/AnalyticsApi/.
Worktree: /home/gabri/wt-h3 · branch feature/analytics-cutover a partir de origin/develop ·
PG e RabbitMQ próprios em portas livres da §5.
Tarefa: reescrever as 7 consultas sobre as projeções no analytics-service; nginx roteia /analytics/
para o novo serviço (compose e infra/k8s — [revisão do Weslley]); o core deixa de responder
/analytics; tests/analytics.test.js passa contra o novo serviço semeando pelo core e aguardando o
consumo; Deployment k8s do analytics (sem nuvem). ADR-007 adiada: modelo atual.
Aceite: suítes do core e do analytics verdes; isolamento por tenant no analytics; qa_checks limpo.
Saída: commits lógicos, push, SEM PR (o Gabriel roda o qa-redteam), SPEC marcada, relatório
docs/historico_sessao/gabriel/analytics_cutover_h3_<ddmmaaaa>.md. Commit e push a cada passo.
Pare se: teste do core que passava falhar fora das asserções D-1 a D-3; chave em diff.
```

### 8.2 T-05.3 — painel Hoje (Gabriel, depois da T-05.2)

```
Agente de frontend do Gesway. Tarefa: T-05.3 — painel "Hoje" (CA-05.3.a a g da
docs/specs/SPEC-05-frontend-pms.md), tela inicial da recepção, usada também pelo gerente no celular.
Leia antes: docs/PAINEL_DE_ANDAMENTO_MVP.md §5; frontend/DESIGN_PMS.md; docs/FERRAMENTAL.md;
o módulo features/reservations (T-05.2) como referência e para reaproveitar ações de check-in/out;
endpoints de reservas, rooms (status CLEANING e liberação) e /analytics/alerts (D-3 refinada:
no-show = reserva sem nenhum pagamento PAID).
Stack: React 18.3.1, TS, Vite, Tailwind, TanStack Query; api-client gerado (nunca editado); sem
as unknown as; dinheiro/data por @hotel/domain; quatro estados; cor + rótulo; alvo ≥ 48px;
nenhuma tela baixa a coleção inteira para filtrar no cliente.
Worktree /home/gabri/wt-t053 · branch feature/t053-painel-hoje · backend e PG próprios (portas §5).
Substitui o Placeholder da rota index. Verificação com playwright (desktop e 375×812).
Revisão Impeccable + emil-design-eng. Saída: push, SEM PR, SPEC marcada, relatório em
docs/historico_sessao/gabriel/. Commit e push a cada passo.
```

### 8.3 T-05.6 — financeiro e indicadores (Weslley)

```
Agente de frontend do Gesway, trilha do Weslley. Tarefa: T-05.6 — financeiro e indicadores
(CA-05.6.a a c da docs/specs/SPEC-05-frontend-pms.md; o d depende da T-04.7 e fica para depois).
Esta é a tela que mostra à banca os microsserviços: os indicadores vêm do analytics-service.
Leia antes: docs/PAINEL_DE_ANDAMENTO_MVP.md §5; frontend/DESIGN_PMS.md; docs/FERRAMENTAL.md;
os 7 endpoints /analytics (respostas pelo Swagger) e /payments; features/guests como referência.
Regras do domínio: receita conta só pagamentos PAID (T-06.13); D-1 — sem e-mail e telefone em
ranking e alertas; valores NUMERIC chegam como string — formatar só por @hotel/domain.
Desktop com gráficos; mobile com 4 números do dia em cartões. O caminho /analytics não muda com a
H.3 (o nginx passa a rotear para o novo serviço), então a tela não depende do cutover.
Worktree /home/gabri/wt-t056 · branch feature/t056-financeiro · backend e PG próprios (portas §5).
Saída: push, SEM PR, SPEC marcada, playwright desktop e celular, relatório em
docs/historico_sessao/weslley/. Commit e push a cada passo.
```

### 8.4 Roteiro de demonstração de ponta a ponta (Gabriel, semana 3)

```
Agente do Gesway. Tarefa: provar o roteiro de demonstração do docs/PLANO_MVP_ATE_10DEZ2026.md §2,
as 7 etapas, rodando no docker compose com core, analytics-service, RabbitMQ, PostgreSQL, MinIO e
o frontend. Entregue: (1) docs/ROTEIRO_DEMONSTRACAO.md com o passo a passo exato, dados de seed e
o que mostrar em cada etapa; (2) um teste e2e com playwright que percorre o roteiro; (3) a lista de
defeitos encontrados, cada um com reprodução, repassados ao dono pela tabela do PAINEL §5.
Não corrija defeito de outra trilha — repasse. Sem nuvem.
```

---

## 9. Como atualizar este painel

- Ao **começar** uma frente: linha na §3 (branch, quem, worktree, portas), porta na tabela da §5 e **arquivo de retomada** criado na branch (`docs/retomada/README.md`).
- **A cada checkpoint:** atualize o arquivo de retomada da frente, com commit e push junto do trabalho.
- Ao **terminar**: tire da §3, marque o item na §4, registre no Doc 08 (execução real).
- Ao **tomar uma decisão**: §2, com a data.
- Atualize no mesmo PR da entrega. Painel desatualizado é pior que painel nenhum.
