# Coordenação de Agentes — 3 janelas Claude Code

**Vigente desde:** 02/08/2026
**Repositório canônico:** `~/sistema_gestao_hotel` (WSL) · branch base `develop`

---

## 1. Papéis

| Janela | Papel | Responsabilidade |
|---|---|---|
| **J1** | **Orquestrador** (Gabriel + Claude) | Planeja, divide tarefas, resolve conflitos, revisa QA, faz o merge final em `develop` e o PR para `main` |
| **J2** | **Agente BACKEND** | Módulo de consumo (Sprints 0–5) — `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` |
| **J3** | **Agente FRONTEND** | `app-pms` (Fases 0–4) — `docs/frontend/PLANEJAMENTO_FRONTEND.md` §11 |

**J2 e J3 não fazem merge em `develop`.** Entregam a branch pronta e auditada; quem integra é J1.
Isso existe para que ninguém sobrescreva o trabalho do outro em `develop`.

---

## 2. Como nos comunicamos

As três janelas são processos separados — não trocam mensagem direta. A comunicação acontece
por **três canais, nesta ordem de autoridade**:

### Canal 1 — Este arquivo (quadro de status, §6)
Fonte da verdade sobre quem está fazendo o quê.

```
Ao COMEÇAR uma tarefa:  git pull origin develop
                        atualiza a sua linha no quadro (§6) → 🟡 EM ANDAMENTO
                        commit + push do quadro
Ao TERMINAR:            atualiza a linha → 🟢 PRONTO PARA MERGE (ou 🔴 BLOQUEADO)
                        commit + push do quadro
```

O quadro é commitado sozinho, em `docs(coord):`, **nunca junto com código**. Assim ele quase
nunca conflita — e se conflitar, resolver é trivial.

### Canal 2 — Git
- Cada agente na sua branch, sempre a partir de `develop` atualizado
- `git pull origin develop` **antes de criar a branch** e **antes de pedir merge**
- A branch é o entregável

### Canal 3 — Relatório de sessão
Ao fim da tarefa, `docs/historico_sessao/<dev>/<titulo>_<ddMMyyyy>.md`, com o que ficou pendente
e o contexto que o próximo precisa.

### Regra de bloqueio
Se J3 precisa de algo que só J2 pode entregar, **não implemente um paliativo**. Marque
🔴 BLOQUEADO no quadro dizendo exatamente o que falta, e siga para a próxima tarefa
independente da lista. J1 resolve a prioridade.

---

## 3. Divisão de trabalho e dependências

```
J2 BACKEND                                  J3 FRONTEND
──────────────────────────────────────────────────────────────────────
0   prep: CORS, ?from=&to=, paginação,      Fase 0  monorepo + design system
    role WAITER                                     (não depende de API)
                    │                                       │
                    └───────────── desbloqueia ─────────────┤
                                                            ▼
1   product-catalog                         Fase 1  rack, reservas, check-in/out,
2a  account-entities                                hóspedes, quartos
2b  consumption-migration
3a  account-bill  ← parada segura                           │
                    │                                       │
                    └───────────── desbloqueia ─────────────┤
                                                            ▼
3b  payment-account-link   [risco: PIX]     Fase 2  comanda do garçom
3c  reservation-bill-delegate               Fase 3  financeiro + analytics
4   split-bill-dayuse                       Fase 4  grupos (B2B)
5   seed-swagger
```

**A fatia 0 é o caminho crítico.** Enquanto não estiver em `develop`, J3 fica na Fase 0 —
que é justamente a parte que não toca a API.

**A Fase 2 do frontend depende da 3a**, não do módulo inteiro: com catálogo, contas e bill,
o app do garçom já tem o que consumir.

---

## 4. Propriedade de arquivos

Com esta divisão o overlap é quase nulo: J3 trabalha em diretório novo.

