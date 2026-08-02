# Coordenação de Agentes — 3 janelas Claude Code

**Vigente desde:** 02/08/2026
**Repositório canônico:** `~/sistema_gestao_hotel` (WSL) · branch base `develop`

---

## 1. Papéis e onde cada um trabalha

| Janela | Papel | Diretório | Responsabilidade |
|---|---|---|---|
| **J1** | **Orquestrador** | `~/sistema_gestao_hotel` | Planeja, divide tarefas, resolve conflitos, revisa QA, faz o merge em `develop` e o PR para `main` |
| **J2** | **Agente BACKEND** | `~/hotel-j2` | Módulo de consumo — `docs/delegacoes/modulo_consumo_02ago2026.md` |
| **J3** | **Agente FRONTEND** | `~/hotel-j3` | `app-pms` — `docs/frontend/PLANEJAMENTO_FRONTEND.md` §11 |

**J2 e J3 não fazem merge em `develop`.** Entregam a branch pronta e auditada; quem integra é J1.
Isso existe para que ninguém sobrescreva o trabalho do outro em `develop`.

---

## 1.1 Git worktree — leia antes do primeiro comando

As três janelas compartilham **um único repositório**. Não são clones separados.

```
~/sistema_gestao_hotel   → repo principal, sempre em develop   (J1)
~/hotel-j2               → worktree                            (J2)
~/hotel-j3               → worktree                            (J3)
        └── todos apontam para o MESMO .git
```

Isso existe porque dois clones separados divergem silenciosamente — foi o que fez um agente
concluir que "não existe `ConsumptionModel`" trabalhando numa base 106 commits atrasada, e
depois não encontrar a própria delegação. Com worktree há um só conjunto de refs: o que um
`fetch` traz, todos enxergam.

### A regra que muda tudo

**A mesma branch não pode estar em duas worktrees ao mesmo tempo.** Como `develop` está
checada no repo principal, **você não consegue fazer `git checkout develop`** — e não precisa.

```bash
# ❌ NÃO funciona na sua worktree
git checkout develop && git pull

# ✅ Use isto para começar uma branch nova
git fetch origin
git checkout -b <nova-branch> origin/develop
```

`origin/develop` é a referência remota atualizada pelo `fetch` — você parte sempre do estado
mais recente sem precisar de uma cópia local de `develop`.

### Outras regras da worktree

- **Rode git sempre pelo WSL.** O `.git` da worktree é um ponteiro para um caminho Linux
  (`/home/gabri/...`). Git do Windows não resolve esse caminho e corrompe o estado.
- `node_modules/` e `.env` **não** são compartilhados — cada worktree tem os seus. Já foram
  provisionados; se precisar refazer, veja a armadilha do Node abaixo antes.
- Nunca apague o diretório da worktree na mão. Se precisar remover:
  `git worktree remove ~/hotel-jX` a partir do repo principal.
- Para ver o estado geral: `git worktree list` (funciona de qualquer uma das três).

### ⚠️ Armadilha do Node neste ambiente

Em shell **não-interativo** o PATH deste WSL resolve errado:

| Comando | Resolve para | Deveria ser |
|---|---|---|
| `node` | `/usr/bin/node` → **v18.19.1** | v24 |
| `npm` | `/mnt/c/Program Files/nodejs/npm` → **npm do Windows** | npm do Linux |

O projeto exige **Node 24**. O nvm tem o v24.14.0 instalado, mas só carrega em shell
interativo (vem do `.bashrc`). Se você rodar `npm ci` sem carregar o nvm, ou falha em
silêncio ou instala com o runtime errado.

Carregue o nvm antes de qualquer comando npm:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
node --version    # deve responder v24.x
```

Cuidado extra com pipe: `npm ci | tail -3` devolve o exit code do `tail`, não do `npm` —
o comando parece ter dado certo mesmo tendo falhado.

### O clone antigo está aposentado

`C:\Users\gabri\sistema_hotel_prova` era um segundo clone e **não deve mais ser usado**.
Foi a origem de duas falhas: um agente trabalhou 106 commits atrasado e concluiu que não
existia `ConsumptionModel`; depois outro não achou a própria delegação. Trabalhe só nas
três worktrees acima.

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
0   prep: CORS, ?from=&to=, WAITER          Fase 0  monorepo + design system
1   product-catalog                         Fase 1  hóspedes, quartos, reservas,
2a  account-entities  (+ INTERNO)                   check-in/out, hoje, rack
2b  consumption-migration                   Fase 3  financeiro + analytics
3a  account-bill  ← parada segura           Fase 4  grupos (B2B)
                    │
                    └───────────── desbloqueia ─────────────┐
                                                            ▼
3b  payment-account-link   [risco: PIX]     Fase 2  comanda do garçom
3c  reservation-bill-delegate
4   split-bill-dayuse
5   seed-swagger
```

