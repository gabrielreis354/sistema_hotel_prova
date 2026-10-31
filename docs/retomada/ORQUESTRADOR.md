# Retomada — Orquestrador (sessão do Gabriel)

**Atualizado:** 24/10/2026 (após o merge do PR #100) · **Por:** orquestrador
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
| Repasses (conta na troca/remoção de quarto; webhook FAILED) | `fix/repasses-gabriel-out` | `/home/gabri/wt-repasses` | Reauditoria delta aprovada; fechando 3 🟢 (deadlock 40P01 na remoção concorrente, rótulo da conta movida, teste do filtro de diária) | PR. Avisar a Sirlande |
| T-05.1 — quartos e categorias | `feature/t051-quartos-categorias` | `/home/gabri/wt-t051` | Reauditoria delta aprovada com ressalvas; corrigindo 2 🟡 (snapshot da edição; mensagens pelo `code` de erro combinado com a fk) | PR — **só depois da `fix/tenant-fk-validation`** e antes da T-05.2 |
| T-05.2 — reservas | `feature/t052-reservas` | `/home/gabri/wt-t052` | Ressalvas corrigidas e **PENDING → CHECKED_IN** aplicado no domínio; **em reauditoria delta** | Depois do merge da T-05.1: merge de develop, promover `Money`/`ErrorState`/badge para `packages/ui`, PR |
| T-05.5 — comanda (Fase A) | `feature/t055-comanda` | — | Delegação pronta para a **Sirlande** | Confirmar com ela o início |

**Ordem de merge recomendada:** `fix/tenant-fk-validation` (segurança) → `fix/repasses-gabriel-out` →
`feature/analytics-service` → `feature/t051-quartos-categorias` →
`feature/t052-reservas`. Depois de cada merge, quem vem a seguir faz merge da `develop` e regenera o
`api-client` se o Swagger mudou.

## Mergeados nesta rodada
- **#100** — T-06.13 estorno `VOIDED` (24/10). Pós-merge: regenerar o `api-client`; seed com `method = 'CARTAO'` fora da allowlist (decidir); marcar `docs/retomada/fix-t0613-estorno-pagamento.md` como ENCERRADA.

## Contrato de erros (24/10)
Quartos e categorias devolvem `code` estável: `CATEGORY_NOT_FOUND`, `ROOM_NUMBER_TAKEN`, `ROOM_STATUS_TRANSITION_NOT_ALLOWED`, `ROOM_IN_USE`, `CATEGORY_IN_USE`, `CATEGORY_NAME_TAKEN`, `INVALID_INPUT` (com `field`). O frontend mapeia a mensagem pelo `code`, nunca pelo status HTTP.

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

## Checkpoint 28/10/2026 — parecer do Sirlande

- Parecer do Sirlande (28/10) respondido em docs/delegacoes/resposta_gabriel_parecer_sirlande_28out2026.md; decisão final no ponto de controle de 03/11.
- Integração confirmada: 29/10 fix/tenant-fk-validation e feature/analytics-service; 30/10 t051 e depois t052 (regenerar api-client após cada merge). As 4 branches estão recebendo merge da develop (109 commits de T-04.5/6/7 e T-05.5).
- Auditoria de coerência dos 8 docs em docs/auditoria_coerencia_documentos_28out2026.md (16 contradições). Reentregas: Doc 02 v1.4 e Doc 03 v1.3 (sugestão para o Sirlande); 05 v1.2, 06 v1.2 e 07 v1.1 num pacote; 08 v1.1.
- Próximas frentes do Gabriel: H.3 a partir de 30/10 (2 ou 3 indicadores próprios); T-05.3 a partir de 31/10; PR de release até 03/11.