| Área | Dono | Observação |
|---|---|---|
| `apps/`, `packages/` (frontend) | **J3** | Diretório novo — J2 não entra |
| `app/`, `routes/`, `database/`, `db/`, `seed/`, `tests/` | **J2** | J3 não entra |
| `docs/frontend/` | J3 | |
| `docs/historico_sessao/<dev>/` | cada um no seu | |
| `docs/COORDENACAO_AGENTES.md` | ambos | Só a própria linha do quadro |
| `CLAUDE.md`, `.gitignore`, `k8s/` | **J1** | Peça a J1, não edite |

### Arquivos de registro — alto risco de conflito

Estes acumulam entradas de vários módulos e **já causaram conflito neste projeto**
(`relations.js`, no merge do B2B):

```
database/relations.js
routes/router.js
command.js
config/swagger.js
package.json
```

Regra: **só J2 os edita** durante as sprints de consumo. Sempre **acrescentando ao final** da
seção pertinente — nunca reordenando ou reformatando o que já existe. Reordenar transforma um
conflito de 2 linhas num conflito de arquivo inteiro.

---

## 5. Ciclo de entrega — o portão do QA

Todo agente segue este ciclo. **Nenhuma branch vai para `develop` sem passar pelo `qa-redteam`.**

```
1. git pull origin develop
2. git checkout -b <tipo>/<nome>
3. Implementar em commits lógicos (Conventional Commits)
4. npm test  → tudo verde
5. Rodar o QA Red Team (abaixo)
6. Corrigir todos os 🔴 e decidir sobre os 🟡
7. Se houve correção → voltar ao passo 4
8. Atualizar o quadro (§6) → 🟢 PRONTO PARA MERGE
9. Avisar J1. J1 faz o merge.
```

### Como invocar o QA Red Team

Ao terminar a feature, na sua própria janela:

```
Use a ferramenta Agent com subagent_type "qa-redteam" e o prompt:

"Audite a branch <nome-da-branch>, comparando com develop.
Feature entregue: <descrição em uma linha>.
Critérios de aceite que eu deveria ter cumprido: <cole os critérios da sprint/fase>.
Grave o relatório em docs/qa/redteam_<feature>_<ddMMyyyy>.md."
```

O agente está definido em `.claude/agents/qa-redteam.md` e audita: multi-tenancy, LGPD,
SOLID, DRY, KISS, regras do `CLAUDE.md`, UI/UX e testes.

### O que fazer com o veredito

| Veredito | Ação |
|---|---|
| **REPROVADO** (tem 🔴) | Corrigir e reauditar. Não avise J1 ainda |
| **APROVADO COM RESSALVAS** (🟡) | Corrigir o que for barato. O que ficar, registre como pendência no relatório de sessão e avise J1 |
| **APROVADO** | Atualize o quadro e avise J1 |

O `qa-redteam` **não corrige nada** — quem corrige é o dono da branch. Isso é proposital: separa
quem escreve de quem audita.

---

## 6. Quadro de status

> Atualize **apenas a sua linha**. Commit isolado, mensagem `docs(coord): <o que mudou>`.

| Agente | Tarefa atual | Branch | Status | Atualizado em |
|---|---|---|---|---|
| J1 Orquestrador | Planejamento e setup da coordenação | `docs/planejamento-frontend-briefing` | 🟢 PRONTO PARA MERGE | 02/08/2026 |
| J2 Backend | Sprint 0 — pré-requisitos de backend | `fix/backend-prep-frontend` | ⚪ NÃO INICIADO | — |
| J3 Frontend | Fase 0 — monorepo e design system | `feature/frontend-fase0-fundacao` | ⚪ NÃO INICIADO | — |

Legenda: ⚪ não iniciado · 🟡 em andamento · 🔵 em auditoria QA · 🟢 pronto para merge ·
🔴 bloqueado · ✅ mergeado

### Bloqueios ativos

_(nenhum)_

---

## 7. Prompt de abertura de cada janela

Cole no início da janela correspondente.

### J2 — Agente Backend

