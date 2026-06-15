### 2026-06-15 — Gabriel (agente-prova)

- **Branch:** `develop`
- **Horário:** sessão única
- **Objetivo:** Criar suite completa de testes automatizados de integração para o CorePMS

---

#### Contexto

O projeto não tinha nenhum teste automatizado. A demanda surgiu da necessidade de validar o ambiente K8s e as rotas da API de forma sistemática — em vez de rodar curls manuais, foi criada uma suite reutilizável que pode ser executada em qualquer ambiente com PostgreSQL acessível.

---

#### O que foi feito

| Entrega | Detalhe | Status |
|---------|---------|--------|
| Instalação Vitest 4 + Supertest | `devDependencies` adicionados, scripts `test` e `test:watch` no `package.json` | ✅ |
| `vitest.config.js` | `singleFork: true`, `isolate: false`, `globalSetup` + `setupFiles`, execução sequencial | ✅ |
| `.env.test` | Banco de teste isolado `gestao_hotel_test`, mesmas credenciais do dev | ✅ |
| `tests/setup/globalSetup.js` | Cria o banco de teste (se não existir) + `sequelize.sync({ force: true })` — roda 1× | ✅ |
| `tests/setup/env.js` | Carrega `.env.test` via dynamic import + `initRelations()` com guard de idempotência | ✅ |
| `tests/helpers/createApp.js` | Express app sem `listen()` — entry point para supertest | ✅ |
| `tests/helpers/auth.js` | `registerAndLogin()` reutilizável com tenant e email únicos por chamada | ✅ |
| `tests/helpers/db.js` | `truncateAll()` via `TRUNCATE tenants CASCADE` — limpa todas as tabelas em cascata | ✅ |
| `tests/helpers/factories.js` | `createCategory`, `createRoom`, `createGuest`, `createReservation` | ✅ |
| `tests/auth.test.js` | 9 testes: register (201, subdomain auto, 409, 400), login (200+JWT, 401, 400), authMiddleware (401) | ✅ |
| `tests/room-categories.test.js` | 7 testes: CRUD completo + 404 por ID inexistente | ✅ |
| `tests/rooms.test.js` | 12 testes: CRUD + `/available` (400 sem datas, 400 datas inválidas, lista correta, exclui reservado) | ✅ |
| `tests/guests.test.js` | 9 testes: CRUD + CPF único por tenant (409) + CPF opcional | ✅ |
| `tests/reservations.test.js` | 20 testes — state machine completa, total_amount, extras, cancelamento | ✅ |
| `tests/payments.test.js` | 5 testes: create (201, 400, 404), list (200), get by ID (200) | ✅ |
| `tests/tenant-isolation.test.js` | 13 testes — dados de um tenant invisíveis ao outro em todos os domínios | ✅ |
| `docs/CODING_STANDARDS.md` | Nova seção `🧪 Testes Automatizados` com stack, estrutura, padrões e regras | ✅ |
| `docs/PRODUCT_ROADMAP.md` | "Testes automatizados" marcado como ✅ na fase Demo; cobertura 44% → 55% | ✅ |

---

#### Cobertura dos testes de reservas (20 testes)

| Cenário | O que valida |
|---------|-------------|
| `POST` sem `total_amount` no body | **Fix**: valor calculado server-side = `price_per_night × noites` |
| `POST` campos ausentes | 400 |
| `POST` quarto inexistente | 404 |
| `POST` categoria sem preço | 422 |
| `POST` conflito de datas | 409 double booking |
| `POST` mesmo quarto, período diferente | 201 (permitido) |
| Check-in: PENDING → CHECKED_IN | 200 + `room.status = OCCUPIED` |
| Check-in duplicado | 422 |
| Cancel quando CHECKED_IN | 422 "hóspede no quarto" |
| Check-out: CHECKED_IN → CHECKED_OUT | 200 + `room.status = CLEANING` |
| Check-out duplicado | 422 |
| Cancel quando CHECKED_OUT | 422 "reserva encerrada" |
| Cancel PENDING | 200 + `status = CANCELLED` |
| Cancel CONFIRMED | 200 |
| Cancel já cancelada | 422 "já cancelada" |
| **Check-in com quartos extras** | **Fix**: principal E extras ficam OCCUPIED |
| **Check-out com quartos extras** | Principal E extras ficam CLEANING |
| PUT direto não altera status | status protegido por design |
| GET /reservations | 200, lista não vazia |

#### Cobertura de tenant isolation (13 testes)

Dois tenants criados em paralelo. Verificado que dados de A não aparecem para B em: quartos, `/rooms/available`, hóspedes, reservas (list + check-in + cancel), pagamentos. CPF único por tenant (não global). Endpoints sem token → 401.

---

#### Resultado final

```
Test Files  7 passed (7)
     Tests  75 passed (75)
  Duration  ~5s
```

---

#### Decisões técnicas relevantes

**Vitest sobre Jest:** nativo ESM — zero config de transpile com `"type": "module"`.

**Banco real sobre mocks:** constraints PostgreSQL (`UUID`, `UNIQUE composto`, `CASCADE`) não se comportam igual em SQLite ou mocks. Bugs de schema aparecem aqui, não em produção.

**`singleFork + isolate: false`:** Sequelize é singleton. Com isolamento de módulo entre arquivos (padrão do Vitest), cada arquivo teria sua própria instância de Sequelize — conexões e schema duplicados. `isolate: false` compartilha o module cache.

**`globalSetup` para o sync:** `setupFiles` roda por arquivo. Se o `sync({ force: true })` estivesse ali, rodaria N vezes, causando erros de FK (`relation "tenants" does not exist` ao criar `users` antes de `tenants` em race conditions). `globalSetup` roda 1× em processo separado, garantindo schema pronto antes de qualquer test worker iniciar.

**`truncateAll()` com CASCADE:** Truncar `tenants CASCADE` limpa todas as tabelas (~5ms) vs novo `sync({ force: true })` (~2s). Usado em `beforeAll` de cada suite para isolamento.

---

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `ae30d00` | `feat(tests): adicionar suite completa de integração (Vitest + Supertest) — 75 testes` |

---

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Validações K8s-1 a K8s-4 (probes, resiliência, resource limits) | 🟡 Média | Requerem ambiente K8s ativo — os testes de integração cobrem as rotas mas não a infra |
| 2 | GitHub Actions rodando `npm test` a cada push | 🟡 Média | Suite pronta; falta o `.github/workflows/test.yml` |
| 3 | Cobertura de código com `v8` reporter | 🟢 Baixa | Adicionar `coverage: { provider: 'v8' }` no `vitest.config.js` |
| 4 | Testes para `/users` | 🟢 Baixa | Não cobertos — menor prioridade |
