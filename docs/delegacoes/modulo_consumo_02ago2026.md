# Delegação — Módulo de Consumo e Contas (F&B + Day-use)

**Data:** 02/08/2026
**Orquestrador:** Gabriel (J1)
**Para:** Agente Executor BACKEND (J2 — outra janela Claude Code)
**Branch base:** `develop` @ `53a6d9f`
**Status:** 🔲 Não iniciado

---

## Onde você trabalha

**Sua worktree é `~/hotel-j2`.** Não é um clone — é uma git worktree que compartilha o
mesmo `.git` das outras janelas. Você já está na branch `fix/backend-prep-frontend`,
criada a partir de `develop`. Dependências e `.env` já estão provisionados.

Duas regras que decorrem disso:

```bash
# ❌ NÃO funciona — develop está checada no repo do orquestrador
git checkout develop

# ✅ Para começar cada fatia nova
git fetch origin
git checkout -b <branch-da-fatia> origin/develop
```

**Rode git sempre pelo WSL.** O `.git` da worktree aponta para um caminho Linux; git do
Windows não resolve e corrompe o estado. Detalhes em `docs/COORDENACAO_AGENTES.md` §1.1.

---

## Instruções iniciais obrigatórias

Execute nesta ordem, **antes de escrever qualquer código**:

```bash
cd ~/hotel-j2
git fetch origin
git log --oneline -15 origin/develop
git worktree list
```

Depois leia, nesta ordem:

1. **`docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md`** ← corrige premissas erradas. Leia inteiro.
2. `docs/COORDENACAO_AGENTES.md` ← como você se comunica com as outras duas janelas
3. `CLAUDE.md` e `docs/CODING_STANDARDS.md`
4. `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` ← spec detalhada

Confirme o entendimento respondendo antes de começar:
- Qual fatia você vai executar primeiro e por quê?
- Que arquivos **já existem** e você **não** deve recriar?
- Qual é o único ponto do módulo que pode quebrar o motor de reservas?

---

## ⚠️ Correção de premissa — leia duas vezes