```
Você é o Agente BACKEND (J2) do projeto PMS Hotel SaaS.

Leia nesta ordem, antes de qualquer coisa:
1. docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md   ← corrige premissas erradas, leia inteiro
2. docs/COORDENACAO_AGENTES.md                  ← como nos coordenamos
3. CLAUDE.md e docs/CODING_STANDARDS.md
4. docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md

ATENÇÃO: documentos anteriores afirmavam que não existe modelo de consumo.
Está ERRADO. A develop já tem ConsumptionModel, os endpoints
/reservations/:id/consumptions, o GetBillController e tests/bill-consumptions.test.js.
Antes de criar qualquer arquivo, verifique se ele já existe.

Sua tarefa agora: Sprint 0 — branch fix/backend-prep-frontend
  1. Habilitar CORS (hoje não existe em lugar nenhum — bloqueia o frontend inteiro)
  2. GET /reservations com ?from=&to= e paginação
     (hoje ListReservationController.js:9 faz findAll do tenant inteiro com 3 joins)
  3. Criar a role WAITER (hoje só existem ADMIN e RECEPTIONIST)

Critérios de aceite: plano de consumo, seção "Sprint 0".

Sprint 0 é o caminho crítico — o Agente Frontend está bloqueado até ela entrar em develop.

Ao terminar: npm test, depois rode o subagente qa-redteam conforme
docs/COORDENACAO_AGENTES.md §5. Corrija os 🔴, atualize o quadro (§6) e me avise.
NÃO faça merge em develop.
```

### J3 — Agente Frontend

```
Você é o Agente FRONTEND (J3) do projeto PMS Hotel SaaS.

Leia nesta ordem, antes de qualquer coisa:
1. docs/frontend/PLANEJAMENTO_FRONTEND.md       ← seu plano completo, leia inteiro
2. docs/COORDENACAO_AGENTES.md                  ← como nos coordenamos
3. CLAUDE.md e docs/CODING_STANDARDS.md

Sua tarefa agora: Fase 0 — branch feature/frontend-fase0-fundacao
  1. Monorepo pnpm + Turborepo com apps/pms, apps/booking, apps/admin,
     packages/{ui,api-client,domain,config}
  2. apps/pms: React + TypeScript + Vite + Tailwind + shadcn/ui
  3. packages/ui: design system base conforme §10 do plano
     (cores de status, densidade compact/comfortable, alvo de toque 48px)
  4. packages/domain: tratamento de dinheiro (DECIMAL chega como STRING do pg —
     nunca Number()) e de datas (fuso America/Sao_Paulo fixo)
  5. packages/api-client: gerar tipos do OpenAPI em config/swagger.js
  6. Tela de login contra POST /auth/login + rota protegida por role

NÃO toque em app/, routes/, database/, db/, seed/ nem tests/ — são do Agente Backend.

Você está BLOQUEADO para integração real de API até a Sprint 0 do backend entrar em
develop (CORS não existe ainda). Isso não impede a Fase 0: faça o scaffolding e o
design system, e use mock no que precisar de dado.

Ao terminar: rode o subagente qa-redteam conforme docs/COORDENACAO_AGENTES.md §5.
Corrija os 🔴, atualize o quadro (§6) e me avise. NÃO faça merge em develop.
```

---

## 8. Regras que valem para as três janelas

- Branch sempre a partir de `develop` atualizado — nunca de `main`, nunca de outra feature
- **Nunca** commitar direto em `develop` ou `main`
- **Nunca** `git add .` ou `git add -A` — arquivo por arquivo
- **Nunca** commitar `.env` ou secret
- **Nunca** `git push --force`
- Conventional Commits, em commits lógicos separados
- ESM sempre (`import`/`export`), nunca `require()`
- `tenant_id` em toda query
- Transação Sequelize quando gravar em 2+ tabelas
- Swagger atualizado a cada endpoint novo — o cliente tipado do frontend é gerado dele
- Relatório de sessão ao encerrar

---

## 9. Documentos de referência

| Documento | Para quê |
|---|---|
| `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` | Estado real da base e correção de premissas |
| `docs/frontend/PLANEJAMENTO_FRONTEND.md` | Mercado, stack, telas, roadmap do frontend |
| `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` | Sprints do consumo |
| `.claude/agents/qa-redteam.md` | Definição do auditor |
| `CLAUDE.md` · `docs/CODING_STANDARDS.md` | Regras de código e Git |
