# Delegação — T-05.2 pós-merge: LGPD e contrato da busca de hóspede

> **De:** Gabriel (orquestrador) · **Para:** uma janela Claude Code dedicada · **Data:** 04/11/2026
> **Origem:** 🟢-1, 🟢-2 e 🟢-3 da reauditoria delta 2 da T-05.2 (`docs/qa/redteam_t052-reservas_delta2_02nov2026.md`)
> **Meta:** qualidade da M2, que já está na `develop` (#108). Precisa entrar antes do congelamento de 24/11

Cole o bloco abaixo inteiro como primeira mensagem na janela nova.

```
Você é um dev senior full-stack no Gesway, um PMS SaaS multi-tenant para pousadas e hotéis pequenos.
Quem usa esta parte: a RECEPCIONISTA, quando escolhe o hóspede na tela "Nova reserva".

STACK E RESTRIÇÕES
- Backend: services/core-service, com Node 24, Express 4, ESM (NUNCA require()), Sequelize 6 e
  PostgreSQL 17. O tenant_id vem SEMPRE do JWT (request.tenantId).
- Frontend: monorepo pnpm em frontend/, com React 18.3.1, TS, TanStack Query e Tailwind.
  - O api-client é gerado com `pnpm gen:api` e NUNCA editado à mão. Não use `as unknown as`.
  - Formatação e máscara de documento vêm do @hotel/domain.
  - O pnpm só existe com o nvm carregado: `source ~/.nvm/nvm.sh`.
- LGPD art. 6º, III (necessidade): para escolher entre homônimos, mostre só o necessário.

LEIA ANTES
- CLAUDE.md, docs/CODING_STANDARDS.md, docs/PAINEL_DE_ANDAMENTO_MVP.md (§5, paralelismo) e frontend/DESIGN_PMS.md.
- docs/qa/redteam_t052-reservas_delta2_02nov2026.md (achados 🟢-1, 🟢-2 e 🟢-3).
- Backend: services/core-service/app/Controllers/GuestApi/ListGuestController.js,
  services/core-service/routes/apis/guestRouter.js, services/core-service/config/swagger.js e
  services/core-service/tests/guests-search.test.js.
- Frontend: frontend/apps/pms/src/features/reservations/components/GuestPicker.tsx e o
  fluxo de criação de reserva da mesma feature. Procure no @hotel/domain uma máscara de CPF
  (maskCpf ou equivalente) antes de criar outra: o comprovante da T-05.2 já mascara o CPF.

TAREFA (branch fix/t052-lgpd-busca-hospede, a partir de origin/develop; worktree /home/gabri/wt-t052lgpd)
1. Backend, contrato da busca (🟢-3):
   - `GET /guests?q=` com `q` de menos de 3 caracteres (depois do trim) responde 400, com
     `{ error, code: 'INVALID_INPUT', field: 'q' }`, no mesmo padrão de código de erro do projeto.
   - Sem `q`, o contrato antigo continua igual: não mude a lista da tela de hóspedes, que é da T-05.12.
   - Declare `minLength: 3` no Swagger e regenere o api-client.
2. Backend, dado mínimo (🟢-1):
   - No modo busca (com `q`), devolva só o necessário para escolher: `id`, `name`, CPF mascarado
     (só os 3 dígitos do meio visíveis, ou o padrão que o projeto já use) e telefone parcial (últimos 4 dígitos).
   - Sem `tenant_id`, timestamps, `deleted_at` nem e-mail.
   - A busca POR CPF ou telefone completo continua funcionando: o filtro roda no servidor,
     e só a resposta é reduzida.
   - Declare o schema da resposta no Swagger.
3. Frontend:
   - GuestPicker: mostra nome, CPF mascarado e telefone parcial vindos do servidor; não mascara de novo no cliente.
   - 🟢-2: depois de um 404 de hóspede na criação, limpe a seleção do hóspede, desabilite
     "Confirmar" até escolher de novo, e faça a mensagem dizer que o hóspede não foi encontrado
     (diferente da mensagem de quarto).

CRITÉRIOS DE ACEITE
- [ ] `q` com 1 ou 2 caracteres → 400 `INVALID_INPUT` `field: 'q'`; com 3 → 200.
- [ ] Resposta da busca sem CPF, telefone ou e-mail completos (teste confere chave por chave).
- [ ] Busca por CPF completo, com e sem máscara, ainda acha o hóspede.
- [ ] Tenant isolation: o hotel B não acha hóspede do hotel A (o teste já existe; mantenha-o verde).
- [ ] WAITER continua com 403.
- [ ] Depois do 404 de hóspede, "Confirmar" fica desabilitado até nova escolha (teste de componente).
- [ ] Sem `q`, `GET /guests` devolve exatamente o que devolve hoje.

NÃO TOCAR
- `features/reservations/components/ActionSlot*`, `features/rooms/`, `routes/apis/reservationRouter.js` e `roomRouter.js`:
  a T-05.3 está mexendo neles em paralelo.
- `services/analytics-service/` e `infra/`: a H.3 está mexendo neles em paralelo.

COMO TRABALHAR
- RPI: mostre o plano ao Gabriel antes de implementar.
- TDD: RED e GREEN em commits separados, em Conventional Commits com corpo, cada um terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  NUNCA use `git add .` nem `-A`. Faça push a cada passo.
- PG próprio na porta 5466 e backend na 3066 (confira com `ss -ltn` antes). Use `timeout -k` em
  comando longo. Derrube os containers no fim. Nenhum comando AWS ou Terraform.

VERIFICAÇÃO (saída real no relatório)
- Core, suíte completa (`npx vitest run`).
- Frontend: `pnpm turbo run typecheck test build`.
- `bash scripts/qa_checks.sh` e `/security-review` (o diff toca controller).

OUTPUT
1. Branch fix/t052-lgpd-busca-hospede no remoto, SEM PR (o Gabriel dispara o qa-redteam e abre o PR).
2. Relatório em docs/historico_sessao/gabriel/t052_lgpd_busca_hospede_<ddMMyyyy>.md.
3. Linha na SPEC-05 (pendências da T-05.2) marcando 🟢-1, 🟢-2 e 🟢-3 como tratados.
```
