# Retomada — validação de tenant nas FKs do corpo + R-2 a R-6 (fix/tenant-fk-validation)

**Atualizado:** 24/10/2026 · **Por:** agente executor (trilha Gabriel)
**Worktree:** /home/gabri/wt-fk-tenant · **Portas:** PG 5451
**Containers:** pg-fk (subir de novo com: `docker run --rm -d --name pg-fk -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5451:5432 postgres:17`)

## Objetivo
Fechar o vazamento entre hotéis por chave estrangeira vinda do corpo (R-1 do qa-redteam de
21/10), varrer a mesma classe de falha em todos os controllers e tratar R-2 a R-6 de quartos e
categorias (repasse `docs/qa/repasses/para_sirlande_21102026.md`). Sem PR e sem merge.

## Onde estou
- Último commit: 02c4473 fix(rooms): quarto so aceita categoria do proprio hotel (R-1) (push: sim)
- Passo atual: varredura dos controllers concluída na leitura (só o UpdateRoom falhava)
- Próximo passo: testes de regressão por endpoint da varredura em `tests/tenant-fk-isolation.test.js`, depois R-2 a R-6 (RED → GREEN)

## Feito
- [x] RED do R-1 — 5c7692c
- [x] R-1: `findInTenant` + Create/UpdateRoom — 02c4473
- [x] Baseline: 39 arquivos, 836 passam, 1 skip, cobertura 83.4% statements

## Falta
- [ ] Testes de regressão de isolamento das FKs já corretas sem teste (reservas, add room, pagamento por reserva, contrato, assinatura)
- [ ] R-2 andar 0 · R-3 status · R-4 categoria em uso 409 · R-5 diária/capacidade 400 · R-6 excluir quarto ocupado 409
- [ ] Swagger dos novos 400/404/409
- [ ] Relatório `docs/historico_sessao/gabriel/tenant_fk_validation_<ddmmaaaa>.md` e seção "Tratamento" no repasse
- [ ] qa_checks, suíte completa com cobertura, remover container pg-fk

## Decisões tomadas nesta frente
- 24/10 — Outro hotel, inexistente, excluído ou id não-UUID → 404 (não revela existência) (delegação)
- 24/10 — Edição manual de status: AVAILABLE ↔ MAINTENANCE e CLEANING → AVAILABLE; mesmo status = sem mudança (aceito, o frontend reenvia o status velho) (delegação + CLAUDE.md §3)

## Bloqueios e perguntas abertas
- Área de quartos/categorias é da Sirlande: ela precisa saber das mudanças.

## Comandos úteis desta frente
```bash
cd /home/gabri/wt-fk-tenant/services/core-service
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null
npx vitest run tests/tenant-fk-isolation.test.js
npx vitest run --coverage
bash ../../scripts/qa_checks.sh
```
