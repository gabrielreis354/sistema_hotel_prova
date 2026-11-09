# Painel de andamento — MVP até 10/12/2026

> **Leia isto antes de começar qualquer sessão de trabalho no Gesway**, humana ou de agente.
> Este arquivo diz **onde estamos, o que está em curso, o que vem a seguir e como trabalhar em
> paralelo sem atropelar as outras frentes**. A estratégia (o porquê dos cortes e da grade) está em
> [`docs/PLANO_MVP_ATE_10DEZ2026.md`](PLANO_MVP_ATE_10DEZ2026.md).
>
> **Regra zero:** o estado do git manda. Se este painel disser uma coisa e o `git log` disser
> outra, o git vence — e você corrige o painel.

**Última atualização:** 03/11/2026, pelo orquestrador (sessão do Gabriel). Organizado **por meta (M1 a M10)**, como foi aceito na resposta ao parecer do Sirlande de 28/10.

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
0. **`docs/retomada/`**: se você está **retomando** uma frente (depois de compactação, queda ou troca de sessão), leia primeiro o arquivo de retomada dela, na própria branch (`docs/retomada/<branch-com-hifens>.md`). Quem coordena começa por `docs/retomada/ORQUESTRADOR.md` e `docs/retomada/ENTREGA_DOCUMENTOS_E_MVP.md`.
1. **§3**: as metas e quem está em cada uma. Não pegue uma meta que já tem dono ativo.
2. **§4**: a fila da sua trilha.
3. **§5**: as regras de paralelismo (worktree, banco e porta próprios).
4. A delegação ou o prompt indicado na fila.

Leitura de referência quando a tarefa pedir: `CLAUDE.md`, `docs/CODING_STANDARDS.md`,
`docs/FERRAMENTAL.md`, `frontend/DESIGN_PMS.md` (frontend), a SPEC da tarefa.

---

## 2. Decisões em vigor (não reabrir sem o Gabriel)

