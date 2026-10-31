# CI por serviço, PIX no compose e SPEC-03 com o Asaas — 31/10/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Branches**, todas a partir de `develop` em `4234915` e mescladas em `develop` em 31/10:
- `chore/compose-pix-asaas`
- `docs/spec03-asaas`
- `feature/ci-por-servico`

**Status:** qa-redteam "mergear com ressalvas" nas três, sem 🔴 (`docs/qa/redteam_branches-weslley-ci-compose-spec03_31out2026.md`). As 🟡 e as 🟢 de escopo foram corrigidas antes do merge. CI verde no GitHub.

## O que foi feito

| Branch | Commits | Mudança |
|---|---|---|
| `chore/compose-pix-asaas` | `cab1c68`, e a correção da auditoria | O `docker-compose.yml` passa `PIX_PROVIDER` (padrão `fake`, o plano B) e as variáveis do Asaas ao backend. Antes, a demonstração pelo compose sempre usava o simulado. O Mercado Pago ficou de fora: o provider dele não tem trava de sandbox. O `.env.example` e o `ASAAS_SANDBOX.md` (§4.1) avisam que a chave vai entre **aspas simples** |
| `docs/spec03-asaas` | `acda612`, `047a69c` | A T-03.2 registra o Asaas: CA-03.2.c marcado pela cobrança real de 16/10, CA-03.2.d parcial até o webhook chamado pelo próprio Asaas (M6). T-03.3 conferida contra a ADR-008: b e c atendidos, a parcial |
| `feature/ci-por-servico` | `1d285b2`, `ed1fc66`, `fa81b69` | CA-01.5.a. `ci.yml` só com o `qa_checks`; `ci-core-service.yml` com a suíte do core, filtrada por `services/core-service/**`; `ci-frontend.yml` com typecheck, testes e build, filtrado por `frontend/**` e pela fonte do contrato. O job "Contrato da API em dia" regenera o `api-client` e falha se ele diferir do versionado. Permissão só de leitura, concorrência, `workflow_dispatch` e branches `refactor/**` e `test/**` |

## Evidências

| Verificação | Resultado |
|---|---|
| `docker compose config` sem nada no `.env` | `PIX_PROVIDER: fake` |
| Idem, com `PIX_PROVIDER=asaas` | as variáveis do Asaas chegam ao backend |
| Chave `$aact_hmlg_...` sem aspas | o compose avisa `variable is not set` e entrega a chave vazia |
| Chave entre aspas simples | `config` mostra `$$aact_hmlg_...`, o `$` escapado |
| Job de contrato na `develop` em `4234915` | **acusaria diferença**: o PR #104 mudou o `swagger.js` dos quartos (`RoomError`) sem regenerar o cliente. Regenerado em `1d285b2` |
| Frontend local com o cliente novo | typecheck 4/4, testes 131 (30 do domain e 101 do pms), build ok |
| GitHub, `ed1fc66` | `CI`, `CI — core-service` e `CI — frontend` verdes. As branches de docs e do compose rodaram só o `CI` geral: o filtro funcionou |

## Achado que não é meu

O cliente da API estava desatualizado na `develop` depois do PR #104. O job de contrato existe para isso não se repetir. A regeneração entrou como commit próprio (`chore(api-client)`).

## Pendências

1. **`feature/ci-analytics-service` conflita no `ci.yml`** (C1 da auditoria): o job do analytics precisa ir para um `ci-analytics-service.yml`, com paths `services/analytics-service/**` e `infra/k8s/rabbitmq-setup.sh`.
2. **Repasses para mim** (`docs/qa/repasses/para_weslley_31102026.md`):
   - o k8s não tem `PIX_PROVIDER` nem `ASAAS_*`, e o cluster sempre usa o simulado;
   - um `PIX_PROVIDER` digitado errado cai em silêncio no simulado (fail-open).
3. **Insumos dos documentos oficiais** ainda dizem que o `ci.yml` roda os testes (C6): `ADR-006-proposta.md`, `05/INSUMOS.md`, `06-c4/INSUMOS.md` e `PLANEJAMENTO_FRONTEND.md`.
4. **CA-03.3.a:** a ADR-008 precisa de um parágrafo comparando Asaas × Mercado Pago (Doc 07, do Gabriel).
5. **PIX ao vivo (M6, 17/11):** chave nova do sandbox (a atual vence em 15/11) e o webhook pelo ngrok.

## Ambiente

- O turbo precisa do binário `pnpm` no PATH. Desde 31/10 há um atalho em `~/.local/bin/pnpm` (`corepack enable --install-directory ~/.local/bin pnpm`); exporte `PATH=$HOME/.local/bin:$PATH`.
- O `pnpm gen:api` também chama o `pnpm` por dentro e precisa do mesmo atalho.
