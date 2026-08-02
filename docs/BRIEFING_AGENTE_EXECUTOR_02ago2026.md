# Briefing do Agente Executor — 02/08/2026

> **Leia este documento antes de qualquer implementação.** Ele corrige premissas erradas
> de documentos anteriores e define onde trabalhar.

---

## 1. Onde trabalhar

| Item | Valor |
|---|---|
| **Repositório canônico** | `~/sistema_gestao_hotel` (WSL) |
| Branch base | `develop` @ `227d905` |
| Clone secundário | `C:\Users\gabri\sistema_hotel_prova` — **sincronizado em 02/08/2026**, agora em `develop @ 227d905` |
| Remote | `github.com/gabrielreis354/sistema_hotel_prova` |

**Sempre rode `git pull origin develop` antes de criar uma branch.** O projeto tem 3 devs
(Gabriel, Sirlande, Weslley) mais agentes trabalhando em paralelo — a base muda rápido.

---

## 2. Correção crítica de premissa

Os documentos `analise_gaps_consumo_02ago2026.md` e `planejamento_modulo_consumo_02ago2026.md`
foram escritos contra a `main` em `55eaae0` (PR #36) — **106 commits atrás**. A `origin/main`
já estava em `0c463fd` (PR #70) e a `develop` em `227d905` (PR #73).

Por isso o plano afirma que **não existe modelo de consumo**. Isso está errado.

### O que JÁ EXISTE na `develop` (não reimplementar)

| Recurso | Arquivo |
|---|---|
| `ConsumptionModel` — `reservation_id` NOT NULL, `deleted_by` para auditoria | `app/Models/ConsumptionModel.js` |
| `POST /reservations/:id/consumptions` | `app/Controllers/ConsumptionApi/CreateConsumptionController.js` |
| `GET /reservations/:id/consumptions` | `app/Controllers/ConsumptionApi/ListConsumptionController.js` |
| `DELETE /reservations/:id/consumptions/:cid` (ADMIN, com autor) | `app/Controllers/ConsumptionApi/DeleteConsumptionController.js` |
| `GET /reservations/:id/bill` — fechamento de conta | `app/Controllers/ReservationApi/GetBillController.js` |
| Testes do fluxo | `tests/bill-consumptions.test.js` |
| Módulo B2B completo (clientes corporativos, orçamentos, contratos, MinIO) | `app/Controllers/{CorporateClient,EventQuote,Contract}Api/` |
| Motor de reserva direta + PIX | `app/Controllers/PublicBookingApi/`, `app/services/pix/` |
| Analytics (7 endpoints) | `app/Controllers/AnalyticsApi/` |
| Config do hotel | `app/Controllers/TenantApi/` |
| CI com portão de cobertura de 60% | `.github/workflows/ci.yml` |

**Regra:** antes de criar qualquer arquivo, verifique se ele já existe. Rode `ls` no diretório
do módulo e `git log --oneline -20` para ver o que entrou recentemente.

---

## 3. Decisão de arquitetura — `Account` absorve `Consumption`

`Account` e `Consumption` resolvem o mesmo problema. **Não podem coexistir**: teríamos dois
caminhos para lançar consumo e um `/bill` que soma errado.

| Opção | Veredito |
|---|---|
| Manter as duas | ❌ Duplicação de fonte da verdade |
| Descartar `Account`, evoluir `Consumption` | ❌ `reservation_id` NOT NULL impede day-use e split bill — que são a razão do módulo |
| **`Account` absorve `Consumption`** | ✅ **Decidido** |

### Como fazer a absorção

1. `Account` tipo `ROOM` passa a ser a conta da estadia; `Consumption` vira `AccountItem`.
2. **Migração de dados:** para cada `consumption` existente, localizar ou criar a `Account` da
   reserva e inserir o `AccountItem` correspondente. Preservar `created_at` e `deleted_by`.
3. `GET /reservations/:id/bill` **continua existindo** mas passa a delegar para as contas da
   reserva. Isso mantém `tests/bill-consumptions.test.js` passando — **não altere o contrato
   de resposta desse endpoint sem antes rodar a suíte**.
4. `POST /reservations/:id/consumptions` vira *deprecated*: continua respondendo, mas grava via
   `Account`. Remover só depois que o frontend estiver em produção.

---

## 4. Cuidado especial: `PaymentModel`

O Sprint 3 previa tornar `reservation_id` nullable e adicionar `account_id`. Atenção — o model
mudou bastante desde o plano original (`app/Models/PaymentModel.js`):

- `reservation_id` é `allowNull: false` **e** está no caminho crítico do PIX
- O model agora tem `status` (PENDING/PAID/EXPIRED/FAILED), `kind` (FULL/DEPOSIT/BALANCE),
  `provider`, `provider_charge_id`, `pix_qr_code`, `pix_expiration`, `paid_at`

Tornar `reservation_id` nullable impacta:
- `app/Controllers/PublicBookingApi/CreateBookingController.js`
- `app/Controllers/WebhookApi/PixWebhookController.js`
- `tests/public-booking.test.js`

Exigir no banco: `CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL)`.
Rodar `npm test` completo antes de abrir PR — este é o ponto de maior risco de regressão.

---

## 5. Frontend — o que já foi decidido

Plano completo em **`docs/frontend/PLANEJAMENTO_FRONTEND.md`**.

| Decisão | Escolha |
|---|---|
| Stack | React + TypeScript + Vite, monorepo pnpm + Turborepo |
| Apps | `app-pms` (recepção + garçom), `app-booking` (Next.js, público), `app-admin` (backoffice SaaS) |
| Responsividade | Mobile-first, exceto rack e analytics (layout de desktop dedicado) |
| Escopo TCC | Só `app-pms` |
| Cliente de API | Gerado do OpenAPI (`config/swagger.js`) — **manter o Swagger atualizado é obrigatório** |

### Consequência para o backend do consumo

O frontend do garçom (§8.2 do plano) exige que o backend suporte:

- `GET /accounts?status=OPEN` — lista de contas abertas é a tela inicial do garçom
- `POST /accounts/:id/items` **idempotente** — a fila offline pode reenviar o mesmo lançamento.
  Aceitar um `client_item_id` (UUID gerado no cliente) e ignorar duplicata.
- `total` sempre calculado no servidor, nunca aceito do cliente
- Resposta do `POST /items` devolvendo o total atualizado da conta, para o rodapé fixo

---

## 6. Preparação de backend para o frontend

Branch separada, **antes** de começar o frontend: `fix/backend-prep-frontend`.

| # | Gap | Evidência | Severidade |
|---|---|---|---|
| 1 | **CORS não configurado** | Nenhuma ocorrência de `cors` no projeto; `bootstrap/app.js` só chama `initRelations()` | 🔴 Bloqueante — a primeira requisição do frontend falha |
| 2 | **`GET /reservations` sem filtro de data nem paginação** | `ListReservationController.js:9` — `findAll` do tenant inteiro com 3 joins | 🔴 Bloqueante para o rack |
| 3 | **Não existe role `WAITER`** | `UserModel.js:29-33` — só `ADMIN` e `RECEPTIONIST` | 🔴 Sem isso o garçom vê o sistema inteiro |
| 4 | JWT de 8h sem refresh token | `LoginController.js:51` | 🟡 Sessão cai no meio do turno |
| 5 | Não existe super-admin (todo user tem `tenant_id`) | `UserModel.js` | 🟡 Bloqueia `app-admin` (pós-TCC) |
| 6 | `DECIMAL` chega como string do `pg` | Driver | 🟡 Tratar no frontend, nunca `Number()` direto |

Itens 1–3 são pré-requisito da Fase 1 do frontend. O item 3 também é pré-requisito do
Sprint 1 do módulo de consumo.

---

## 7. Ordem de execução recomendada

```
1. fix/backend-prep-frontend      → CORS + filtro de datas/paginação + role WAITER
2. feature/product-catalog        → Sprint 1 do módulo de consumo
3. feature/account-accountitem    → Sprint 2 (inclui migração do Consumption)
4. feature/account-billing        → Sprint 3 (REFATORAR o /bill, não criar)
5. feature/split-bill-dayuse      → Sprint 4
6. feature/consumo-seed-swagger   → Sprint 5
                                  → PR único: develop → main
7. Frontend Fase 0 em diante      → docs/frontend/PLANEJAMENTO_FRONTEND.md §11
```

---

## 8. Regras inegociáveis do projeto

Da `CLAUDE.md` e da `docs/CODING_STANDARDS.md`:

- **ESM sempre** — `import`/`export`, nunca `require()`
- **`tenant_id` em toda query** — vazamento cross-tenant é crítico
- **Transação Sequelize** quando gravar em 2+ tabelas
- **Nunca commitar em `main` ou `develop` direto** — sempre branch `feature/*` ou `fix/*`
- **Nunca `git add .`** — adicionar arquivo por arquivo
- **Nunca commitar `.env` ou secret**
- **Conventional Commits** — `feat(scope):`, `fix(scope):`, `docs(scope):`
- **Allowlist, não blocklist**, para máquina de estados (fail-safe)
- Relatório de sessão em `docs/historico_sessao/<dev>/<titulo>_<ddMMyyyy>.md`

---

## 9. Índice de documentos

| Documento | Conteúdo |
|---|---|
| `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` | **Este arquivo** — ponto de entrada |
| `docs/frontend/PLANEJAMENTO_FRONTEND.md` | Análise de mercado, stack, telas, roadmap do frontend |
| `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` | Sprints do backend de consumo (revisadas) |
| `docs/historico_sessao/gabriel/analise_gaps_consumo_02ago2026.md` | Diagnóstico de produto dos 5 cenários |
| `docs/PRODUCT_ROADMAP.md` | Fases do produto |
| `docs/CODING_STANDARDS.md` | Padrões de código e Git |
| `CLAUDE.md` | Regras de orquestração |