**As duas frentes rodam em paralelo de verdade.** A única dependência real é a Fase 2
(comanda), que precisa de `/products` e `/accounts` — ou seja, da Fatia 3a.

### O CORS não bloqueia o frontend

Avaliação anterior dizia que J3 estava bloqueado até a Fatia 0. **Estava errado.** O Vite
tem proxy de dev:

```js
server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } }
```

O navegador enxerga mesma origem — sem preflight, sem CORS. Dá para integrar contra o
backend real desde o primeiro dia. CORS segue necessário em **produção**, e continua na
Fatia 0; apenas não é pré-requisito.

O rack em escala precisa de `?from=&to=`, mas com o seed (~190 registros) dá para filtrar
no cliente e trocar depois. **Fases 0, 1, 3 e 4 estão destravadas.**

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

O portão tem **duas camadas**:

| Camada | O quê | Quando | Custo |
|---|---|---|---|
| **1 — Determinística** | `scripts/qa_checks.sh` — violações objetivas pegáveis com grep | Automática no CI, a cada push. Também `npm run qa:checks` local | Zero |
| **2 — Semântica** | Subagente `qa-redteam` — SOLID, DRY, KISS, LGPD, UI/UX | Manual, na sua janela, ao terminar a fatia | Tokens |

A camada 1 **reprova o build** em erro. A camada 2 é julgamento — precisa de LLM e por isso
roda uma vez por fatia, não a cada push.

**Nenhuma branch vai para `develop` sem passar pelas duas.**

```
1. cd ~/hotel-jX                              ← sua worktree, sempre
2. git fetch origin
3. git checkout -b <tipo>/<nome> origin/develop   ← NÃO use "checkout develop"
4. Implementar em commits lógicos (Conventional Commits)
5. npm run qa:checks  → sem erro bloqueante
6. npm test           → tudo verde
7. Rodar o QA Red Team (abaixo)
8. Corrigir todos os 🔴 e decidir sobre os 🟡
9. Se houve correção → voltar ao passo 5
10. git push -u origin <sua-branch>
11. Atualizar o quadro (§6) → 🟢 PRONTO PARA MERGE
12. Avisar J1. J1 faz o merge.
```

Depois que J1 mergear, para começar a próxima tarefa basta repetir do passo 2 — o `fetch`
traz o `develop` já com o seu trabalho integrado.

O CI agora dispara em `feature/**`, `fix/**`, `chore/**` e `docs/**` — antes só rodava em
`main` e `develop`, então branch de agente não era verificada até o merge.

### O que a camada 1 verifica

`require()` · `findByPk()` em recurso de tenant · `tenant_id` lido do body/query ·
rota literal declarada depois de `/:param` · log com objeto de requisição (PII) ·
`include` de model sensível sem `attributes` · router ausente do Swagger.

Escape pontual, quando a violação for justificada:

