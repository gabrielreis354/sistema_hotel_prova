# Retomada — Entrega dos documentos e do MVP (até 10/12/2026)

> **Leia isto primeiro ao retomar uma sessão.** Atualize ao fim de cada checkpoint.
> **Último checkpoint:** 29/10/2026 (orquestrador, sessão do Gabriel)
> **Fontes:**
> - `docs/PLANO_MVP_ATE_10DEZ2026.md`
> - `docs/PAINEL_DE_ANDAMENTO_MVP.md`
> - `docs/auditoria_coerencia_documentos_28out2026.md`
> - `docs/delegacoes/resposta_gabriel_parecer_sirlande_28out2026.md`
> - `docs/retomada/ORQUESTRADOR.md`

## 1. Decisões em vigor (não reabrir)

| Data | Decisão |
|---|---|
| 21/10 | Nuvem e Terraform no 5º semestre; ADR-007 adiada; retenção do outbox em 7 dias |
| 24/10 | Walk-in `PENDING → CHECKED_IN` liberado no domínio |
| 24/10 | Alvo de nuvem: 1× t3.small em plano de créditos, com recursos destruídos após cada sessão |
| 28/10 | Parecer do Sirlande respondido: tabela de metas M1 a M10 aceita e ordem de integração confirmada |
| **29/10** | **Os 8 documentos são do grupo.** Qualquer um edita direto no fork, em branch por entrega a partir de `upstream/main`, com crédito ao autor anterior no Histórico |

**Regras fixas:**
- PR ao professor e push para `upstream` só com autorização explícita do Gabriel.
- Título do PR: `[Gesway] - Entrega N - Descrição`, com N igual ao número do encontro no README.
- O PR só toca `Projetos/gesway/`.
- Merge na `develop` só com veredito do qa-redteam e autorização do Gabriel.

## 2. Documentos oficiais — estado em 29/10

Fork: `C:\Users\gabri\unifaat_4sem\UniFAAT-projeto-experimental-2027-1` (`origin` é o fork do Gabriel, `upstream` é o professor).

