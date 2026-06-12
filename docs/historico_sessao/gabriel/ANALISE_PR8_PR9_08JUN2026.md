# Análise Técnica — PRs #8 e #9

> **Tipo:** Code Review / Auditoria de PR  
> **Data:** 08 de Junho de 2026  
> **Revisor:** Gabriel Reis  
> **Branch de trabalho:** `fix/reverter-danos-pr8`  
> **Referência:** PRs gabrielreis354/sistema_hotel_prova #7, #8, #9

---

## Contexto

Após `git pull origin main` na branch `feat/api-implementation`, foram detectadas
alterações introduzidas por dois PRs desde a última sessão:

- **PR #7** — `feat/api-implementation` → `main` *(mergeado por Gabriel — nosso trabalho)*
- **PR #8** — `feat/corrigir-discrepancias-criticas` (Sirlande) → `main` *(mergeado)*
- **PR #9** — `feature/weslley` (lucaskenway) → `main` *(aberto, pendente de revisão)*

---

## PR #8 — `feat/corrigir-discrepancias-criticas` (Sirlande Martins)

### Arquivos alterados

| Arquivo | Tipo de mudança |
|---|---|
| `app/Models/TenantModel.js` | `tableName: 'tenants'` → `'hotels'` |
| `package.json` | Adicionou scripts `setup:db` e `seed:db` |
| `README_NOVO.md` | Novo arquivo na raiz |
| `backend/README_NOVO.md` | Recriou pasta `backend/` (só README) |
| `docs/historico_sessao/sirlande/` | 5 novos documentos de auditoria |

### Diagnóstico

O Sirlande realizou uma **auditoria técnica legítima e bem documentada** (ver
`docs/historico_sessao/sirlande/Parecer_tecnico_2026-06-03/`). Ele identificou
corretamente um conflito de nomenclatura entre `db/schema.sql` e os Models
Sequelize — porém **apontou para a fonte de verdade errada**.

#### Problema raiz: dois schemas em conflito desde a origem

| | `db/schema.sql` (legado, nunca atualizado) | Models Sequelize (fonte de verdade atual) |
|---|---|---|
| Tabela principal | `hotels` | `tenants` |
| FK nas outras tabelas | `hotel_id` | `tenant_id` |
| Tabela pivô N:N | não existe | `reservation_rooms` |
| Coluna `subdomain` | não existe | ✅ em TenantModel |
| Coluna `status` (tenant) | não existe | ✅ em TenantModel |
| `tenant_id` em payments | não existe | ✅ em PaymentModel |

O `db/schema.sql` é um artefato legado da fase inicial do projeto, anterior à
transformação SaaS. A fonte de verdade do banco é o Sequelize via
`node command.js migrate`. O Sirlande interpretou o `schema.sql` como autoritativo
e corrigiu o Model para apontar para `hotels`, quando o correto era o inverso.

### Bugs introduzidos

#### 🔴 BUG CRÍTICO — `app/Models/TenantModel.js`

**Mudança:** `tableName: 'tenants'` → `tableName: 'hotels'`

**Impacto:** Quebra o `node command.js migrate`. O Sequelize tenta criar/usar a
tabela `hotels`, mas todos os outros Models (`users`, `rooms`, `guests`,
`reservations`, `payments`) declaram `tenant_id` como FK apontando para `tenants`.
Resultado em runtime: erro de constraint / tabela não encontrada.

**Solução aplicada:** Revertido para `tableName: 'tenants'` no commit `a11d119`
da branch `fix/reverter-danos-pr8`.

#### 🟡 RISCO — `package.json` scripts `setup:db` e `seed:db`

**Mudança:** Adicionados dois scripts que executam `db/schema.sql` e
`seed/seed_hotels.sql` via psql diretamente.

**Impacto:** O `db/schema.sql` está desatualizado (usa `hotels`/`hotel_id`). Se
um dev rodar `npm run setup:db`, cria um banco incompatível com o Sequelize. Os
scripts não quebram nada se não forem executados, mas induzem ao erro.

**Solução recomendada:** Atualizar o `db/schema.sql` para refletir o Sequelize
(ver seção "Pendências" abaixo).

#### 🟢 SEM IMPACTO — `backend/README_NOVO.md` e `README_NOVO.md`

Recriou a pasta `backend/` que havia sido deletada, mas apenas com um README.
Sem código TypeScript. Não causa conflito funcional.

### Commit de correção gerado

```
a11d119  fix: reverte tableName de 'hotels' para 'tenants' no TenantModel
Branch: fix/reverter-danos-pr8
PR aberto: #10 (a ser criado após esta sessão)
```

---

## PR #9 — `fix: resolve merge conflict` (lucaskenway / Weslley)

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `docker-compose.yml` | +176 / -75 linhas |
| `docs/ Análise de Conformidade...md` | Novo doc (467 linhas) |
| `docs/RELATORIO_SESSAO_2026-06-06.md` | Novo doc (270 linhas) |

### Diagnóstico

**⛔ NÃO DEVE SER MERGEADO no estado atual.**

O `docker-compose.yml` resultante do PR está **corrompido com conflitos de merge
não resolvidos**. O arquivo final conteria a chave `services:` declarada **3 vezes**
e `volumes:` **2 vezes** — YAML inválido que o Docker Compose recusaria subir.

Adicionalmente, o primeiro bloco de `services:` reintroduz `ports: "5432:5432"`
no container `postgres`, expondo o banco diretamente ao host — justamente o
problema de segurança que foi corrigido no PR #7.

### Ação recomendada

Fechar o PR #9 sem merge. O Weslley deve:
1. Fazer `git rebase origin/main` ou `git merge main` na branch `feature/weslley`
2. Resolver o conflito no `docker-compose.yml` manualmente, mantendo apenas um
   bloco `services:` e **sem expor a porta 5432**
3. Reabrir o PR após a resolução

---

## Pendências identificadas (não executadas nesta sessão)

Estas ações foram **identificadas mas não implementadas** — pertencem ao escopo
de outros devs ou de uma próxima sessão:

### 1. Atualizar `db/schema.sql` *(média prioridade)*

O arquivo precisa ser sincronizado com os Models Sequelize para evitar que futuros
devs repitam o erro do Sirlande:

- Renomear `hotels` → `tenants`
- Renomear `hotel_id` → `tenant_id` em todas as tabelas (12 ocorrências)
- Adicionar tabela `reservation_rooms` (pivô N:N)
- Adicionar colunas `subdomain` e `status` à tabela `tenants`
- Adicionar coluna `tenant_id` em `payments`
- Corrigir `CHECK (method IN (...))` em `payments` (model aceita texto livre)

### 2. Atualizar `seed/seed_hotels.sql` *(média prioridade)*

Alinhar com o schema corrigido — renomear `hotels` → `tenants`, `hotel_id` →
`tenant_id`, adicionar exemplos de `subdomain` e `status`.

### 3. Adicionar nota no `package.json` *(baixa prioridade)*

Comentário inline ou no README deixando claro que `setup:db` é alternativo ao
`node command.js migrate` e que o `schema.sql` precisa estar em dia.

---

## Resumo executivo

| Item | Status |
|---|---|
| PR #8 — bug `tableName: 'hotels'` | ✅ Corrigido em `fix/reverter-danos-pr8` |
| PR #9 — docker-compose corrompido | ⛔ Não mergeado, aguarda fix do Weslley |
| `db/schema.sql` desatualizado | 🟡 Pendente — próxima sessão |
| `seed/seed_hotels.sql` desatualizado | 🟡 Pendente — próxima sessão |
