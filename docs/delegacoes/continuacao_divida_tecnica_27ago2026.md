# Delegação — Continuação da Dívida Técnica (SPEC-06)

**Data:** 27/08/2026
**Orquestrador:** Gabriel (J1)
**Para:** `agente_executor_hotel2` — raiz do projeto (`~/sistema_gestao_hotel`)
**Continua:** `DELEGACAO_DIVIDA_TECNICA.md` (26/08) — PASSOS 1 e 2 feitos
**Spec:** `docs/specs/SPEC-06-qualidade-divida-tecnica.md`

---

## Prompt de abertura — cole isto na janela do agente

```
Você é o Agente Executor de dívida técnica do projeto Gesway (PMS hoteleiro SaaS).
Retomando o trabalho da SPEC-06, interrompido em 26/08.

Trabalhe na raiz: ~/sistema_gestao_hotel. Rode git sempre pelo WSL.
Você está na branch fix/paranoid-unique-constraints com 4 commits LOCAIS.

Leia, nesta ordem:
1. docs/delegacoes/continuacao_divida_tecnica_27ago2026.md   ← esta, inteira
2. DELEGACAO_DIVIDA_TECNICA.md    ← contexto, restrições e armadilhas de ambiente
3. DELEGACAO_WEBHOOK_PIX.md       ← a próxima frente, é crítica

DUAS PENDÊNCIAS DO PASSO 2 ANTES DE QUALQUER COISA NOVA:
1. Seus 4 commits nunca foram enviados — só existem nesta máquina
2. O PASSO 2 não passou pelo qa-redteam, que é obrigatório antes do merge

Comece pela ETAPA A desta delegação. NÃO faça merge em develop nem
promova para main — quem integra é o orquestrador.
```

---

## 1. Onde paramos

### Feito e auditado ✅

**PASSO 1 — vazamento no endpoint público** · branch `fix/public-booking-payment-leak`, 2 commits, **no remoto**.

Auditado (`docs/qa/redteam_public-booking-leak_26ago2026.md`), veredito APROVADO COM RESSALVAS, e as 3 ressalvas 🟡 foram fechadas — incluindo dois pontos da mesma classe que o auditor encontrou: `GetBillController` e `resolveTenantBySubdomain`.

### Feito, não enviado, não auditado ⚠️

**PASSO 2 — `paranoid` + unique total** · branch `fix/paranoid-unique-constraints`, 4 commits **locais**.

O trabalho está bom. Foram corrigidos 5 models (`CorporateClient`, `Guest`, `RoomCategory`, `Room`, `User`), criado `app/utils/uniqueConstraintConflict.js`, 7 controllers passaram a devolver **409** em vez de 500, e — o mais importante — a **regra 8 do `qa_checks.sh`** foi implementada como **ERRO**, não aviso. Mais `tests/paranoid-unique-recreate.test.js` com 155 linhas.

**Mas:**

| Pendência | Consequência |
|---|---|
| 4 commits só existem nesta máquina | Falha do disco = trabalho perdido |
| Sem relatório do `qa-redteam` | O ciclo obrigatório da delegação foi pulado |
| Branch defasada em relação a `develop` | Não tem os commits de 26/08 (Specs, delegações, relatório) |

---

## 2. Tarefas

### ETAPA A — Fechar o PASSO 2 ⛔ **antes de qualquer coisa nova**

#### A.1 — Enviar o trabalho

```bash
cd ~/sistema_gestao_hotel
git push -u origin fix/paranoid-unique-constraints
```

- [ ] **CA-A.1** — Branch no remoto, 4 commits visíveis

> Faça isto **primeiro**, antes de sincronizar ou auditar. Trabalho não enviado é trabalho em risco.

#### A.2 — Sincronizar com `develop`

A branch foi criada antes dos commits de 26/08 (Specs, delegações, relatório de sessão). Sincronizar evita conflito no merge e garante que você audita contra a base certa.

```bash
git fetch origin
git merge origin/develop      # ou rebase, se preferir histórico linear
```

- [ ] **CA-A.2.a** — Branch contém os commits de `develop` até `9b534da`
- [ ] **CA-A.2.b** — Nenhum conflito pendente
- [ ] **CA-A.2.c** — Suíte continua verde após a sincronização

