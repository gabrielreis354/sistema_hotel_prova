# Plano de PRs — pacote de entrega dos 8 documentos (Gesway)

> Preparado em 30/10/2026. **Nenhum PR foi aberto.** Cada PR só sai com a autorização do Gabriel.
> Upstream: `AleTavares/UniFAAT-projeto-experimental-2027-1` (base `main`). Fork: `gabrielreis354/UniFAAT-projeto-experimental-2027-1`.

## 1. Decisão: um PR por documento, todos abertos na mesma rodada

- O README define **um PR por encontro**, com o título `[Grupo] - Entrega N - Descrição`, em que N é o encontro. Os PRs anteriores do grupo seguiram esse padrão até no mesmo encontro: o DFD (#15) e o MER (#18) foram em PRs separados, os dois como "Entrega 4". A reentrega do MER (#18) também manteve o N original.
- Um PR único com os 8 documentos teria de usar "Entrega Final", que o README reserva para o fechamento do semestre, e misturaria entregas novas (05 a 08) com reentregas (01 a 04). Fica difícil para o professor aprovar uma e devolver outra.
- **As dependências se resolvem pela ordem e pelo momento, não juntando branches.** Os documentos se citam com versão (02 v1.4 ↔ 03 v1.3 ↔ 06 v1.2 ↔ 05 v1.2 ↔ ADR-004 revista ↔ 08 v1.1 ↔ 01 v1.1). Por isso os 8 PRs são abertos **na mesma rodada**, na ordem abaixo, e cada descrição cita os PRs irmãos. Como cada branch toca só o próprio arquivo, o professor pode fazer o merge em qualquer ordem sem conflito.
- Por isso **não existe branch combinada**.

Mapeamento de N (README, §Fluxo de Entregas): 01 → Entrega 2 · 02 → Entrega 3 · 03 e 04 → Entrega 4 · 05 → Entrega 5 · 06 → Entrega 6 · 07 → Entrega 7 · 08 → Entrega 8.

## 2. Ordem recomendada

| # | Documento | Branch (origin) | Hash | Natureza | Por que nesta posição |
|---|---|---|---|---|---|
| 1 | 02 Requisitos v1.4 | `entrega-2-requisitos-v14` | `3933978` | reentrega | O 03 v1.3 cita o 02 v1.4 (coluna Módulo, RF-045). Vai antes do 03 |
| 2 | 03 DFD v1.3 | `entrega-3-dfd-v13` | `6f5fcbd` | reentrega | O 06 v1.2 diz que a diferença do PDF foi resolvida no 03 v1.3. Vai antes do 06 |
| 3 | 05 Arquitetura em nuvem v1.2 | `entrega-5-arquitetura-nuvem` | `ff69a36` | entrega nova | Bloco 05+06+07: 1 nó `t3.small` coerente com a ADR-004 revista |
| 4 | 06 C4 Model v1.2 | `entrega-6-c4-v12` | `51bf706` | entrega nova | Mesmo bloco. **Usar a `-v12`**, não a `entrega-6-c4` |
| 5 | 07 ADR v1.1 | `entrega-7-adr` | `fb11fc6` | entrega nova | Fecha o bloco: ADR-004 revista e as ADRs citadas pelo 05 e pelo 06 |
| 6 | 08 Sprints v1.1 | `entrega-8-sprints` | `381464e` | entrega nova | O 01 v1.1 remete aos papéis do 08 v1.1, Seção 2. Vai antes do 01 |
| 7 | 01 Solicitação v1.1 | `entrega-1-solicitacao-v11` | `866dc91` | reentrega | Junto com o 08 ou depois dele |
| 8 | 04 MER v1.4 | `entrega-4-mer-v13-historico` | `885d2b4` | revisão | Revisão de conferência contra o código. Fecha a rodada |

**Antes de abrir os PRs 6 e 8**, confirme com os donos: o Weslley (Doc 08) e a Sirlande (Doc 04; o Doc 03 também é dela). O grupo edita direto no fork desde 29/10, mas os commits de 30/10 nessas branches são deste pacote (ver relatório).

**Pendências que pedem decisão antes de abrir** (ver o relatório): diagrama do 05 com ícones oficiais da AWS; nota "a confirmar até 04/11" no 08 (abrir o PR do 08 depois do ponto de controle de 03/11). Resolvidos em 30/10: RNF-029 de monitoramento no 02 (`3933978`) e premissa e orçamento do 01 pelo plano de créditos (`866dc91`).

## 3. Comandos (rodar do WSL, nesta ordem; NÃO executados)

```bash
UP=AleTavares/UniFAAT-projeto-experimental-2027-1
FORK=gabrielreis354
B=docs/entrega-documentos/pr-bodies   # rodar da raiz do repositorio do codigo

wsl gh pr create -R $UP --base main --head $FORK:entrega-2-requisitos-v14 \
  --title "[Gesway] - Entrega 3 - Documento de Requisitos Funcionais e Não Funcionais (v1.4)" --body-file $B/01-doc02.md
wsl gh pr create -R $UP --base main --head $FORK:entrega-3-dfd-v13 \
  --title "[Gesway] - Entrega 4 - Diagrama de Fluxo de Dados (DFD) v1.3" --body-file $B/02-doc03.md
wsl gh pr create -R $UP --base main --head $FORK:entrega-5-arquitetura-nuvem \
  --title "[Gesway] - Entrega 5 - Desenho de Arquitetura em Nuvem" --body-file $B/03-doc05.md
wsl gh pr create -R $UP --base main --head $FORK:entrega-6-c4-v12 \
  --title "[Gesway] - Entrega 6 - C4 Model" --body-file $B/04-doc06.md
wsl gh pr create -R $UP --base main --head $FORK:entrega-7-adr \
  --title "[Gesway] - Entrega 7 - Registro de Decisões Arquitetônicas (ADR)" --body-file $B/05-doc07.md
wsl gh pr create -R $UP --base main --head $FORK:entrega-8-sprints \
  --title "[Gesway] - Entrega 8 - Planejamento de Sprints e Tarefas" --body-file $B/06-doc08.md
wsl gh pr create -R $UP --base main --head $FORK:entrega-1-solicitacao-v11 \
  --title "[Gesway] - Entrega 2 - Documento de Solicitação do Sistema (v1.1)" --body-file $B/07-doc01.md
wsl gh pr create -R $UP --base main --head $FORK:entrega-4-mer-v13-historico \
  --title "[Gesway] - Entrega 4 - Modelo Entidade-Relacionamento (MER) v1.4" --body-file $B/08-doc04.md
```

Lembretes: dentro do WSL o comando é só `gh`. Se estiver num terminal Windows, troque o `$B` pelo caminho Windows ou rode tudo via `wsl bash -c '...'`. Depois de abrir os PRs, troque "PR irmão" nas descrições pelos números reais (`wsl gh pr edit <n> -R $UP --body-file ...`).

## 4. Descrições

Cada bloco abaixo está também em `pr-bodies/`, com o mesmo conteúdo.

<!-- BODY 01-doc02 -->
## Entrega

**Documento:** `Projetos/gesway/02-requisitos-funcionais-nao-funcionais.md`
**Versão:** 1.4 — 29/10/2026
**Natureza:** reentrega do Doc. 02, entregue originalmente no PR #5 (v1.3)

## O que mudou desde a versão entregue

### Coluna Módulo alinhada à ADR-003 (Doc. 07)
- O nome `billing-service` deixa de existir. Pagamento, consumo, comanda, reserva direta com PIX e fechamento de caixa passam ao **core-service**, porque a transação que une reserva e pagamento não se divide entre serviços
- Clientes corporativos, orçamentos e contratos (RF-029 a RF-036) e o ViaCEP (RF-045) passam ao **b2b-service**. Até a extração (T-01.6, 5º semestre), essas rotas são servidas pelo `core-service`, com o mesmo contrato

### Requisitos funcionais conferidos contra o código
- **RF-011** — check-in a partir de `PENDING`, para o hóspede sem reserva (*walk-in*)
- **RF-014** — `method` em allowlist (`PIX`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `DINHEIRO`), pagamento ligado à reserva ou à conta, `amount > 0`
- **RF-015** — exclusão de pagamento substituída pelo estorno `POST /payments/:id/void` (só `ADMIN`, motivo obrigatório, só `PAID`, uma vez); `DELETE` responde `405` (ADR-010)

### Requisitos não funcionais
- **RNF-003** — exceção declarada na nuvem: 1 nó `t3.small`, uma réplica por serviço (Doc. 05 v1.2, ADR-004 revista). A meta de 3 réplicas continua demonstrada no Kubernetes local
- **RNF-004** e glossário — "free-tier" substituído por **plano de créditos**
- **RNF-011** — chave privada do JWT RS256 no lugar do `JWT_SECRET` (ADR-006)
- **RNF-012** — *webhook* autenticado por assinatura **ou** token do PSP (Asaas: `asaas-access-token`)
- **RNF-014** — `analytics-service` com banco próprio, alimentado por eventos
- **RNF-028** (novo) — entrega confiável de eventos: *outbox*, idempotência, fila de mensagens mortas, retenção de 7 dias
- **RNF-029** (novo) — monitoramento com Prometheus e Grafana, exigido pelo Termo §5: `/metrics` por serviço (latência por rota, requisições por tenant, métricas do processo) protegido por token, profundidade das filas do RabbitMQ, painel de saúde e alertas provisionados como código, stack acessível na defesa

O Histórico de Revisões (Seção 6) registra cada mudança da versão 1.4.

**Entregue junto com:** Doc. 03 v1.3, Docs. 05, 06 e 07 e Doc. 08 (PRs irmãos), que citam esta versão.

## Checklist
- [x] Alterações restritas a `Projetos/gesway/02-requisitos-funcionais-nao-funcionais.md`
- [x] Versão e data atualizadas no cabeçalho
- [x] Histórico de revisões atualizado
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

<!-- BODY 02-doc03 -->
## Entrega

**Documento:** `Projetos/gesway/03-diagrama-fluxo-de-dados.md`
**Versão:** 1.3 — 29/10/2026
**Natureza:** reentrega do Doc. 03, entregue originalmente no PR #15 (v1.2)

## O que mudou desde a versão entregue

### Armazenamentos e status das entidades
- `PRODUCTS`, `ACCOUNTS` e `ACCOUNT_ITEMS` deixam de aparecer como planejadas no processo 1.0 e no D-001. Estão implementadas, como registra o Doc. 04
- D-001 completado com `RESERVATION_GUESTS`, `CASH_CLOSINGS` e `CASH_CLOSING_LINES` (planejadas) e a tabela técnica `OUTBOX`

### PDF de orçamento no D-005
- O D-005 passa a guardar os PDFs de contrato **e** de orçamento, com download por URL assinada de até 5 minutos (RNF-023 do Doc. 02)
- Atualizados a seta P2→D5 e a entrega ao operador no Nível 1, e os fluxos F-013 e F-020

### Coerência com os demais documentos
- Nota de rastreabilidade (§1): o Doc. 04 §7 e a coluna Módulo do Doc. 02 v1.4 já usam o recorte da ADR-003
- F-016 inclui a categoria de quarto entre os eventos de domínio
- *Webhook* autenticado pela assinatura ou pelo token do PSP (Nível 0, §5.1 e F-006)

O Histórico de Revisões (Seção 8) registra a versão 1.3.

**Entregue junto com:** Doc. 02 v1.4 e Doc. 06 v1.2 (PRs irmãos). O C4 remove a diferença com o DFD que esta versão resolve.

## Checklist
- [x] Alterações restritas a `Projetos/gesway/03-diagrama-fluxo-de-dados.md`
- [x] Versão e data atualizadas no cabeçalho
- [x] Histórico de revisões atualizado
- [x] Diagramas Mermaid conferidos (renderizam sem erro)
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

<!-- BODY 03-doc05 -->
## Entrega

**Documento:** `Projetos/gesway/05-arquitetura-nuvem.md`
**Versão:** 1.2 — 24/10/2026
**Natureza:** primeira entrega do Doc. 05

## Conteúdo

### Arquitetura na AWS (`sa-east-1`), provisionada por Terraform
- **k3s num único EC2 `t3.small`** (servidor único, sem EKS): o *control plane* do EKS custa cerca de US$ 73/mês mesmo parado
- **RDS PostgreSQL 17** (`db.t3.micro`, Single-AZ) em subnet privada, com SSL obrigatório e um *database* e um usuário por serviço (`REVOKE CONNECT ... FROM PUBLIC`)
- **S3** para os PDFs, entregues por URL assinada de 5 minutos, assinada por um papel IAM só de leitura; **ECR** com *push* pelo GitHub Actions via OIDC
- Sem NAT Gateway, ALB ou Route 53: o nginx no cluster é a entrada única, com HTTPS por sslip.io e Let's Encrypt
- Prometheus e Grafana no cluster, acessados por `port-forward`

### Conta de memória e de custo
- Conta de memória do nó com os `requests` reais dos manifests: 1.014 Mi cabem nos cerca de 1.140 MiB alocáveis
- **Plano gratuito de créditos** da AWS (contas a partir de 15/07/2025), com a conta criada perto do 5º semestre: cerca de US$ 0,35 por sessão de 4 h, a preços oficiais de `sa-east-1`
- Ciclo efêmero, com `apply` e `destroy` na mesma sessão, AWS Budgets e nunca o usuário `root`

### Rede e segurança
- Security Groups, `NetworkPolicy` de saída para o RDS só a partir dos serviços (RNF-010), IMDSv2
- *Webhook* do Asaas autenticado pelo token do PSP
- *Overlay* `kustomize` da nuvem; uma réplica por serviço, como exceção consciente ao RNF-003

**Quando a nuvem entra:** pelo Termo de Aceite (§7), o *deploy* em nuvem é do 5º semestre. O documento é normativo e descreve o alvo.

**Entregue junto com:** Doc. 06 v1.2 e Doc. 07 v1.1 (PRs irmãos). A ADR-004 revista registra a mesma decisão de 1 nó `t3.small`.

## Checklist
- [x] Alterações restritas a `Projetos/gesway/05-arquitetura-nuvem.md`
- [x] Versão e data no cabeçalho
- [x] Histórico de revisões (v1.0, v1.1 e v1.2)
- [x] Diagrama Mermaid conferido (renderiza sem erro)
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

<!-- BODY 04-doc06 -->
## Entrega

**Documento:** `Projetos/gesway/06-c4-model.md`
**Versão:** 1.2 — 29/10/2026
**Natureza:** primeira entrega do Doc. 06

## Conteúdo

- **Nível 1 — Contexto:** Recepcionista, Administrador, Garçom e Hóspede; PSP e ViaCEP como sistemas externos
- **Nível 2 — Contêineres:** `app-pms`, nginx, `core-service` (3000), `b2b-service`, `analytics-service` (3001), RabbitMQ, D-001 a D-003 (um banco por serviço) e D-005 (armazenamento de objetos), com protocolo em cada relação
- **Nível 3 — Componentes:** um diagrama por serviço
  - **core-service:** roteador, autenticação e escopo, rotas internas com `X-Internal-Token`, hospedagem com o ciclo de vida da reserva (inclusive o *walk-in*), pagamentos e PIX com *webhook* autenticado por assinatura ou token do PSP, estorno, consumo e publicador do *outbox*
  - **b2b-service:** clientes corporativos, orçamentos, contratos, PDFs e cliente do core
  - **analytics-service:** consumidor idempotente e projeções, inclusive das categorias de quarto
- **ADRs resumidas** (§5) e **tecnologias** (§6), alinhadas ao Doc. 07, inclusive à ADR-004 revista (1 nó `t3.small`, plano de créditos)

Os nomes de entidades externas, processos e armazenamentos são os mesmos do Doc. 03 (DFD).

**Entregue junto com:** Doc. 05 v1.2 e Doc. 07 v1.1 (PRs irmãos), e Doc. 03 v1.3, cuja reentrega resolve a diferença sobre o PDF de orçamento no D-005.

## Checklist
- [x] Alterações restritas a `Projetos/gesway/06-c4-model.md`
- [x] Versão e data no cabeçalho
- [x] Histórico de revisões (v1.0 a v1.2)
- [x] Os 5 diagramas Mermaid conferidos (renderizam sem erro)
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

<!-- BODY 05-doc07 -->
## Entrega

**Documento:** `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md`
**Versão:** 1.1 — 29/10/2026
**Natureza:** primeira entrega do Doc. 07

## Conteúdo

Onze ADRs, cada uma com contexto, decisão, alternativas consideradas (com prós e contras) e consequências:

| ADR | Decisão | Status |
|---|---|---|
| 001 | Node.js 24 + Express 4, ESM, Sequelize 6 | Aceita |
| 002 | PostgreSQL 17: `EXCLUDE USING gist`, multi-tenant por discriminador, UUID, *soft delete* | Aceita |
| 003 | Recorte em `core-service`, `b2b-service` e `analytics-service` por consistência transacional; RabbitMQ com *outbox* | Aceita |
| 004 | AWS: k3s num único EC2 `t3.small`, plano gratuito de créditos (revista em 24/10) | Aceita |
| 005 | Docker + Kubernetes, com Docker Compose de contingência | Aceita |
| 006 | JWT RS256 com o core como único emissor; `X-Internal-Token` | Aceita |
| 007 | Uma reserva por quarto, dentro de um agrupador | Proposta, adiada para o 5º semestre |
| 008 | Integrações externas atrás de interface (PSP e ViaCEP) | Aceita |
| 009 | Módulo de consumo por contas | Aceita, implementada |
| 010 | Lançamento financeiro estornado, nunca apagado | Aceita, implementada |
| 011 | Frontend em SPA React e monorepo | Aceita |

**Destaques da v1.1:** a ADR-004 foi revista para 1 nó `t3.small` no plano de créditos, coerente com o Doc. 05 v1.2. As ADR-009 e ADR-010 foram marcadas como implementadas, conferidas contra o código em 29/10. A ADR-008 registra a autenticidade do *webhook* por assinatura ou token, conforme o provedor.

**Entregue junto com:** Doc. 05 v1.2 e Doc. 06 v1.2 (PRs irmãos).

## Checklist
- [x] Alterações restritas a `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md`
- [x] Versão e data no cabeçalho
- [x] Índice de ADRs e histórico de revisões atualizados
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

<!-- BODY 06-doc08 -->
## Entrega

**Documento:** `Projetos/gesway/08-planejamento-sprints-tarefas.md`
**Versão:** 1.1 — 29/10/2026
**Natureza:** primeira entrega do Doc. 08

## Conteúdo

- **Metodologia:** Kanban por trilha, com cadência semanal (sprint de 1 semana), de 09/09 a 10/12/2026, com congelamento em 24/11
- **Papéis:** três trilhas paralelas, com dono por arquivo compartilhado e dono de cada documento oficial
- **Cronograma:** Sprints 1 a 13 do 4º semestre, com o replanejamento do MVP de 21/10 e o roteiro de demonstração de 7 passos, e o 5º semestre em alto nível. Gantt dos dois semestres
- **Backlog priorizado** (P0 a P3), com estimativa, responsável, sprint planejada e **sprint real com a evidência no git** (PR ou commit)
- **Metas do roteiro** (M1 a M10), cerimônias, DoD, métricas, ferramentas, riscos e ordem de corte

**Entregue junto com:** Doc. 01 v1.1 (PR irmão), que remete aos papéis da Seção 2 deste documento.

## Checklist
- [x] Alterações restritas a `Projetos/gesway/08-planejamento-sprints-tarefas.md`
- [x] Versão no cabeçalho
- [x] Histórico de revisões (v1.0 e v1.1)
- [x] Gantts Mermaid conferidos (renderizam sem erro)
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

<!-- BODY 07-doc01 -->
## Entrega

**Documento:** `Projetos/gesway/01-solicitacao-do-sistema.md`
**Versão:** 1.1 — 29/10/2026
**Natureza:** reentrega do Doc. 01, entregue originalmente no PR #3 (v1.0)

## O que mudou desde a versão entregue

Mudança mínima, sem reescrita:
- **§3.3** — a justificativa de microsserviços segue o recorte da ADR-003: núcleo com reservas, hospedagem e pagamentos; B2B como domínio próprio; indicadores somente leitura
- **§5.1** — *walk-in* na máquina de estados da reserva: de pendente direto ao check-in, liberado em 24/10/2026. Também uma nota de que as marcações de status são de 23/08/2026, com o estado atual no Doc. 08
- **§8** — nota sobre a evolução dos papéis e a distribuição dos documentos oficiais, coerente com o Doc. 08 v1.1, Seção 2
- **§7** — premissa da conta AWS e restrição de orçamento alinhadas ao plano gratuito de créditos e ao ciclo efêmero (infraestrutura criada e destruída a cada sessão) do Doc. 05 v1.2 e da ADR-004
- **§4** — RevPAR e camareira retirados do valor agregado, por estarem fora do escopo (Doc. 02 e §5.2)

**Entregue junto com:** Doc. 08 v1.1 (PR irmão).

## Checklist
- [x] Alterações restritas a `Projetos/gesway/01-solicitacao-do-sistema.md`
- [x] Versão e data atualizadas no cabeçalho
- [x] Histórico de revisões atualizado
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

<!-- BODY 08-doc04 -->
## Entrega

**Documento:** `Projetos/gesway/04-modelo-entidade-relacionamento.md`
**Versão:** 1.4 — 30/10/2026
**Natureza:** revisão do Doc. 04, entregue por último no PR #18 (v1.3)

## O que mudou desde a versão entregue

### Registro de 29/10 (sem nova versão, conforme a Seção 8)
- `PAYMENTS`: `account_id` (19/10) e o estorno `VOIDED` com `void_reason`, `voided_by` e `voided_at` (24/10) perdem a marca de planejado
- `method` descrito com a allowlist da aplicação
- §10.4: ADR-007 adiada para o 5º semestre

### Versão 1.4 (exigida pela Seção 8 por alterar entidades implementadas)
Cada entidade implementada foi conferida coluna a coluna, com `CHECK`, índices e *triggers*, contra `db/schema.sql`, `applyDbConstraints.js` e os *models* da `develop`:
- `ACCOUNTS`: `closed_room_charges`
- `ACCOUNT_ITEMS`: `origin` e `consumed_at`; `created_by` passa a aceitar nulo só no consumo migrado
- `PAYMENTS`: regra "pago tem data" e índice único parcial global em `provider_charge_id`
- `CONSUMPTIONS`: tabela legada, sem escrita; migração para `ACCOUNT_ITEMS` com o mesmo `id`
- Índices parciais com a ordem real das colunas; diagrama do Bloco 2 atualizado; exemplo de rastreabilidade do RF-010 igual ao título do Doc. 02

O Histórico de Revisões (Seção 9) registra o que entrou em 29/10 e na versão 1.4.

## Checklist
- [x] Alterações restritas a `Projetos/gesway/04-modelo-entidade-relacionamento.md`
- [x] Versão e data atualizadas no cabeçalho
- [x] Histórico de revisões atualizado
- [x] Diagramas Mermaid conferidos (renderizam sem erro)
- [x] Nenhum arquivo fora da pasta do grupo alterado

🤖 Generated with [Claude Code](https://claude.com/claude-code)
<!-- END -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