```js
const r = await Model.findByPk(id); // qa-allow: findByPk
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

| Agente | Worktree | Tarefa atual | Branch | Status | Atualizado em |
|---|---|---|---|---|---|
| J1 Orquestrador | `~/sistema_gestao_hotel` | Setup de worktrees e portão de QA | `develop` | ✅ Mergeado | 02/08/2026 |
| J2 Backend | `~/hotel-j2` | Fatia 0 — pré-requisitos de backend | `fix/backend-prep-frontend` | 🟢 PRONTO PARA MERGE | 02/08/2026 |
| J3 Frontend | `~/hotel-j3` | Fase 0 — monorepo e design system | `feature/frontend-fase0-fundacao` | ⚪ NÃO INICIADO | — |

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

Trabalhe SEMPRE em ~/hotel-j2. É uma git worktree, não um clone: compartilha o
.git com as outras janelas. Rode git sempre pelo WSL.
Você JÁ ESTÁ na branch fix/backend-prep-frontend, criada a partir de develop.
Para branches futuras: git fetch origin && git checkout -b <nome> origin/develop
NUNCA "git checkout develop" — develop está travada no repo do orquestrador.

Leia nesta ordem, antes de qualquer coisa:
1. docs/delegacoes/modulo_consumo_02ago2026.md  ← sua delegação, leia inteira
2. docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md   ← corrige premissas erradas
3. docs/COORDENACAO_AGENTES.md                  ← como nos coordenamos
4. CLAUDE.md e docs/CODING_STANDARDS.md

ATENÇÃO: documentos anteriores afirmavam que não existe modelo de consumo.
Está ERRADO. A develop já tem ConsumptionModel, os endpoints
/reservations/:id/consumptions, o GetBillController e tests/bill-consumptions.test.js.
Antes de criar qualquer arquivo, verifique se ele já existe.

Sua tarefa agora: Fatia 0 (caminho crítico — o Agente Frontend está bloqueado até
ela entrar em develop):
  1. Habilitar CORS (hoje não existe em lugar nenhum)
  2. GET /reservations com ?from=&to= e paginação
     (hoje ListReservationController.js:9 faz findAll do tenant inteiro com 3 joins)
  3. Criar a role WAITER (hoje só existem ADMIN e RECEPTIONIST)

Comece respondendo as 3 perguntas de verificação da delegação, seção
"Instruções iniciais obrigatórias".

Ao terminar: npm run qa:checks, npm test, depois o subagente qa-redteam
(§5 da coordenação). Corrija os 🔴, dê push na sua branch, atualize o quadro (§6)
e me avise. NÃO faça merge em develop.
```

### J3 — Agente Frontend

```
Você é o Agente FRONTEND (J3) do projeto PMS Hotel SaaS.

Trabalhe SEMPRE em ~/hotel-j3. É uma git worktree, não um clone: compartilha o
.git com as outras janelas. Rode git sempre pelo WSL.
Você JÁ ESTÁ na branch feature/frontend-fase0-fundacao, criada a partir de develop.
Para branches futuras: git fetch origin && git checkout -b <nome> origin/develop
NUNCA "git checkout develop" — develop está travada no repo do orquestrador.

Leia nesta ordem, antes de qualquer coisa:
1. docs/frontend/PLANEJAMENTO_FRONTEND.md       ← seu plano completo, leia inteiro
2. docs/COORDENACAO_AGENTES.md                  ← como nos coordenamos
3. CLAUDE.md e docs/CODING_STANDARDS.md

Sua tarefa agora: Fase 0, nesta ordem
  1. Monorepo pnpm + Turborepo com apps/pms, apps/booking, apps/admin,
     packages/{ui,api-client,domain,config}
  2. packages/domain PRIMEIRO: dinheiro (DECIMAL chega como STRING do pg —
     nunca Number()) e datas (fuso America/Sao_Paulo fixo). Toda tela depende
     disso e sao as duas fontes de bug silencioso do dominio.
  3. packages/ui: design system conforme §10 do plano
     (cores de status, densidade compact/comfortable, alvo de toque 48px)
  4. apps/pms: React + TypeScript + Vite + Tailwind + shadcn/ui, shell,
     login contra POST /auth/login, rota protegida por role
  5. packages/api-client: gerar tipos do OpenAPI em config/swagger.js

VOCE NAO ESTA BLOQUEADO. Configure o proxy de dev do Vite e integre contra o
backend real desde o inicio:

  server: { proxy: { '/api': { target: 'http://localhost:3000',
                               changeOrigin: true } } }

O navegador enxerga mesma origem, entao nao ha CORS. Nao use mock para o que
ja tem endpoint pronto — e quase tudo (auth, hospedes, quartos, reservas,
check-in/out, pagamentos, analytics, B2B, config do hotel).

Depois da Fase 0, siga para a Fase 1 na ordem do plano §11: hospedes e quartos
primeiro (CRUD simples valida o design system com risco baixo), rack por ultimo
(tela mais complexa). Para o rack, filtre no cliente por enquanto — o filtro
?from=&to= chega na Fatia 0 do backend.

NÃO toque em app/, routes/, database/, db/, seed/ nem tests/ — são do Agente Backend.

Ao terminar cada entrega: npm run qa:checks, depois o subagente qa-redteam
(§5 da coordenação). Corrija os 🔴, dê push na sua branch, atualize o quadro (§6)
e me avise. NÃO faça merge em develop.
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
