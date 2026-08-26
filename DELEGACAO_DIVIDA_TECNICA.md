# Delegação — Dívida Técnica (SPEC-06)

**Data:** 26/08/2026
**Orquestrador:** Gabriel (J1)
**Para:** Agente Executor — trabalha na **raiz do projeto** (`~/sistema_gestao_hotel`)
**Spec de referência:** `docs/specs/SPEC-06-qualidade-divida-tecnica.md`
**Branch base:** `develop` @ `f9f0361`

---

## Prompt de abertura — cole isto na janela do agente

```
Você é o Agente Executor de dívida técnica do projeto Gesway (PMS hoteleiro SaaS).

Trabalhe na raiz do projeto: ~/sistema_gestao_hotel — atualmente em develop.
Rode git sempre pelo WSL.

Leia, nesta ordem, antes de escrever qualquer código:
1. DELEGACAO_DIVIDA_TECNICA.md          ← esta delegação, leia inteira
2. docs/specs/SPEC-06-qualidade-divida-tecnica.md
3. CLAUDE.md e docs/CODING_STANDARDS.md

ATENÇÃO — o PASSO 0 é bloqueante. A suíte de testes não roda desde 07/08
(19 dias). Não sabemos se develop está verde nem qual é a cobertura real.
NÃO corrija nada antes de estabelecer o baseline verificado. Se a suíte já
estiver quebrada, PARE e reporte — não tente consertar por conta própria.

Execute na ordem definida na seção 6 desta delegação. Cada etapa em branch
própria, com merge próprio. Ao terminar cada uma: npm run qa:checks, npm test,
depois o subagente qa-redteam. NÃO faça merge em develop nem promova para main
— quem integra é o orquestrador.

Comece executando o PASSO 0 e me reportando os números reais.
```

---

## 1. Contexto do produto

**Gesway** — sistema de gestão hoteleira (PMS) SaaS multi-tenant, para hotéis e pousadas de 5 a 80 quartos. É também Projeto Experimental acadêmico (4º semestre), com critérios de aceite formais.

O backend está maduro: reservas com anti-*double-booking* garantido no banco, check-in/out, pagamentos com PIX, módulo B2B de orçamentos e contratos, analytics, catálogo de produtos. O frontend tem fundação e CRUD de hóspedes.

**Esta delegação não entrega funcionalidade nova.** Entrega estabilidade: corrige dívida acumulada que, se ignorada, vira erro em produção e problema na defesa.

---

## 2. Stack e restrições — não negociáveis

| Item | Valor |
|---|---|
| Runtime | Node.js **24** · Express 4 |
| Módulos | **ESM sempre** — `import`/`export`, nunca `require()` |
| ORM | Sequelize 6 · PostgreSQL 17 |
| Multi-tenancy | `tenant_id` obrigatório em **toda** query, vindo **só do JWT** |
| Testes | Vitest + Supertest |
| Infra | Kubernetes (minikube local) — **não existe** Docker Compose ainda |

### Proibido

```
❌ require()                            → ESM sempre
❌ findByPk() em recurso de tenant      → ignora tenant_id, é vazamento
❌ tenant_id vindo do body ou query     → só do JWT
❌ Gravar em 2+ tabelas sem transação Sequelize
❌ Commit direto em develop ou main     → sempre branch
❌ git add . ou git add -A              → arquivo por arquivo
❌ Commitar .env ou qualquer segredo
❌ Baixar o portão de cobertura para fazer o CI passar
```

---

## 3. Armadilhas do ambiente — leia antes de rodar qualquer comando

Estas custaram tempo real em sessões anteriores.

### 3.1 Node e npm resolvem errado

Em shell **não-interativo**, o PATH deste WSL resolve:

| Comando | Resolve para | Deveria ser |
|---|---|---|
| `node` | `/usr/bin/node` → **v18.19.1** | v24 |
| `npm` | `/mnt/c/Program Files/nodejs/npm` → **npm do Windows** | npm do Linux |

