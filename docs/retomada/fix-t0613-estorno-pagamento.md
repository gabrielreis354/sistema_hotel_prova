# Retomada — T-06.13 estorno de pagamento (fix/t0613-estorno-pagamento)

**Atualizado:** 24/10/2026 (fim da rodada) · **Por:** agente executor (Claude Code, orquestrado pelo Gabriel)
**Worktree:** /home/gabri/wt-t0613 · **Portas:** PG 5442
**Containers:** pg-t0613 (subir de novo com: `docker run --rm -d --name pg-t0613 -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5442:5432 postgres:17`)

## Objetivo
SPEC-06 T-06.13 (CA-06.13.a a i): `VOIDED` no lugar da exclusão de pagamento. Delegação de 21/10 + ressalvas
do qa-redteam (`docs/qa/redteam_t0613-estorno-pagamento_21out2026.md`) e da reauditoria delta
(`docs/qa/redteam_t0613-estorno-pagamento_delta_21out2026.md`). Sem PR nem merge: o Gabriel abre.

## Onde estou
- Último commit: docs(historico) da reauditoria delta, depois de ad191fc (com push: sim)
- Passo atual: nenhum — os 3 🟢 da reauditoria delta estão fechados; aguardando o PR (Gabriel)
- Próximo passo: PR (não abrir sem ordem); no merge, remover este arquivo ou marcar ENCERRADA

## Feito
- [x] RED da T-06.13 — 07277f4
- [x] GREEN (void, 405, PUT só ADMIN, CHECKs, analytics, bill) — c1cb04b
- [x] Swagger — 9147c82 · catálogo/ARQ/SPEC-06 — 5b67b84 · relatório — a3302e9
- [x] qa-redteam: APROVADO COM RESSALVAS — c191eb6
- [x] RED/GREEN das ressalvas (🟡-1 paid_at, 🟢-1 method/paid_at, 🟢-2 testes, 🟢-4 comentário) — 71a108e, 71c829d, 0b6117e
- [x] reauditoria delta: aprovada com 3 🟢 — 93b1b36

## Falta (nada desta rodada)
- [x] RED dos 3 🟢 do delta — 63ab261
- [x] GREEN dos 3 🟢 do delta — ad191fc
- [x] suíte completa (888 passed, 1 skipped; statements 83,83%) + qa_checks idêntico ao da develop; relatório (3ª entrada); pg-t0613 removido

## Decisões tomadas nesta frente
- 21/10 — DELETE atrás do ADMIN (RECEPTIONIST 403, ADMIN 405), conforme a delegação
- 21/10 — PUT só em PAID manual; valor não muda (estorno + novo lançamento)
- 21/10 — `unpaid`/`no_show_risk` contam só PAID (D-3, 1ª parte); "saldo > 0" fica para a T-01.4
- 21/10 — CHECK `payments_paid_has_paid_at` NOT VALID; sem CHECK de `method` no banco (seed usa 'CARTAO')
- 21/10 — cliente tipado do frontend regenerado só depois do merge (coordenador)

## Bloqueios e perguntas abertas
- Seed grava `method = 'CARTAO'`, fora da allowlist: decidir com o dono do seed

## Comandos úteis desta frente
Scripts no scratchpad da sessão (`t0613_*.sh`), rodados com `MSYS_NO_PATHCONV=1 wsl bash /mnt/c/...`:
- suíte: `cd services/core-service && source ~/.nvm/nvm.sh && nvm use 24 && npx vitest run --coverage`
  (`.env.test` com `POSTGRES_PORT=5442`)
- qa: `bash scripts/qa_checks.sh` (da raiz)
