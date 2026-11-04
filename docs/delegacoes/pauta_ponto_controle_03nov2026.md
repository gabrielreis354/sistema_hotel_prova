# Pauta — Ponto de controle de 03/11/2026

> **Preparada por:** Gabriel, em 02/11/2026
> **Base:** parecer do Sirlande (28/10), resposta do Gabriel (`docs/delegacoes/resposta_gabriel_parecer_sirlande_28out2026.md`) e estado da `origin/develop` em `fbe086d`
> **Objetivo:** fechar as 7 decisões do parecer e conferir as metas M1 a M10 contra o que já entrou

## 1. O que entrou na develop desde o parecer (28/10 → 02/11)

| Data | Entrega | Quem | Meta |
|---|---|---|---|
| 29/10 | PRs #97 (Doc 07 v1.1) e #99 (plano, painel, resposta ao parecer) | Gabriel | docs |
| 30/10 | Política do RabbitMQ, DLQ sem limite, seed do `start.sh` e painel do RabbitMQ no Grafana | Weslley | M8 / CA-01.4.f |
| 31/10 | **PR #104**: vazamento de FK entre hotéis fechado (R-1 a R-6) | Gabriel | segurança |
| 31/10 | T-05.6: indicadores do gerente (CA-05.6.b e c) | Weslley | M7-b (tela) |
| 31/10 | Compose com Asaas, SPEC-03 com Asaas e **CI por serviço (T-01.5)** | Weslley | M6 / M8 |
| 31/10 | **PR #105**: analytics-service (H.2) | Gabriel | **M7-a ✅** |

A integração atrasada que o parecer apontou (fk e analytics) está fechada. Nesse período, todas as entregas do Weslley foram mergeadas com qa-redteam.

## 2. Metas M1 a M10 em 02/11

| Meta | O quê | Dono | Data | Situação |
|---|---|---|---|---|
| M1 | Quartos e categorias (t051) | Gabriel | 30/10 | 🟡 **Pronta**, com reauditoria APROVADO; falta a autorização do PR |
| M2 | Reservas e walk-in (t052) | Gabriel | 30/10 | 🟡 develop integrada, E2E 54/0; reauditoria curta em curso |
| M3 | Comanda P2 | Sirlande | 17/11 | Sirlande informa |
| M4 | Painel Hoje (T-05.3) | Gabriel | 10/11 | 🔲 Começa depois da M2. Inclui a barra inferior do celular, que tem 7 itens e os rótulos se encostam |
| M5-a | Conta em linha do tempo | Gabriel | 30/10 | 🟡 Dentro da t052, com teste |
| M5-b | Pagamento no check-out | Sirlande | 07/11 | Sirlande informa. O Gabriel revisa a tela antes de 07/11 |
| M5-c | Estorno (backend) | Sirlande | 10/11 | Sirlande informa |
| M6 | PIX | Weslley | 17/11 | Compose com Asaas entrou em 31/10 |
| M7-a | analytics-service (H.2) | Gabriel | 29/10 | ✅ PR #105 |
| M7-b | H.3 (indicadores pelo analytics) | Gabriel | 14/11 | 🟡 Implementada em `feature/analytics-cutover`; qa-redteam em curso. A tela da T-05.6 funciona pelo nginx |
| M8 | Seed e compose | Sirlande e Weslley | 17/11 | Seed do `start.sh` entrou em 30/10 |
| M9 | Congelamento e ensaio | todos | 24/11 | — |
| M10 | Release `develop → main` | Gabriel, aprovação do Sirlande | 01/12 | — |

**Documentos oficiais:**
- Os 8 estão revisados no fork, cada um na sua branch.
- As 16 contradições entre documentos foram resolvidas e os 15 diagramas renderizam.
- O plano de PRs está em `docs/entrega-documentos/PLANO_DE_PRS.md`.
- Os PRs ao professor esperam a autorização do Gabriel.
- O Doc 08 entra só depois desta reunião.

## 3. Decisões do parecer: propostas para fechar hoje

| # | Decisão | Proposta |
|---|---|---|
| 1 | Tabela de metas como acompanhamento | Aceitar (já em uso, §2) |
| 2 | M5-b, M5-c e M8 com o Sirlande | Aprovar |
| 3 | Ordem e datas de integração | Fk e analytics feitas em 31/10. A t051 entra com a autorização do PR; a t052 logo depois |
| 4 | Escopo do Weslley | T-05.6 b/c e T-01.5 já entregues. Confirmar M6 (PIX) e o CA-05.6.d |
| 5 | Passo 6: reserva direta do hóspede | Demonstrar pela API pública (Swagger ou `test_rotas.sh`). O app `booking` fica para o pós-TCC |
| 6 | Fechamento só no balcão? Conta INTERNAL com item faturável? | Fechamento só no balcão no MVP. INTERNAL mantém o comportamento atual: nunca é receita (RN-006) |
| 7 | Testes `e2e/` com Playwright no CI | Sim, como job não bloqueante até 24/11, cobrindo o roteiro de 7 passos. Os roteiros da t052 e da H.3 já existem e falta só a pasta no repo. Os workflows são do Weslley |

## 4. Decisões novas desde o parecer

| Tema | Proposta |
|---|---|
| **L-1**: `/analytics/internal-consumption` (T-04.7) lê contas, que não emitem evento | Manter no core no MVP; o nginx já tem a exceção na H.3. Eventos de conta ficam para o catálogo do 5º semestre |
| Contrato da H.3 | Dinheiro como string com 2 casas; `unpaid` com `guest_id`, `paid` e `balance`; 400 para entrada inválida |
| Quarto: CLEANING → MAINTENANCE | Decidir: hoje é proibido, e isso bloqueia a camareira que encontra um defeito durante a limpeza |
| Diagrama do Doc 05 | Ícones oficiais da AWS (o Termo §6.5 diz "diagrama oficial") ou manter o Mermaid |
| Doc 08: métrica por pessoa | O grupo decide se o documento expõe alguma métrica individual |
| Revisão dos documentos 03, 04 e 08 pelo grupo | O Sirlande e o Weslley conferem as revisões feitas nos documentos que eram deles |

## 5. Lembretes

- **Weslley:**
  - confirmar no painel do Asaas a revogação da chave de produção;
  - revisar a infra da H.3 (nginx e k8s do analytics, marcados com `[revisão do Weslley]`).
- **Sirlande:**
  - registrar como D-xx na SPEC-04 as mudanças de `accounts`, quartos e categorias do #104;
  - repasse: `GET /rooms/:id` e `GET /room-categories/:id` com id não-UUID respondem 500.
- **Staging:** rodar a consulta que procura dados gravados com categoria de outro hotel antes do #104.