Carregue o nvm **antes de qualquer comando npm**:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
node --version    # tem que responder v24.x
```

### 3.2 Pipe mascara exit code

`npm ci | tail -3` devolve o exit code do `tail`, **não do npm**. O comando parece ter dado certo mesmo tendo falhado. Já aconteceu neste projeto.

### 3.3 Os testes precisam do Postgres do cluster

```bash
minikube start
./start.sh up                                          # sobe a stack
kubectl port-forward -n hotel-system svc/postgres 5432:5432 &
```

O banco de teste é `gestao_hotel_test`, criado pelo `globalSetup` com `sync({ force: true })` — **não** por `migrate`. As constraints vêm de `database/applyDbConstraints.js`, chamado pelos dois caminhos.

### 3.4 ⚠️ Regra absoluta de custo

Não há AWS nesta delegação — tudo é local. **Se em algum momento for necessário provisionar recurso em nuvem, PARE e escale.** O projeto opera sob regra de permanecer no free-tier e destruir recursos imediatamente após o uso.

---

## 4. O que já existe — não reimplementar

| Recurso | Onde |
|---|---|
| Portão de QA determinístico (7 checagens) | `scripts/qa_checks.sh` · `npm run qa:checks` |
| Subagente auditor adversarial | `.claude/agents/qa-redteam.md` |
| CI com testes e cobertura | `.github/workflows/ci.yml` |
| Constraints de banco compartilhadas | `database/applyDbConstraints.js` |
| Utilitário de validação de UUID | `app/utils/isUuid.js` |
| Allowlists centralizadas | `app/utils/roles.js` · `app/utils/productCategories.js` |
| 16 arquivos de teste | `tests/` |

**Antes de criar qualquer arquivo, verifique se já existe.**

---

## 5. Padrão de referência — o índice parcial

A correção do `ProductModel` é o **modelo a seguir** nas tarefas desta delegação. Estude antes de começar:

```js
// app/Models/ProductModel.js
indexes: [{
    unique: true,
    fields: ['tenant_id', 'name'],
    name: 'products_name_tenant_unique',
    where: { deleted_at: null }   // ← índice PARCIAL
}]
```

E o tratamento correspondente no controller: `UniqueConstraintError` → **409**, nunca 500.

---

## 6. Tarefas, em ordem

> Cada etapa em branch própria. Não acumule duas etapas numa branch.

### PASSO 0 — Baseline verificado ⛔ **BLOQUEANTE**

**Nenhuma correção começa antes disto.** A suíte não roda desde 07/08 e não sabemos o estado real.

```bash
minikube start
./start.sh up
kubectl port-forward -n hotel-system svc/postgres 5432:5432 &
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
npm run qa:checks
npm run test:coverage
```

**Reportar ao orquestrador, sem corrigir nada:**

- [ ] `npm run qa:checks` — exit code e avisos
- [ ] `npm test` — quantos passam, quantos falham, quais arquivos
- [ ] **Cobertura real:** `statements`, `lines`, `functions`, `branches` — os quatro números
- [ ] `branches` está acima ou abaixo de 60%?

> **Se a suíte estiver vermelha, PARE e reporte.** Uma suíte quebrada há 19 dias pode ter causa em qualquer um dos 62 commits não promovidos. Diagnosticar isso é decisão do orquestrador, não tarefa desta delegação.

---

### PASSO 1 — Vazamento em endpoint público 🔴 segurança

**Branch:** `fix/public-booking-payment-leak`

**Problema:** `app/Controllers/PublicBookingApi/GetBookingStatusController.js:21` faz `include: [{ model: PaymentModel, as: 'payments' }]` **sem `attributes`**, num endpoint **público, sem autenticação**. Devolve o `Payment` inteiro — incluindo `pix_qr_code`, `provider_charge_id` e `provider`.

**Critérios de aceitação**
- [ ] `attributes` explícito, expondo apenas o necessário ao status da reserva
- [ ] `pix_qr_code` e `provider_charge_id` **não** retornados sem autenticação
- [ ] Teste garantindo que os campos sensíveis não aparecem na resposta
- [ ] `npm run qa:checks` sem o aviso correspondente
- [ ] `tests/public-booking.test.js` continua passando

> Decida o que o hóspede legitimamente precisa ver para acompanhar a reserva dele. Provavelmente `status`, `amount` e `paid_at` — nada de identificador do provedor.

---

### PASSO 2 — Falha sistêmica: `paranoid` + unique total 🔴

**Branch:** `fix/paranoid-unique-constraints`

**Este é o passo mais importante da delegação.** Não é um bug, é um padrão que já apareceu **três vezes**:

| Onde | Estado |
|---|---|
| `products` — unique total em model `paranoid` | ✅ corrigido |
| `reservations` — EXCLUDE ignorando canceladas | ✅ corrigido — **era bug de produção** |
| `room_categories` — unique total em model `paranoid` | 🔲 **aberto** |

**O mecanismo, sempre igual:** o model é `paranoid: true`, o índice único é total. Ao excluir um registro, a linha morta continua no índice. O guard da aplicação não a enxerga (escopo paranoid diz que não existe), então quem barra é o Postgres — e o erro cai no catch genérico, virando **500**. Na prática: **o nome fica queimado para sempre**, sem endpoint de restore.

**Corrigir a ocorrência não basta.** O próximo model `paranoid` com unique vai repetir.

**Critérios de aceitação**
- [ ] **Auditar todos** os models com `paranoid: true` **e** índice `unique`, listando quais têm o defeito
- [ ] Corrigir cada um com índice parcial `where: { deleted_at: null }`, no model **e** no `db/schema.sql`
- [ ] `UniqueConstraintError` → **409** nos controllers correspondentes
- [ ] Teste do ciclo criar → deletar → **recriar com o mesmo nome** para cada model corrigido
- [ ] **Regra nova no `scripts/qa_checks.sh`** que detecta model `paranoid` com unique sem índice parcial e **reprova o build**
- [ ] A regra nova não gera falso positivo na base atual — rodar e confirmar exit 0
- [ ] Suíte completa verde

> A regra no `qa_checks.sh` é o entregável mais valioso aqui: transforma dívida recorrente em erro de build. Sem ela, isto volta.

> **Cuidado:** alterar índice em banco existente é silencioso. `sync({alter})` não substitui índice de mesmo nome e o `IF NOT EXISTS` do SQL é *no-op*. Se precisar, derrube a tabela no banco de teste para o sync recriar — e registre isso no relatório.

---

### PASSO 3 — Portão de cobertura

**Branch:** `chore/coverage-gate-60`

**DEP:** PASSO 0 (precisa dos números reais)

**Problema:** o Termo de Aceite exige cobertura mínima de **60%**. O `vitest.config.js` define `branches: 55` — abaixo do exigido.

**Critérios de aceitação**
- [ ] `branches` elevado para **60** no `vitest.config.js`
- [ ] Cobertura real confirmada acima do portão, com a suíte executada
- [ ] Se ficar abaixo: **escrever testes até passar**. Não baixar o portão
- [ ] `npm run test:coverage` verde localmente

> Se a diferença for grande (por exemplo, `branches` real em 52%), **pare e reporte** antes de escrever dezenas de testes. Pode ser mais eficiente priorizar quais ramos cobrir.

---

### PASSO 4 — Schema de resposta no Swagger

**Branch:** `docs/swagger-response-schemas`

**Problema medido:** de 53 respostas 2xx (excluindo 204), **42 não declaram `content`** — **79% sem schema**. O cliente TypeScript gerado do OpenAPI devolve `never` no corpo, forçando `as unknown as Guest` no frontend.

**A promessa de tipagem ponta a ponta só vale para 21% da API.**

**Critérios de aceitação**
- [ ] Todas as respostas 2xx dos endpoints do núcleo declaram `content` com `$ref`: `/auth/login`, `/guests`, `/rooms`, `/room-categories`, `/reservations`, `/users`, `/tenants/me`
- [ ] Schemas em `components.schemas`, reutilizados — **sem cópia literal**
- [ ] Nenhuma allowlist duplicada: importar de `app/utils/`, como `config/swagger.js` já faz com `PRODUCT_CATEGORIES` e `VALID_ROLES`
- [ ] `DECIMAL` documentado como **string**, não number — é como o driver `pg` entrega
- [ ] Swagger carrega sem erro; contagem de respostas sem schema **cai de 42 para ≤ 10**

> É o maior bloco desta delegação, mas mecânico. Não altera comportamento — só documenta o que a API já devolve. **Verifique a resposta real de cada endpoint** antes de documentar; não deduza pelo nome.

---

### PASSO 5 — Docker Compose de contingência

**Branch:** `chore/docker-compose-contingencia`

**Problema:** o Termo de Aceite prevê demonstração local via Docker Compose caso a internet falhe na defesa, e exige os arquivos *"atualizados e funcionais no repositório"*. **Não existe nenhum `docker-compose*.yml`** — o projeto migrou para Kubernetes.

**Critérios de aceitação**
- [ ] `docker-compose.yml` subindo backend, Postgres, Redis e MinIO
- [ ] `docker compose up` funciona a partir de repositório recém-clonado
- [ ] `migrate` e `seed` executáveis no compose
- [ ] Frontend incluído, ou instrução clara de como subir junto
- [ ] **Testado de verdade** — subir, acessar `/health`, fazer login, listar quartos
- [ ] README documentando o procedimento de contingência
- [ ] Sem segredo versionado; usar `.env.example`

> Não é opcional. É a rede de segurança da defesa. **"Escrito mas não testado" não conta** — o critério é subir e usar.

---

## 7. Ciclo obrigatório por etapa

```
1. git checkout develop && git pull origin develop
2. git checkout -b <branch-da-etapa>
3. Implementar em commits lógicos (Conventional Commits)
4. npm run qa:checks   → sem erro bloqueante
5. npm test            → tudo verde
6. Rodar o subagente qa-redteam
7. Corrigir todos os 🔴; decidir sobre os 🟡
8. Se corrigiu → voltar ao passo 4
9. git push -u origin <branch>
10. Avisar o orquestrador
```

**Você não faz merge em `develop` nem promove para `main`.** Quem integra é o orquestrador.

### Portão de QA

Ao terminar cada etapa:

```
Use a ferramenta Agent com subagent_type "qa-redteam" e o prompt:

"Audite a branch <nome>, comparando com develop.
Feature entregue: <uma linha>.
Critérios de aceite que eu deveria ter cumprido: <cole os critérios da etapa>.
Grave o relatório em docs/qa/redteam_<etapa>_<ddMMyyyy>.md."
```

| Veredito | Ação |
|---|---|
| **REPROVADO** (tem 🔴) | Corrija e reaudite. Não avise o orquestrador ainda |
| **APROVADO COM RESSALVAS** (🟡) | Corrija o barato; registre o resto e avise |
| **APROVADO** | Avise o orquestrador |

O `qa-redteam` **não corrige nada** — quem corrige é você. É proposital: separa quem escreve de quem audita.

---

## 8. Contratos de output

Por etapa:

| Output | Onde |
|---|---|
| Branch com commits lógicos | `fix/*`, `chore/*` ou `docs/*` a partir de `develop` |
| Camada 1 sem erro | `npm run qa:checks` |
| Suíte verde | `npm test` |
| Relatório do QA | `docs/qa/redteam_<etapa>_<ddMMyyyy>.md` |

Ao final da delegação:

| Output | Onde |
|---|---|
| Relatório de sessão | `docs/historico_sessao/gabriel/divida_tecnica_<ddMMyyyy>.md` |
| SPEC-06 atualizada | Marcar as tarefas concluídas com evidência |

---

## 9. Quando parar e escalar

Não improvise. Pare e reporte se:

- **A suíte estiver vermelha no PASSO 0** — diagnosticar 62 commits não é tarefa desta delegação
- **A cobertura real estiver muito abaixo de 60%** em `branches` — pode exigir replanejamento
- Um teste existente só passar se você **editar o teste**
- Corrigir o índice parcial exigir alterar dado em banco com informação real
- A regra nova do `qa_checks.sh` gerar falso positivo que você não consegue eliminar sem afrouxá-la
- Precisar provisionar qualquer recurso em nuvem

---

## 10. Fora do escopo desta delegação

Registrado para não haver dúvida:

| Item | Por quê |
|---|---|
| Promover `develop` → `main` | Decisão do orquestrador, **depois** que estas correções entrarem |
| T-06.6 (ressalva R4 do índice em banco existente) | Risco baixo hoje — a tabela `products` nem existe no cluster |
| T-06.7 (refresh token do JWT) | **Não é dívida técnica** — é decisão de arquitetura sobre sessão. Vai virar ADR |
| Qualquer coisa das SPEC-01 a SPEC-05 | Outras frentes |

---

## 11. Referências

| Documento | Para quê |
|---|---|
| `docs/specs/SPEC-06-qualidade-divida-tecnica.md` | Spec completa desta frente |
| `docs/specs/README.md` | Índice das Specs e grafo de dependências |
| `CLAUDE.md` · `docs/CODING_STANDARDS.md` | Padrões de código e Git |
| `.claude/agents/qa-redteam.md` | Definição do auditor |
| `docs/qa/redteam_fatia1_07ago2026.md` | Exemplo de auditoria — mostra o nível esperado |