Documentos anteriores deste módulo foram escritos contra um clone na `main` em `55eaae0`
(PR #36), **106 commits atrás** da `develop`. Eles afirmam que **não existe modelo de consumo**.

**Isso está errado.** A `develop` já tem:

| Já existe — **não recriar** | Arquivo |
|---|---|
| `ConsumptionModel` (`reservation_id` NOT NULL, `deleted_by`) | `app/Models/ConsumptionModel.js` |
| `POST/GET/DELETE /reservations/:id/consumptions` | `app/Controllers/ConsumptionApi/` |
| `GET /reservations/:id/bill` | `app/Controllers/ReservationApi/GetBillController.js` |
| Testes do fluxo | `tests/bill-consumptions.test.js` |
| Módulo B2B, motor de reservas + PIX, analytics, config do hotel | vários |

**Regra:** antes de criar qualquer arquivo, rode `ls` no diretório do módulo. Se já existe,
o trabalho é *estender ou refatorar*, não criar.

---

## 1. Quem você é

Dev senior Node.js atuando num **SaaS multi-tenant de gestão hoteleira** (PMS), fase TCC,
público-alvo pousadas e hotéis pequenos (5–80 quartos) no Brasil.

**Usuários desta feature:** garçom (lança consumo pelo celular), recepcionista (fecha a conta),
admin (mantém o cardápio).

---

## 2. Stack e restrições — não negociáveis

| Item | Valor |
|---|---|
| Runtime | Node.js 24 · Express 4 |
| Módulos | **ESM sempre** — `import`/`export`, **nunca `require()`** |
| ORM | Sequelize 6 · PostgreSQL 17 |
| PKs | UUID em todas as tabelas |
| Multi-tenancy | `tenant_id` obrigatório em **toda** tabela e **toda** query |
| Auth | JWT `{ userId, role, tenantId }` — `tenantId` vem de `request.user.tenantId`, **nunca do body** |
| Testes | Vitest · portão de cobertura de **60%** no CI |
| Infra | Kubernetes (`k8s/`) — não existe Docker Compose neste projeto |

### Proibido

```
❌ require()                          → ESM sempre
❌ findByPk() em recurso de tenant    → ignora o tenant_id, é vazamento
❌ tenant_id vindo do body ou query   → só do JWT
❌ Gravar em 2+ tabelas sem transação Sequelize
❌ total aceito do cliente            → sempre recalcular no servidor
❌ Blocklist em máquina de estados    → allowlist (fail-safe)
❌ Rota /:id declarada antes de rota literal (/available, /:id/pdf)
❌ Unique global onde deveria ser composto com tenant_id
❌ Commit direto em develop ou main   → sempre branch
❌ git add . ou git add -A            → arquivo por arquivo
❌ Endpoint novo sem Swagger          → quebra o cliente tipado do frontend
```

---

## 3. O que o módulo resolve

O sistema hoje assume `1 reserva = 1 conta = 1 pagamento`. Isso quebra em 4 cenários reais:

1. Família quer lançar drinks e restaurante na conta da suíte
2. Múltiplas suítes da mesma família, contas separadas
3. Dois hóspedes na mesma suíte, contas independentes
4. **Day-use** — cliente sem quarto consome e precisa pagar

A resposta é a abstração `Account` (comanda), que **absorve** o `ConsumptionModel` existente:

```
Product        → cardápio (nome, preço, categoria)
Account        → comanda: ROOM | DAY_USE | TABLE | DIRECT · OPEN | CLOSED | PAID
AccountItem    → linha de consumo (total SEMPRE calculado no servidor)
Payment        → ganha account_id; reservation_id passa a nullable
```

**Decisão de arquitetura já tomada:** `Account` absorve `Consumption`. Não podem coexistir —
dois caminhos de lançamento produziriam um `/bill` que soma errado.

---

## 4. As fatias, em ordem

Spec detalhada (arquivos, schemas, critérios completos) está no plano.
Aqui está o **contrato de execução**: ordem, armadilhas e o que não fazer.

Cada fatia é uma branch própria, com merge próprio. **Nunca acumule duas fatias numa branch.**

---

### Fatia 0 — `fix/backend-prep-frontend` · 1 dia · 🚨 caminho crítico

**O Agente Frontend (J3) está bloqueado até esta fatia entrar em `develop`.** Faça primeiro.

| Item | Onde | Por quê |
|---|---|---|
| Habilitar CORS | `_web.js` / `bootstrap/app.js` | Não existe em lugar nenhum hoje — a primeira requisição do frontend falha |
| `GET /reservations?from=&to=` + paginação | `ListReservationController.js:9` | Hoje faz `findAll` do tenant inteiro com 3 joins. O rack não tem como ser construído |
| Role `WAITER` | `UserModel.js:29`, `middlewares/roleMiddleware.js` | Só existem `ADMIN` e `RECEPTIONIST`. O garçom veria o sistema inteiro |

**Critérios de aceite**
- [ ] Requisição de outra origem recebe os headers CORS corretos
- [ ] `?from=2026-08-01&to=2026-08-31` devolve só o intervalo
- [ ] `?page=1&limit=50` devolve `{ data, total, page, limit }`
- [ ] Chamada sem `from`/`to` continua funcionando (não quebrar quem já consome)
- [ ] `WAITER` recebe 403 em `/rooms`, `/users`, `/analytics`
- [ ] `npm test` verde

**Armadilha:** não mude o formato de resposta de `GET /reservations` sem paginação explícita —
há testes existentes esperando array puro. Pagine só quando `page` ou `limit` vier na query.

---

### Pendências herdadas da Fatia 0

O QA aprovou a Fatia 0 com ressalvas. Estas três ficaram em aberto e **são suas** nas
fatias seguintes. Relatório completo em `docs/qa/redteam_fatia0_02ago2026.md`.

| # | Pendência | Onde resolver |
|---|---|---|
| 1 | **`WAITER` só foi bloqueado em `/rooms`, `/users` e `/analytics`.** Hoje um garçom ainda alcança `GET /reservations` (lista todas com dados de hóspede), `/guests`, `/payments`, check-in/check-out e `/reservations/:id/bill` — muito além de "lança consumo" | **Fatia 2a**, junto com os endpoints de conta. Definir a allowlist do WAITER e fechar o resto |
| 2 | `UpdateUserController` aceita qualquer `role` sem allowlist — o banco rejeita pelo CHECK e o usuário recebe **500** em vez de **400**. Assimetria com o `CreateUserController`, que já valida | Fatia 1 (é barato: reusar `app/utils/roles.js`) |
| 3 | `from`/`to` sem validação de formato — `?from=abc` pode virar 500 | Fatia 1 |

A pendência 1 é a que importa: **é bloqueante para a Fase 2 do frontend** (comanda). Um
garçom com acesso à lista de reservas e ao financeiro não é aceitável em produção. Foi
aceita no merge da Fatia 0 apenas porque a role ainda não tem nenhum usuário nem tela.

---

### Fatia 1 — `feature/product-catalog` · 2 dias · aditiva

CRUD de `Product` (cardápio). Nada existente muda.

**Critérios de aceite**
- [ ] `POST /products` com `name`, `price`, `category` (`FOOD|DRINK|SERVICE|OTHER`)
- [ ] `GET /products?active=true` filtra
- [ ] `DELETE` exige `ADMIN`; `active: false` desativa sem deletar
- [ ] `WAITER` **lê** `/products` (precisa do cardápio) mas não escreve
- [ ] Unique **composto** `[name, tenant_id]` — não global
- [ ] Tenant B não vê produtos do Tenant A
- [ ] `node command.js migrate` cria `products` sem erro
- [ ] Swagger com paths `/products` + schema `Product`

**Armadilha:** `command.js` precisa importar o model novo, senão o sync não cria a tabela.

---

### Fatia 2a — `feature/account-entities` · 3 dias · aditiva

`Account` + `AccountItem` + CRUD + lançamento de item. **Não toque no `ConsumptionModel` ainda.**

**Critérios de aceite**
- [ ] `POST /accounts/:id/items` com `product_id` preenche `description` e `unit_price` do catálogo
- [ ] Sem `product_id`, exige `description` + `unit_price`
- [ ] `total` **sempre** calculado pelo servidor — valor enviado pelo cliente é ignorado
- [ ] Reenvio do mesmo `client_item_id` **não** duplica (idempotência da fila offline do garçom)
- [ ] Resposta do `POST /items` devolve o total atualizado da conta (rodapé fixo do app)
- [ ] `GET /accounts?status=OPEN&type=ROOM` filtra
- [ ] Conta `CLOSED` rejeita item novo → **422**
- [ ] Tenant isolation em `accounts` e `account_items`

**Armadilha:** `database/relations.js` já causou conflito neste projeto. **Acrescente ao final**
da seção — nunca reordene nem reformate o que já está lá.

---

### Fatia 2b — `feature/consumption-migration` · 2–3 dias · ⚠️ migração de dados

`Consumption` vira `AccountItem`. Endpoints antigos passam a gravar via `Account` (deprecated).

Para cada `consumption`: localizar a `Account` tipo `ROOM` da reserva (criar se não existir,
com `label` derivado do quarto e do hóspede) e inserir o `AccountItem` equivalente —
`quantity: 1`, `unit_price = amount`, `product_id: null`.

**Critérios de aceite**
- [ ] Todo `consumption` existente vira `AccountItem` sem perda de valor
- [ ] `created_at` original preservado
- [ ] Soft-deletados preservam `deleted_at` e `deleted_by` (trilha de auditoria financeira)
- [ ] `POST /reservations/:id/consumptions` continua respondendo, gravando via `Account`
- [ ] **`tests/bill-consumptions.test.js` passa sem nenhuma alteração no arquivo**

**Armadilha:** se você precisar editar `tests/bill-consumptions.test.js` para ele passar, você
mudou um contrato que não deveria mudar. Pare e reporte a J1.

---

### Fatia 3a — `feature/account-bill` · 2 dias · aditiva · ✅ ponto de parada seguro

`GET /accounts/:id/bill` e `PUT /accounts/:id/close`.

**Critérios de aceite**
- [ ] `balance = total − payments_made`, calculado em runtime — **nunca persistido**
- [ ] Resposta traz `room_charges`, `consumptions`, `total`, `payments_made`, `balance`, `items`
- [ ] `OPEN → CLOSED` só por este endpoint
- [ ] Tenant isolation

Ao terminar esta fatia, **avise J1**: é aqui que o Agente Frontend é desbloqueado para a
Fase 2 (comanda do garçom).

---

### Fatia 3b — `feature/payment-account-link` · 2–3 dias · 🔴 **ponto de maior risco**

`Payment` ganha `account_id`; `reservation_id` passa a nullable.

**Esta fatia mexe no caminho crítico do motor de reserva direta e do PIX.** O `PaymentModel`
mudou muito desde o plano original — hoje tem `status` (PENDING/PAID/EXPIRED/FAILED),
`kind` (FULL/DEPOSIT/BALANCE), `provider`, `provider_charge_id`, `pix_qr_code`,
`pix_expiration`, `paid_at`.

Arquivos que você vai atingir:
- `app/Controllers/PublicBookingApi/CreateBookingController.js`
- `app/Controllers/WebhookApi/PixWebhookController.js`
- `tests/public-booking.test.js`

**Critérios de aceite**
- [ ] `Payment` aceita `account_id` **ou** `reservation_id`
- [ ] Constraint no banco: `CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL)`
- [ ] Pagamento total → `PAID`; parcial → conta segue `OPEN`
- [ ] **`tests/public-booking.test.js` passa** — fluxo PIX intacto
- [ ] `npm test` completo verde

**Esta fatia vai sozinha na branch.** Nada mais. Se algo quebrar, a causa precisa ser inequívoca.

---

### Fatia 3c — `feature/reservation-bill-delegate` · 1–2 dias · ⚠️ refatoração

`GET /reservations/:id/bill` passa a somar as `Accounts` da reserva em vez de ler `consumptions`.

**Critérios de aceite**
- [ ] **Contrato de resposta idêntico** ao atual
- [ ] `tests/bill-consumptions.test.js` passa sem alteração

---

### Fatia 4 — `feature/split-bill-dayuse` · 3 dias · aditiva

Check-in cria conta automaticamente · split bill · day-use.

**Critérios de aceite**
- [ ] Check-in sem body cria 1 `Account`, `guest_id` e `label` derivados da reserva
- [ ] Check-in com `accounts: [...]` cria N contas **na mesma transação**
- [ ] Falha em qualquer conta faz **rollback do check-in inteiro**
- [ ] `GET /reservations/:id/accounts` lista as contas
- [ ] `POST /accounts` com `type: DAY_USE` e `reservation_id: null` funciona
- [ ] Bill de day-use traz `room_charges: 0`

---

### Fatia 5 — `feature/consumo-seed-swagger` · 2 dias

- `seed/seed_consumo.sql` — cardápio para os dois tenants + contas abertas de exemplo,
  incluindo uma day-use. Padrão **idempotente `NOT EXISTS`**, igual ao `seed_hotels.sql`
- Swagger completo de `/products` e `/accounts` — **obrigatório**, o cliente tipado do frontend
  é gerado dele
- `tests/tenant-isolation.test.js` expandido com `Account` e `Product`
- Cobertura ≥ 60% (portão do CI)

---

## 5. Ciclo obrigatório por fatia

```
1. cd ~/hotel-j2
2. git fetch origin
3. git checkout -b <branch-da-fatia> origin/develop
4. Implementar em commits lógicos (Conventional Commits)
5. npm run qa:checks  → sem erro bloqueante
6. npm test           → tudo verde
7. Rodar o QA Red Team (abaixo)
8. Corrigir todos os 🔴; decidir sobre os 🟡
9. Se corrigiu → voltar ao passo 5
10. git push -u origin <branch-da-fatia>
11. Atualizar o quadro em docs/COORDENACAO_AGENTES.md §6 → 🟢 PRONTO PARA MERGE
12. Avisar J1
```

Na Fatia 0 pule os passos 2–3: você já está na branch. Comece pelo 4.

**Você não faz merge em `develop`.** Quem integra é J1. Isso evita que três janelas disputem
a mesma branch.

### O portão tem duas camadas

| Camada | O quê | Quando |
|---|---|---|
| **1 — Determinística** | `scripts/qa_checks.sh` | Automática no CI a cada push. Local: `npm run qa:checks` |
| **2 — Semântica** | Subagente `qa-redteam` | Manual, ao terminar a fatia |

**Camada 1** pega violação objetiva e **reprova o build**: `require()`, `findByPk()` em recurso
de tenant, `tenant_id` lido do body/query, rota literal depois de `/:param`, log com objeto de
requisição (PII), `include` de model sensível sem `attributes`, router fora do Swagger.

O CI agora dispara em `feature/**` e `fix/**` — antes só rodava em `main` e `develop`, então
branch de agente não era verificada até o merge. **Sua branch vai rodar CI a cada push.**

Escape pontual, quando a violação for justificada:

```js
const r = await Model.findByPk(id); // qa-allow: findByPk
```

Rode `npm run qa:checks` **antes de commitar**, não depois de pushar. Leva 2 segundos.

### Camada 2 — QA Red Team, obrigatório antes de avisar J1

```
Use a ferramenta Agent com subagent_type "qa-redteam" e o prompt:

"Audite a branch <nome>, comparando com develop.
Feature entregue: <uma linha>.
Critérios de aceite que eu deveria ter cumprido: <cole os critérios da fatia>.
Grave o relatório em docs/qa/redteam_<fatia>_<ddMMyyyy>.md."
```

O agente está em `.claude/agents/qa-redteam.md`. Ele audita multi-tenancy, LGPD, SOLID, DRY,
KISS, regras do `CLAUDE.md`, UI/UX e testes. **Ele não corrige nada** — quem corrige é você.

| Veredito | O que fazer |
|---|---|
| **REPROVADO** (tem 🔴) | Corrija e reaudite. Não avise J1 |
| **APROVADO COM RESSALVAS** (🟡) | Corrija o barato; registre o resto como pendência e avise J1 |
| **APROVADO** | Atualize o quadro e avise J1 |

---

## 6. Contratos de output

Por fatia:

| Output | Onde |
|---|---|
| Branch com commits lógicos | `feature/*` ou `fix/*` a partir de `develop` |
| Camada 1 sem erro | `npm run qa:checks` |
| Suíte verde | `npm test` |
| CI verde na branch | GitHub Actions (dispara automático no push) |
| Relatório do QA | `docs/qa/redteam_<fatia>_<ddMMyyyy>.md` |
| Swagger atualizado | `config/swagger.js` |
| Quadro de status atualizado | `docs/COORDENACAO_AGENTES.md` §6, commit isolado `docs(coord):` |

Ao final do módulo inteiro:

| Output | Onde |
|---|---|
| Relatório de sessão | `docs/historico_sessao/gabriel/modulo_consumo_<ddMMyyyy>.md` |
| Status das fatias atualizado | Plano de consumo, seção "Status das fatias" |

---

## 7. Quando parar e perguntar

Não improvise. Marque 🔴 BLOQUEADO no quadro e avise J1 se:

- Um teste existente só passa se você **editar o teste**
- A migração da 2b encontrar dado inconsistente que você não sabe como tratar
- A 3b quebrar o fluxo PIX e a correção exigir mudar o contrato do webhook
- Você precisar editar arquivo fora do seu escopo (`apps/`, `packages/`, `k8s/`, `CLAUDE.md`)
- O plano contradizer o que você encontrou no código — **o código é a verdade**, o plano
  já esteve errado uma vez

---

## 8. Ordem de execução — resumo

```
0    fix/backend-prep-frontend          🚨 primeiro, desbloqueia o frontend
1    feature/product-catalog
2a   feature/account-entities
2b   feature/consumption-migration      ⚠️ migração de dados
3a   feature/account-bill               ✅ parada segura · avisar J1
3b   feature/payment-account-link       🔴 risco PIX · branch isolada
3c   feature/reservation-bill-delegate  ⚠️ refatoração
4    feature/split-bill-dayuse
5    feature/consumo-seed-swagger
```

**Estimativa total:** ~19 dias.

---

## 9. Referências

| Documento | Para quê |
|---|---|
| `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` | Estado real da base |
| `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` | Spec detalhada das fatias |
| `docs/historico_sessao/gabriel/analise_gaps_consumo_02ago2026.md` | Por que o módulo existe |
| `docs/COORDENACAO_AGENTES.md` | Coordenação entre as 3 janelas |
| `docs/frontend/PLANEJAMENTO_FRONTEND.md` §8 | O que o frontend espera desta API |
| `CLAUDE.md` · `docs/CODING_STANDARDS.md` | Padrões de código e Git |