| Data | Decisão |
|---|---|
| 21/10 | **ADR-007 adiada para o 5º semestre.** Tudo é construído sobre o modelo atual de reserva (quarto principal + `reservation_rooms`) e o catálogo de eventos v1.x |
| 21/10 | **Retenção do outbox: 7 dias** |
| 21/10 | **Escopo do 4º semestre = o roteiro de demonstração** do `PLANO_MVP_ATE_10DEZ2026.md` §2. Nuvem, SPEC-07, rack completo e T-05.7 a T-05.12 são do 5º semestre |
| 21/10 | **Congelamento de funcionalidades em 24/11.** Depois, só correção e ensaio |
| 21/10 | Weslley sai da nuvem e vai para a T-05.6 (indicadores do gerente) e a T-01.5 (CI por serviço). Ambas entregues em 31/10 |
| 24/10 | **Walk-in:** `PENDING → CHECKED_IN` liberado no domínio |
| 24/10 | Alvo de nuvem: 1× `t3.small` no plano de créditos, com tudo destruído após cada sessão |
| 28/10 | **Parecer do Sirlande aceito:** metas M1 a M10 como acompanhamento e ordem de integração fk → analytics → t051 → t052 |
| 29/10 | **Os 8 documentos oficiais são do grupo**: qualquer um edita no fork, com crédito ao autor anterior no Histórico |
| 02/11 | **PRs dos 8 documentos abertos ao professor** (#32 a #39 no repositório UniFAAT) |

**Decisões do encontro de 03/11** (pauta: `docs/delegacoes/pauta_ponto_controle_03nov2026.md`). Registre aqui quando forem tomadas:
- [ ] 5: passo 6, reserva direta do hóspede, demonstrada pela API pública
- [ ] 6: fechamento de conta só no balcão; conta INTERNAL mantém o comportamento atual
- [ ] 7: Playwright no CI como job não bloqueante
- [ ] L-1: `/analytics/internal-consumption` continua no core
- [ ] Contrato da H.3: dinheiro como string, `unpaid` com `guest_id`, `paid` e `balance`, 400 para entrada inválida
- [ ] Quarto: `CLEANING → MAINTENANCE`
- [ ] Diagrama do Doc 05 com ícones oficiais da AWS
- [ ] Doc 08: métrica individual

---

## 3. Metas M1 a M10: onde estamos

> A meta só fica ✅ quando está **na `develop`**. Branch pronta não conta.
> Antes de assumir uma meta, confira se a branch ainda está ativa:
> `git log -1 --format="%ad %s" --date=relative origin/<branch>`.

| Meta | O quê (passo do roteiro) | Dono | Data | Situação em 03/11 | Branch / PR |
|---|---|---|---|---|---|
| M1 | Quartos e categorias | Gabriel | 30/10 | ✅ Na `develop` em 03/11 | #106 (`e4c9ae3`) |
| M2 | Reservas, check-in e check-out, walk-in | Gabriel | 30/10 | ✅ Na `develop` em 03/11 | #108 (`cb04f85`) |
| M3 | Comanda P2 | Sirlande | 17/11 | Sirlande informa | — |
| M4 | Painel Hoje (T-05.3) | Gabriel | 10/11 | 🟡 Implementada; qa-redteam de 04/11 corrigido na branch em 09/11 (resta 🟡-4 e 🟢); falta o PR. Barra inferior com até 5 abas e menu "Mais" | `feature/t053-painel-hoje` (wt-t053 · PG 5464 · backend 3053 · Vite 5253) |
| M5-a | Conta em linha do tempo | Gabriel | 30/10 | ✅ Na `develop`, junto com a M2 | #108 |
| M5-b | Pagamento no check-out | Sirlande | 07/11 | Sirlande informa; o Gabriel revisa a tela antes de 07/11 | — |
| M5-c | Estorno (backend) | Sirlande | 10/11 | Sirlande informa | — |
| M6 | PIX | Weslley | 17/11 | Compose com o Asaas e SPEC-03 entraram em 31/10 | — |
| M7-a | analytics-service (H.2) | Gabriel | 29/10 | ✅ Na `develop` em 31/10 | #105 (`fbe086d`) |
| M7-b | H.3: indicadores servidos pelo analytics | Gabriel | 14/11 | 🟡 qa-redteam: APROVADO COM RESSALVAS; correção dos 4 🟡 em curso | #109 (rascunho), `feature/analytics-cutover` |
| M8 | Seed e compose | Sirlande e Weslley | 17/11 | Seed do `start.sh` entrou em 30/10 | — |
| M9 | Congelamento e ensaio, zero 🔴 aberto | todos | 24/11 | — | — |
| M10 | Release `develop → main` | Gabriel, com aprovação do Sirlande | 01/12 | Release intermediária aberta em 03/11 | #110 |

**Fora das metas, mas já na `develop`:**
- #104: vazamento de FK entre hotéis, em 31/10;
- T-05.6 b/c (Weslley);
- T-01.5, CI por serviço (Weslley);
- painel e alertas do RabbitMQ (CA-01.4.f, parcial).

**PRs abertos:**
- **Repositório do hotel:**
  - #107: retomada, pacote dos documentos e pauta;
  - #109: H.3, em rascunho;
  - #110: release.
- **Repositório UniFAAT:** #32 a #39, os 8 documentos oficiais.

---

## 4. A fila, por trilha

Prioridade do projeto: trabalho em risco de perda → vulnerabilidade/dinheiro → bloqueio de outra
frente → condição de aprovação → produto demonstrável → polimento.

| # | Tarefa | Meta | Trilha | Depende de | Como começar |
|---|---|---|---|---|---|
| 1 | H.3: corrigir os 4 🟡 do qa-redteam, verificação estreita e merge | M7-b | Gabriel | `feature/ci-analytics-service` mergeada (🟡-2, Weslley) | `docs/qa/redteam_analytics-cutover-h3_02112026.md` |
| 2 | **T-05.3**: painel Hoje | M4 | Gabriel | T-05.2 ✅ | Prompt §8.2 |
| 3 | Revisar a tela de pagamento do Sirlande | M5-b | Gabriel | branch do Sirlande | — |
| 4 | Pagamento no check-out e estorno | M5-b, M5-c | Sirlande | T-05.2 ✅ | — |
| 5 | Comanda P2 | M3 | Sirlande | — | — |
| 6 | Mergear `feature/ci-analytics-service` e pôr o RabbitMQ no `ci-core-service.yml` | M7-b | Weslley | — | `docs/qa/repasses/para_weslley_02112026.md` |
| 7 | Revisar a infra da H.3 (nginx e k8s marcados com `[revisão do Weslley]`) | M7-b | Weslley | — | PR #109 |
| 8 | PIX no roteiro | M6 | Weslley | — | SPEC-03 |
| 9 | Seed e compose sobem o roteiro inteiro, com o analytics | M8 | Sirlande e Weslley | H.3 | — |
| 10 | Roteiro de 7 passos no Playwright, como job não bloqueante | M9 | Weslley (workflow) e Gabriel (roteiro) | decisão 7 | — |
| 11 | 🧊 24/11: congelamento, qa-redteam geral e cobertura (T-06.1) | M9 | todos | — | — |
| 12 | Ensaio geral e release final `develop → main` | M10 | todos | 11 | — |

**Pendências pós-merge registradas** (pegue quando a sua trilha folgar):
- **T-05.2, LGPD:** o seletor de hóspede mostra CPF, telefone e e-mail completos. Mascarar o CPF. A busca deve ter `minLength: 3` no backend (🟢-1 e 🟢-3 de `docs/qa/redteam_t052-reservas_delta2_02nov2026.md`).
- **T-05.2:** trocar o `ReservationStatusBadge` local pelo `StatusBadge` do `@hotel/ui`.
- **Frontend:** `roomsApi.test.ts` falha às vezes quando o turbo roda tudo em paralelo (3 s sozinho).
- **Sirlande:** `GET /rooms/:id` e `GET /room-categories/:id` com id não-UUID respondem 500. Registrar o D-xx do #104 na SPEC-04.
- **Staging:** rodar a consulta que procura categoria de outro hotel gravada antes do #104.

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
| 5464 · 3053 · 5253 | PG · backend · Vite | T-05.3 |
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

## 6. Documentos oficiais

**Situação em 03/11:** os 8 documentos estão em PR ao professor (`AleTavares/UniFAAT-projeto-experimental-2027-1`). Cada PR mexe só no arquivo do próprio documento, e a descrição cita os PRs irmãos.

| Doc | Versão | PR | Natureza |
|---|---|---|---|
| 01 Solicitação | v1.1 | #38 | reentrega |
| 02 Requisitos | v1.4 | #32 | reentrega |
| 03 DFD | v1.3 | #33 | reentrega (revisão do grupo sobre a v1.2 do Sirlande) |
| 04 MER | v1.4 | #39 | revisão (conferida coluna a coluna contra o schema) |
| 05 Arquitetura em nuvem | v1.2 | #34 | entrega nova (1× `t3.small`, plano de créditos; a auditoria de 19/10 foi aplicada) |
| 06 C4 Model | v1.2 | #35 | entrega nova |
| 07 ADR | v1.1 | #36 | entrega nova (11 ADRs, ADR-004 revista) |
| 08 Sprints | v1.1 | #37 | entrega nova. Atualizar a nota "a confirmar até 04/11" depois do encontro de 03/11, na mesma branch |

- **Auditoria de coerência:** `docs/auditoria_coerencia_documentos_28out2026.md`, com as 16 contradições, todas resolvidas.
- **Plano e descrições dos PRs:** `docs/entrega-documentos/`.
- **Pendentes:**
  - diagrama do Doc 05 com os ícones oficiais da AWS;
  - conferência do Sirlande e do Weslley nas revisões dos Docs 03, 04 e 08.

**Regras de entrega ao professor:**
- Título: `[Gesway] - Entrega N - Descrição`, com N igual ao número do encontro no README do repositório do professor.
- Branch a partir de `upstream/main`, com **só** os arquivos da entrega.
- **Nunca renomear a branch de um PR aberto**, porque o GitHub fecha o PR.
- Correção num PR aberto entra como commit novo na mesma branch.
- PR ao professor só com autorização explícita do Gabriel.

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
