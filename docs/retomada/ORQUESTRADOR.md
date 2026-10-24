# Retomada — Orquestrador (sessão do Gabriel)

**Atualizado:** 24/10/2026 · **Por:** orquestrador
**Contexto completo:** [`../PAINEL_DE_ANDAMENTO_MVP.md`](../PAINEL_DE_ANDAMENTO_MVP.md) (estado e fila) e
[`../PLANO_MVP_ATE_10DEZ2026.md`](../PLANO_MVP_ATE_10DEZ2026.md) (estratégia até 10/12).

> Ao retomar: leia este arquivo, depois rode `git fetch --all` e confira cada branch abaixo com
> `git log origin/develop..origin/<branch>`. O arquivo `docs/retomada/<branch>.md` de cada frente,
> na própria branch, diz onde o agente parou.

---

## Frentes em andamento

| Frente | Branch | Worktree | Etapa atual | Próximo passo do orquestrador |
|---|---|---|---|---|
| 🔴 Vazamento entre hotéis por FK do corpo (R-1) + R-2 a R-6 de quartos/categorias | `fix/tenant-fk-validation` | `/home/gabri/wt-fk-tenant` · PG 5451 | Implementação + varredura de todos os controllers | qa-redteam → PR com prioridade máxima. Avisar a Sirlande (área dela) |
| H.2 — `analytics-service` | `feature/analytics-service` | `/home/gabri/wt-h2-analytics` · PG 5441 · RabbitMQ 5682 | Corrigindo ressalvas do qa-redteam (queda do broker, `lock_timeout` da carga inicial, banco fora → DLQ, nome em branco, catálogo §6/§4.6) | Reauditoria delta → PR → H.3 |
| T-06.13 — estorno `VOIDED` | `fix/t0613-estorno-pagamento` | `/home/gabri/wt-t0613` | Rodada 2 commitada; **em reauditoria delta** | Se aprovada, PR |
| Repasses (conta na troca/remoção de quarto; webhook FAILED) | `fix/repasses-gabriel-out` | `/home/gabri/wt-repasses` | Rodada 2 commitada (contas movidas para o quarto principal); **em reauditoria delta** | Se aprovada, PR. Avisar a Sirlande |
| T-05.1 — quartos e categorias | `feature/t051-quartos-categorias` | `/home/gabri/wt-t051` | Aprovada com ressalvas; corrigindo 3 🟡 (status reenviado na edição, `as never`, 409 de categoria em uso) | PR — **entra antes da T-05.2** |
| T-05.2 — reservas | `feature/t052-reservas` | `/home/gabri/wt-t052` | Aprovada com ressalvas; corrigindo 🟡-2 a 🟡-6 e aplicando **PENDING → CHECKED_IN** no domínio | Depois do merge da T-05.1: merge de develop, promover `Money`/`ErrorState`/badge para `packages/ui`, PR |
| T-05.5 — comanda (Fase A) | `feature/t055-comanda` | — | Delegação pronta para a **Sirlande** | Confirmar com ela o início |

**Ordem de merge recomendada:** `fix/tenant-fk-validation` (segurança) → `fix/repasses-gabriel-out` →
`fix/t0613-estorno-pagamento` → `feature/analytics-service` → `feature/t051-quartos-categorias` →
`feature/t052-reservas`. Depois de cada merge, quem vem a seguir faz merge da `develop` e regenera o
`api-client` se o Swagger mudou.

## PRs abertos
- **#97** — Doc 07 v1.0 (11 ADRs; ADR-007 adiada; ADR-008 com Asaas)
- **#99** — decisões de 21/10, delegação da T-05.5, painel, plano e esta pasta de retomada

## Decisões tomadas (registradas)
| Data | Decisão |
|---|---|
| 24/10 | `PENDING → CHECKED_IN` liberado (walk-in), domínio alinhado ao backend; `CLAUDE.md` §3 atualizado |
| 21/10 | ADR-007 adiada para o 5º semestre · retenção do outbox em 7 dias · PR #98 (`develop → main`) confirmado |
| 21/10 | H.2: carga inicial emite `*.deleted` para excluídos; lock de tabela na carga; banco do analytics em container próprio; `reservation_id` nulo aceito; 401 por ~1 s após cadastro de hotel |

## Decisões pendentes do Gabriel
- [ ] Weslley sai da nuvem → T-05.6 (financeiro) e T-01.5 (CI por serviço) — recomendado
- [ ] Docs 05, 06 e 07 num PR só ao professor — recomendado; **datas dos encontros**

## Pendências com outras pessoas
- **Weslley:** data de criação da conta AWS e 1 nó × 2 nós; confirmar revogação da chave de produção do Asaas no painel; repasses de 19/10 (migrate antes/depois do rollout) e 23/10 (CI só roda o core; `x-dead-letter-strategy` da fila quorum); revisão do `docker-compose.yml` da H.2.
- **Sirlande:** T-05.5 comanda; saber das mudanças em `accounts` (troca/remoção de quarto move contas; 404 no lançamento concorrente) e em quartos/categorias (R-1 a R-6).
- **Boletim para o time:** https://claude.ai/artifact/BgfsRNiMoqDujQBZMthHiX (atualizar a cada entrega).

## Próxima fila (depois das frentes acima)
H.3 (cutover do analytics) · T-05.3 painel Hoje · T-05.6 financeiro · T-04.5/T-04.6a/T-04.7 · Doc 05 com a auditoria · entrega dos Docs 05/06/07. Prompts prontos no painel, §8.
