# 2026-09-22 — Agente executor (trilha do Gabriel)

- **Branch:** `docs/swagger-response-schemas`
- **Horário:** sessão única, Etapa 4 da delegação `docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md`
- **Objetivo da sessão:** T-06.2 — schema de resposta completo no Swagger, cliente TypeScript sem `never`, remoção dos 6 casts

## O que foi feito

1. Coordenação verificada antes de começar: T-06.10 (paginação, trilha do Sirlande, mexe no mesmo contrato) não começou — sem branch, sem commit, SPEC ainda 🔲. Seguido sem parar.
2. **Decisão tomada em conjunto com o usuário, no meio da etapa:** os endpoints `/payments*` vazavam `pix_qr_code`/`provider`/`provider_charge_id` (achado 🔴 reconfirmado em 3 auditorias anteriores — Etapas 1, 2 e 3). Documentar o Swagger fielmente ao comportamento atual formalizaria o vazamento por escrito no contrato da API. Perguntei ao usuário; ele escolheu corrigir antes de documentar. `defaultScope` no `PaymentModel` excluindo os 3 campos, com TDD (teste cria pagamento PIX real, confirma com `.unscoped()` que os dados existem no banco, confirma que `GET /payments`/`GET /payments/{id}` não os devolvem).
3. Medição antes: 54 respostas 2xx, 42 sem `content`.
4. Pesquisa: 35 controllers lidos (Public Booking, Webhook, Auth, Tenant, User, RoomCategory, Room, Guest, Reservation, Consumption, Payment) para conferir cada schema contra o código real, não contra o nome do model — critério explícito da delegação.
5. `config/swagger.js` reescrito: 15 schemas novos em `components.schemas`, todas as 54 respostas 2xx com `content`. Webhook PIX ganhou o cabeçalho `x-pix-signature` e a resposta `401` documentados (pendência da auditoria da Etapa 2, fechada de brinde).
6. `pnpm gen:api` — cliente regenerado. Confirmado programaticamente: 0 respostas 200/201 com `content?: never`.
7. 6 casts `as unknown as` removidos (`guestsApi.ts` ×4, `GuestDetailPage.tsx` ×1, `loginApi.ts` ×1). `pnpm typecheck` limpo nos 4 pacotes relevantes do monorepo.
8. Portão de QA — 1ª rodada: `qa_checks.sh` 0 erros, suíte backend 237/237 + 1 skip.
9. Subagente `qa-redteam`: **REPROVADO** — 1 achado 🔴 (`RoomCategory.price_per_night`, `Room.category.price_per_night` e `Reservation.total_amount` documentados como `number` quando a API devolve `string`, colunas `DECIMAL` — mesmo padrão já usado em `Product.price`/`Payment.amount`, que escapou nesses três).
10. Corrigido os 3 pontos + descrição do `Payment` ajustada (não superafirma sobre `POST /payments`, que não passa pelo `defaultScope`). `pnpm gen:api` de novo. Confirmado que nada no frontend consumia esses campos assumindo `number` (0 ocorrências).
11. Portão de QA — 2ª rodada: tudo verde de novo.
12. **Reauditoria focada** (não uma auditoria completa do zero, já que só o fix pontual precisava de confirmação): **APROVADO COM RESSALVAS, 0 🔴 remanescente**. A reauditoria mediu `typeof` de verdade no app rodando (não confiou no diff) e achou 1 ressalva nova (🟡-15): `PUT /room-categories/{id}` devolve `number` (mesma causa do `PUT /payments/{id}`, já conhecida — `.update()` sem `.reload()`).
13. SPEC-06 atualizada: T-06.2 ✅, com a pendência de 16/09 (`GET /payments` vazando) marcada como resolvida.

## Commits gerados

| Hash | Mensagem |
|------|----------|
| `3ef6ba2` | `fix(payments): defaultScope no PaymentModel esconde dados do provedor PIX` |
| `e54b9fe` | `feat(swagger): schemas de resposta para as 54 respostas 2xx (T-06.2)` |
| `d0131e0` | `chore(api-client): regenera openapi.json e schema.d.ts (T-06.2)` |
| `d126432` | `refactor(frontend): remove os 6 casts 'as unknown as' (T-06.2)` |
| `cbebec8` | `fix(swagger): DECIMAL serializa como string, nao number (achado qa-redteam)` |
| `e309e27` | `docs(qa): auditoria qa-redteam do Swagger T-06.2 (com reauditoria do fix)` |
| `7d1a072` | `docs(specs): marca T-06.2 como concluida, fecha pendencia do GET /payments` |

## Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | `PUT /room-categories/{id}` e `PUT /payments/{id}` devolvem `price_per_night`/`amount` como `number` (valor cru do body), enquanto `GET` devolve `string` — mesmo `$ref`, dois tipos | 🟡 Média | Causa raiz idêntica nos dois: `.update()` sem `.reload()` depois. Correção de uma linha em cada controller — cabem numa task só. |
| 2 | `POST /payments` (`.create()`) não passa pelo `defaultScope` do `PaymentModel` — os 3 campos sensíveis vêm `null` nessa resposta específica | 🟢 Baixa | Documentado no schema. Não é vazamento (pagamento manual da recepção nunca tem esses dados), mas fica tecnicamente presente no JSON como `null`. |
| 3 | 9 achados 🟡 e 4 🟢 adicionais da auditoria (CA-06.2.b parcial — alguns objetos resumidos `{id,name}` ainda inline em vez de schema compartilhado; schemas omitem `tenant_id`/timestamps que a API realmente manda; 41 de 107 respostas 4xx/5xx sem `content`, fora do escopo da CA) | 🟢 Baixa | Detalhados em `docs/qa/redteam_swagger-response-schemas_22set2026.md`. Nenhum bloqueante. |
| 4 | `errors.push(...)` vs `{error: '...'}` — dois formatos de 400 convivendo no mesmo backend | 🟢 Baixa | Pré-existente, documentado com `oneOf` onde relevante. Não é escopo desta task decidir por um formato único. |

**Próxima etapa da delegação:** Etapa 5 — T-01.3 (autenticação entre serviços, RS256). Fase 5a é só proposta — **PARAR para aprovação do Gabriel antes da implementação (5b)**.