> **Atenção:** `docs/historico_sessao/gabriel/specs_e_divida_tecnica_26ago2026.md` existe em `develop` e não na sua branch. Isso é defasagem, **não** algo que você apagou — o merge deve **preservar** esse arquivo junto com o seu `divida_tecnica_26ago2026.md`. Os dois relatórios coexistem.

#### A.3 — Auditar o PASSO 2

Etapa que ficou faltando. Rode o subagente:

```
Use a ferramenta Agent com subagent_type "qa-redteam" e o prompt:

"Audite a branch fix/paranoid-unique-constraints, comparando com develop.
Feature entregue: correção sistêmica do padrão 'model paranoid com índice
único total', que queimava o valor do campo para sempre. 5 models corrigidos
com índice parcial, UniqueConstraintError mapeado para 409, e regra 8 no
qa_checks.sh que reprova o padrão no build.

Critérios de aceite que eu deveria ter cumprido:
- Auditar TODOS os models paranoid com unique, não só room_categories
- Índice parcial where deleted_at IS NULL no model E no db/schema.sql
- UniqueConstraintError → 409, nunca 500
- Teste do ciclo criar → deletar → recriar com o mesmo nome, para cada model
- Regra no qa_checks.sh que detecta o padrão e REPROVA o build
- A regra não gera falso positivo na base atual
- Suíte completa verde

Preste atenção especial em: se cada teste realmente FALHA quando a correção é
revertida (a auditoria do PASSO 1 mostrou um teste que passava sem a correção);
se a heurística da regra 8 tem falso negativo; e se o índice parcial foi
aplicado tanto no model quanto no schema.sql, sem divergência.

Grave o relatório em docs/qa/redteam_paranoid-unique_27ago2026.md."
```

- [ ] **CA-A.3.a** — Relatório gravado em `docs/qa/`
- [ ] **CA-A.3.b** — Todos os 🔴 corrigidos
- [ ] **CA-A.3.c** — Ressalvas 🟡 corrigidas ou registradas com justificativa
- [ ] **CA-A.3.d** — Se houve correção: `qa:checks` + suíte novamente
- [ ] **CA-A.3.e** — Push do que mudou

> **Um teste que passa sem a correção é o achado mais provável aqui.** No PASSO 1 o auditor provou empiricamente que isso acontecia. Antecipe: reverta o índice parcial de um model, rode `tests/paranoid-unique-recreate.test.js`, e confirme que **quebra**. Se passar, o teste não vale nada.

---

### ETAPA B — Webhook PIX 🔴 **prioridade máxima**

**DEP:** ETAPA A concluída

Delegação completa em **`DELEGACAO_WEBHOOK_PIX.md`** (raiz). Leia inteira — não vou repetir aqui.

**Resumo do porquê da prioridade:** a auditoria do PASSO 1 encontrou, fora do diff, uma vulnerabilidade financeira **reproduzida com a própria suíte do projeto**. Qualquer pessoa, sem autenticação, confirma uma reserva sem pagar:

```
1. POST /public/:sub/bookings          (sem auth) → devolve provider_charge_id
2. POST /webhooks/pix { provider_charge_id }  (sem auth, sem assinatura)
3. → reserva CONFIRMED · payment PAID · quarto bloqueado — SEM PAGAMENTO
```

Isto vem **antes** dos PASSOS 3, 4 e 5. É dinheiro.

- [ ] **CA-B** — Todos os critérios `T-W.1` a `T-W.4` da `DELEGACAO_WEBHOOK_PIX.md`

> A tarefa **T-W.5** (falso positivo da regra 7 do `qa_checks.sh`) só depois que a ETAPA A estiver mergeada — as duas mexem no mesmo arquivo.

---

### ETAPA C — Portão de cobertura *(PASSO 3)*

**Branch:** `chore/coverage-gate-60`

O baseline já foi medido pela auditoria do PASSO 1, então **esta etapa está destravada e é segura**:

| Métrica | Real | Portão atual | Portão exigido |
|---|---|---|---|
| Statements | 74,05% | 60 | 60 ✅ |
| Lines | 76,40% | 60 | 60 ✅ |
| **Branches** | **70,96%** | **55** | **60** |
| Functions | 84,02% | 60 | 60 ✅ |

