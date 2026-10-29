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
| 01 Solicitação | v1.0 (23/08) | `entrega-1-solicitacao-v11` | Em redação (agente) | Nota dos checkboxes §5.1, walk-in, nota de papéis §8 → v1.1 |
| 02 Requisitos | v1.3 (09/09) | `entrega-2-requisitos-v14` | Em redação (agente) | Os 🔴 e 🟡 da auditoria. **Reentrega obrigatória** |
| 03 DFD | v1.2 (09/10) | `entrega-3-dfd-v13` | Em redação (agente) | 🔷 indevidos, PDF de orçamento no D-005, D-001 completo. **Reentrega obrigatória** |
| 04 MER | v1.3 (15/10) | `entrega-4-mer-v13-historico` | Em redação (agente) | Retirar 🔷 de payments/VOIDED, §10.4 e allowlist. Conferir as tabelas novas do schema |
| 05 Arquitetura em nuvem | — (v1.1 em 19/10) | `entrega-5-arquitetura-nuvem` @ `ff69a36` | **Pronto (v1.2)**: 1× t3.small, cerca de US$ 0,35 por sessão de 4 h, conta de memória com folga de cerca de 125 MiB | Decidir sobre o diagrama com ícones oficiais da AWS (precisa baixar o pacote). Confirmar no console se ECR e RDS estão disponíveis no plano gratuito |
| 06 C4 | — (v1.1 em 19/10) | `entrega-6-c4` | Em redação (agente) | v1.2: walk-in, token do PSP, §5 #5, porta 3001, categorias |
| 07 ADR | — | hotel `docs/doc07-adr` @ `98e8213` (PR #97) → fork `entrega-7-adr` | v1.1 pronta no hotel; transcrição para o fork em curso (agente) | Conferir contra os critérios do Termo depois da transcrição |
| 08 Sprints | — (v1.0 sugestão em 07/10) | `entrega-8-sprints` @ `4e5b557` | **Pronto (v1.1)** | Revisar o registro da S8 e a situação das metas depois de 03/11 |

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
| 1 | `fix/tenant-fk-validation` @ `02ab6f4` | segurança | 29/10 | develop integrada, 1054 testes verdes, linhas 87% | **qa-redteam em curso** → autorização → merge |
| 2 | `feature/analytics-service` @ `f09af9d` | M7-a | 29/10 | develop integrada sem conflito; analytics com 84 testes (95% de linhas), core com 1006; catálogo 1.1.1 com `payment.deleted` corrigido | Veredito da reauditoria → merge. **Decisão L-1 aberta:** o consumo interno (T-04.7) não tem evento no catálogo |
| 3 | `feature/t051-quartos-categorias` @ `6501a9a` | M1 | 30/10 | develop integrada (989 testes, frontend 111/111, build ok); rotas isoladas em `routes/roomsRoutes.tsx` | Depois do merge da 1: segundo merge da develop + `pnpm gen:api` (passo a passo na retomada da branch) |
| 4 | `feature/t052-reservas` | M2, M5-a | 30/10 | Fechando as ressalvas e recebendo a develop | Depois da 3: merge da develop + `pnpm gen:api` |

**Depois das 4 integrações:**
- PR de release `develop → main` até 03/11 (o Sirlande aprova).
- H.3, a partir de 30/10, com 2 ou 3 indicadores próprios.
- T-05.3 (painel Hoje), a partir de 31/10.

## 4. Pendências de decisão

**Com o Gabriel:**
- Merge do PR #99, aberto desde 21/10.
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