| Doc | Versão entregue | Branch no fork | Situação 29/10 | Falta |
|---|---|---|---|---|
| 01 Solicitação | v1.0 (23/08) | `entrega-1-solicitacao-v11` @ `99fef8f` | **Pronto (v1.1)** | Entregar junto com o Doc 08 ou depois dele, porque o Doc 01 cita o 08 |
| 02 Requisitos | v1.3 (09/09) | `entrega-2-requisitos-v14` @ `2fde2bb` | **Pronto (v1.4)**: todos os 🔴, 🟡 e 🟢; RF-014 corrigido para amount > 0 e account_id, como no código | Reentrega obrigatória |
| 03 DFD | v1.2 (09/10) | `entrega-3-dfd-v13` @ `6f5fcbd` | **Pronto (v1.3)**: revisão do grupo sobre a v1.2 do Sirlande | Reentrega obrigatória. Entregar junto com o 06 ou antes dele. Mermaid não renderizado (só os rótulos mudaram): renderizar antes do PR |
| 04 MER | v1.3 (15/10) | `entrega-4-mer-v13-historico` @ `16b0d7f` | **Pronto (v1.4)**: varredura coluna a coluna contra o schema da develop 093d14b, sem divergência | As citações das ADR-007 e 010 dependem da entrega do Doc 07 |
| 05 Arquitetura em nuvem | — (v1.1 em 19/10) | `entrega-5-arquitetura-nuvem` @ `ff69a36` | **Pronto (v1.2)**: 1× t3.small, cerca de US$ 0,35 por sessão de 4 h, conta de memória com folga de cerca de 125 MiB | Decidir sobre o diagrama com ícones oficiais da AWS (precisa baixar o pacote). Confirmar no console se ECR e RDS estão disponíveis no plano gratuito |
| 06 C4 | — (v1.1 em 19/10) | `entrega-6-c4` @ `449a3f2` | **Pronto (v1.2)** | A branch parte de um upstream antigo (79bcce2): antes do PR, recriar a partir de `upstream/main`. Renderizar o Mermaid |
| 07 ADR | — | fork `entrega-7-adr` @ `fb11fc6` (hotel `docs/doc07-adr` @ `070c339`, PR #97) | **Pronto (v1.1)**: 11 ADRs; Termo §6 item 7 atendido; ADR-004 bate com o Doc 05 v1.2 | Nada. O PR #97 pode ser fechado ou mergeado depois da entrega ao professor |
| 08 Sprints | — (v1.0 sugestão em 07/10) | `entrega-8-sprints` @ `4e5b557` | **Pronto (v1.1)** | Revisar o registro da S8 e a situação das metas depois de 03/11 |

**30/10: pacote de entrega montado.** As 16 contradições foram resolvidas, os 15 diagramas Mermaid renderizam e cada branch parte do `upstream/main` atual, tocando só o seu arquivo (o Doc 06 passou para `entrega-6-c4-v12`). Hashes finais:
- 01 `866dc91`
- 02 `3933978`
- 03 `6f5fcbd`
- 04 `885d2b4`
- 05 `ff69a36`
- 06 `51bf706`
- 07 `fb11fc6`
- 08 `381464e`

Plano de PRs e descrições prontas: `docs/entrega-documentos/`. Um PR por documento, todos na mesma rodada.

Feito: RNF-029 (monitoramento, Termo §5) no Doc 02 e premissas do Doc 01 alinhadas ao Doc 05 (plano em `1a5c038`).

Decisões do Gabriel:
- diagrama do Doc 05 com ícones oficiais da AWS;
- PR do Doc 08 só depois de 03/11, por causa das pendências datadas.

Pacote de PRs ao professor (ordem recomendada):
1. **05 + 06 + 07**, juntos e coerentes com a ADR-004.
2. **08.**
3. **Reentregas 02 e 03.**
4. **01 e 04**, como revisão final.

Antes de cada PR, conferir o documento contra:
- o Termo de Requisitos (§1 a §8);
- os critérios C1 a C10 da banca.

## 3. Integração do MVP — estado em 29/10

| Ordem | Branch | Meta | Data | Situação | Próximo passo |
|---|---|---|---|---|---|
| 1 | `fix/tenant-fk-validation` @ `2add775` | segurança | 29/10 | **Pronta.** Todas as ressalvas das 3 rodadas de qa-redteam corrigidas; D1 com LOCK.KEY_SHARE e nova tentativa em deadlock (`deadlockRetry.js`); 1096 testes, 87% das linhas; merge limpo com a develop | Autorização do Gabriel → PR e merge na develop. Base contaminada (pendência 1 de 24/10): rodar a consulta em staging |
| 2 | `feature/analytics-service` @ `c854f60` | M7-a | 29/10 | 🟡-A2 corrigido: a pausa drena as mensagens em andamento e fecha o canal antes da conexão; 31/31 na DLQ com RabbitMQ real; analytics 95 testes, core 1006; catálogo 1.1.3 | Reauditoria delta 3 (`f3789e8`): APROVADO COM RESSALVAS. A correção do 🟡-A3 (drenagem da pausa sem prazo curto + statement_timeout/pool.acquire no analytics) e do 🟢-E (prazo no cancel/close do stop) está em curso → verificação → autorização → merge. **Decisão L-1 aberta** (consumo interno sem evento). `delivery-limit` explícito é repasse para o Weslley |
| 3 | `feature/t051-quartos-categorias` @ `6501a9a` | M1 | 30/10 | develop integrada (989 testes, frontend 111/111, build ok); rotas isoladas em `routes/roomsRoutes.tsx` | Depois do merge da 1: segundo merge da develop + `pnpm gen:api` (passo a passo na retomada da branch) |
| 4 | `feature/t052-reservas` @ `e3b54ea` | M2, M5-a | 30/10 | Ressalvas fechadas: backend 998 testes, frontend 115, E2E 49/0. Endpoint novo `GET /guests?q=&limit=`; estorno fora do comprovante; conta em linha do tempo com teste | Depois da 3: merge da develop + `pnpm gen:api` → **qa-redteam delta**, por causa do endpoint novo → merge |

**Depois das 4 integrações:**
- PR de release `develop → main` até 03/11 (o Sirlande aprova).
- H.3, a partir de 30/10, com 2 ou 3 indicadores próprios.
- T-05.3 (painel Hoje), a partir de 31/10.

## 4. Pendências de decisão

**Com o Gabriel:**
- PRs #97 e #99 mergeados pelo Gabriel em 29/10. Os commits de retomada posteriores a 093d14b ainda precisam de PR.
- Merges das integrações.
- PRs ao professor.

**Na reunião de 03/11:**
- Decisões 5 a 7 do parecer; as propostas estão na resposta.
- Escopo do Weslley, a confirmar até 04/11.
- Exposição de métricas por pessoa no Doc 08.

**Outras:**
- CLEANING → MAINTENANCE.
- Aval ao §5.3 do catálogo v1.1.
- Datas dos encontros com o professor.

**Lembretes:**
- O Weslley confirma a revogação da chave de produção do Asaas.
- SPECs defasadas a corrigir:
  - SPEC-01 (T-01.2);
  - SPEC-05 (T-05.1 e T-05.2);
  - SPEC-06 (T-06.13);
  - SPEC-03 (Asaas no lugar do Mercado Pago).

## 5. Como retomar

1. `bash scripts/estado.sh` na raiz do hotel. No fork: `git fetch --all && git branch -r`.
2. Para cada linha das tabelas §2 e §3, comparar a branch remota com a situação descrita aqui.
3. O retomado de cada branch fica em `docs/retomada/<branch>.md`, na própria branch.
4. Retomar os agentes por SendMessage, nunca abrir duplicatas. O mapa de agentes está no scratchpad do orquestrador.
5. Ao terminar um checkpoint, atualizar este arquivo e o `ORQUESTRADOR.md`, depois commit e push.