- [ ] **CA-C.a** — `branches` elevado para **60** em `vitest.config.js`
- [ ] **CA-C.b** — `npm run test:coverage` verde com o portão novo
- [ ] **CA-C.c** — Se a cobertura tiver caído abaixo de 60 com as mudanças das etapas anteriores: **escrever testes**, não baixar o portão

---

### ETAPA D — Schema de resposta no Swagger *(PASSO 4)*

**Branch:** `docs/swagger-response-schemas`

42 de 53 respostas 2xx sem `content` — **79%**. O cliente TypeScript do frontend devolve `never` e precisa de `as unknown as`.

Critérios completos no PASSO 4 da `DELEGACAO_DIVIDA_TECNICA.md`.

- [ ] **CA-D** — Contagem de respostas sem schema cai de 42 para ≤ 10

---

### ETAPA E — Docker Compose de contingência *(PASSO 5)*

**Branch:** `chore/docker-compose-contingencia`

Exigido pelo Termo de Aceite como contingência da defesa. Não existe hoje.

Critérios completos no PASSO 5 da `DELEGACAO_DIVIDA_TECNICA.md`.

- [ ] **CA-E** — `docker compose up` testado de verdade, não só escrito

---

## 3. Ordem

```
A  Fechar o PASSO 2      push → sincronizar → auditar → corrigir
        │
B  Webhook PIX 🔴        vulnerabilidade financeira
        │
C  Portão de cobertura   destravado, baixo risco
        │
D  Swagger               maior bloco, maior retorno
        │
E  Docker Compose        rede de segurança da defesa
```

---

## 4. Ciclo obrigatório por etapa

Igual ao da delegação anterior — **e a ETAPA A existe porque ele foi pulado no PASSO 2**:

```
1. git fetch origin && git checkout -b <branch> origin/develop
2. Implementar em commits lógicos (Conventional Commits)
3. npm run qa:checks   → sem erro
4. npm test            → verde
5. Subagente qa-redteam
6. Corrigir 🔴; decidir sobre 🟡
7. Se corrigiu → volta ao 3
8. git push -u origin <branch>
9. Avisar o orquestrador
```

**Não faça merge em `develop`.** Quem integra é J1.

---

## 5. Lembretes de ambiente

Detalhes completos na `DELEGACAO_DIVIDA_TECNICA.md` §3. Os dois que mais custam tempo:

```bash
# Sem isto, node resolve para v18 e npm para o do Windows
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24

# Testes precisam do Postgres do cluster
minikube start && ./start.sh up
kubectl port-forward -n hotel-system svc/postgres 5432:5432 &
```

E: **`npm ci | tail` devolve o exit code do `tail`, não do `npm`.** Já mascarou uma falha neste projeto.

---

## 6. Quando parar e escalar

- A auditoria da ETAPA A encontrar 🔴 que exija redesenho da regra 8
- Um teste existente só passar se você **editar o teste**
- A sincronização com `develop` gerar conflito que você não sabe resolver com segurança
- A ETAPA B exigir mudar o contrato público de `/public/:subdomain/bookings` além do previsto
- A cobertura cair abaixo de 60% em `branches` após as correções

---

## 7. Fora do escopo

| Item | Por quê |
|---|---|
| Merge em `develop` · promover `main` | Decisão do orquestrador |
| T-06.6 (ressalva R4) | Risco baixo — a tabela `products` não existe no cluster |
| T-06.7 (refresh token) | Reclassificado: é ADR, não dívida técnica |
| SPEC-01 a SPEC-05 | Outras frentes |
| Documentação acadêmica (E-02, E-07) | Frente separada, não é sua |

---

## 8. Referências

| Documento | Para quê |
|---|---|
| `DELEGACAO_DIVIDA_TECNICA.md` | Contexto, restrições, armadilhas, critérios dos PASSOS 3 a 5 |
| `DELEGACAO_WEBHOOK_PIX.md` | ETAPA B completa |
| `docs/specs/SPEC-06-qualidade-divida-tecnica.md` | Spec da frente |
| `docs/qa/redteam_public-booking-leak_26ago2026.md` | Auditoria do PASSO 1 — nível esperado, e o achado 🔴 |
| `.claude/agents/qa-redteam.md` | Definição do auditor |
