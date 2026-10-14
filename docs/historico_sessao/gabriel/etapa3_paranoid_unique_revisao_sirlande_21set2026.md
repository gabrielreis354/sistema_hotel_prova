# 2026-09-21 — Agente executor (trilha do Gabriel)

- **Branch:** `fix/paranoid-unique-constraints`
- **Horário:** sessão única, Etapa 3 da delegação `docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md`
- **Objetivo da sessão:** deixar a branch (T-06.3 + T-06.6, área do Sirlande) verificada e pronta para revisão dele — **sem merge**

## O que foi feito

1. **Worktree isolado.** O worktree principal (`/home/gabri/sistema_gestao_hotel`) tinha outra sessão gravando arquivos em `docs/sugestoes-documentos-oficiais/` no momento (Documento 03, área da Sirlande — provavelmente ela mesma). Um `git checkout` direto teria colidido com o trabalho dela; criei `git worktree add /home/gabri/sistema_gestao_hotel-etapa3 fix/paranoid-unique-constraints` para trabalhar sem interferir.
2. `git merge origin/develop` — a branch estava 54+ commits atrás, ainda no layout antigo. 5 conflitos, todos previstos ou próximos do previsto pela delegação:
   - 3 arquivos novos (`uniqueConstraintConflict.js`, `paranoid-unique-recreate.test.js`, `unique-constraint-conflict.test.js`) movidos para `services/core-service/` — git já indicava o destino, conteúdo sem alteração
   - `scripts/qa_checks.sh` — conflito real entre a regra 8 estrutural desta branch e a regra 9 do frontend (já em `develop`). Resolvido preservando as duas, com os caminhos da regra 8 atualizados para `$CORE/app/Models/*.js` e `$CORE/db/schema.sql`. Testado de verdade: quebrei `RoomCategoryModel.js` deliberadamente e confirmei `exit 1`; restaurei.
   - `tests/public-booking.test.js` — conflito modify/delete: a versão antiga (raiz) tinha 2 testes de regressão do find-or-create CPF/e-mail que a versão nova (já com o trabalho das minhas Etapas 1 e 2 desta mesma sessão) não tinha. Portados manualmente, com imports ajustados.
3. **Verificação item a item dos 3 achados 🔴 da auditoria de 31/08** (`docs/qa/redteam_paranoid-unique_27ago2026.md`): todos fechados, confirmado pela reaudit de 09/09 e por reprodução própria (quebrei e restaurei o bypass do 🟡-3 da regra 8 numa linha só — `exit 1`, corrigido de fato).
4. Portão de QA — 1ª rodada: `qa_checks.sh` 0 erros, suíte completa 261/261 + 1 skip.
5. Subagente `qa-redteam` fez uma **nova auditoria completa** (não só do merge de hoje) com escrutínio adversarial pedido explicitamente sobre a resolução dos conflitos. Veredito: **APROVADO COM RESSALVAS, 0 achados 🔴 no escopo da branch**. Achou 1 🔴 pré-existente em `develop` (PII de hóspede em `console.error(error)`, fora do diff) e recomendou corrigir 1 🟡 antes do PR.
6. **Corrigido com TDD** (RED confirmado antes da correção): `applyDbConstraints.js` cobria 7 dos 8 índices auditados e deixava `products` de fora — justamente a tabela que originou a T-06.6. Uma linha no array `indicesParciais` + um teste novo em `db-constraints.test.js` reproduzindo o cenário de banco legado.
7. Portão de QA — 2ª rodada: `qa_checks.sh` 0 erros, suíte completa **263/263 + 1 skip**, cobertura 74,56%/70,84%/85,71%/77,19%.
8. `git merge origin/develop` de novo (branch estava 2 commits atrás — só documentação do Documento 03, sem conflito).
9. SPEC-06 atualizada: T-06.3 e T-06.6 marcadas 🟡 (não ✅ — quem aprova o merge é o Sirlande), com CA-06.3.a-d e CA-06.6.a-c evidenciados.
10. PR aberto com título `[revisão do Sirlande]`, **sem merge** — conforme a condição de parada desta etapa.

## Commits gerados

| Hash | Mensagem |
|------|----------|
| `ee09676` | `Merge remote-tracking branch 'origin/develop' into fix/paranoid-unique-constraints` (5 conflitos resolvidos) |
| `3095bbe` | `fix(db): applyDbConstraints cura products tambem (T-06.6 completa)` |
| `424a058` | `docs(qa): nova auditoria qa-redteam pos-merge de layout (T-06.3/T-06.6)` |
| `005b02e` | `Merge remote-tracking branch 'origin/develop' into fix/paranoid-unique-constraints` (docs, sem conflito) |
| `91634a1` | `docs(specs): atualiza T-06.3/T-06.6 na SPEC-06, aguardando revisao do Sirlande` |

## Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | PII de hóspede (nome, CPF, e-mail) impressa no stdout via `console.error(error)` em 10 controllers | 🔴 Alta (pré-existente em `develop`, fora do escopo desta branch) | Reproduzido pelo auditor: `sql` e `parameters` do erro Sequelize saem inteiros no log, 3× por erro. Esta branch reduz a frequência e corrige o único endpoint público. Sugestão: T-06.12, junto com a pendência de `GET /payments` já registrada na Etapa 1. |
| 2 | Reserva pública anexa a cadastro de terceiro sem verificação (OTP/e-mail) quando o CPF já existe | 🟡 Média (decisão de produto, deliberadamente fora do escopo) | Não está registrado em lugar nenhum — SPEC-06 vai até T-06.11. Sugestão: T-06.12 também. |
| 3 | Regra 8 do `qa_checks.sh`: bypass por comentário de bloco (`/* where: ... */`) e a regra do `schema.sql` não vê `UNIQUE` de coluna | 🟡 Média | Registrado no relatório de QA para o Sirlande decidir — mexer de novo na heurística da regra 8 não é decisão minha a tomar unilateralmente numa branch que já é dele. |
| 4 | 409 novo em `POST /public/:subdomain/bookings` colide com um 409 já documentado no Swagger com outro significado | 🟡 Média | Fica para a T-06.2 (próxima etapa desta delegação), que reescreve o Swagger inteiro. |
| 5 | `sync({alter})` não migra banco legado por causa de um enum de `event_quotes` — `command.js migrate` sempre sai `exit 1` num banco provisionado pelo `schema.sql` antigo (a cura dos índices roda mesmo assim, mas o processo termina com erro) | 🟢 Baixa | Pré-existente, independente desta branch. Registrar antes de qualquer migração real de banco legado. |

**Condição de parada desta etapa (explícita na delegação):** PR aberto, CI a confirmar. **Não fazer o merge** — quem aprova é o Sirlande.
