# Code Review — PR #8 `feat/corrigir-discrepancias-criticas`

**Data do review:** 08 de Junho de 2026  
**Revisor:** Gabriel Reis (dev sênior)  
**Autor do PR:** Sirlande Martins  
**Commit do PR:** `f5b4baa`  
**Status:** ⚠️ Mergeado com bug crítico introduzido — correção em andamento

---

## Contexto

O Sirlande realizou uma auditoria técnica do projeto e identificou, corretamente,
um conflito de nomenclatura entre o arquivo `db/schema.sql` e os Models Sequelize.
O diagnóstico dele está bem fundamentado e documentado em
`docs/historico_sessao/sirlande/Parecer_tecnico_2026-06-03/`.

No entanto, ao aplicar a correção, ele apontou para a **fonte de verdade errada**:
tomou o `db/schema.sql` (arquivo legado, nunca atualizado) como autoritativo e
ajustou o Model Sequelize para se conformar a ele — quando o correto era o inverso.

---

## O problema raiz: dois schemas em conflito desde a origem

O projeto passou por uma transformação SaaS em meados de Maio/2026. Nessa
transformação, os Models Sequelize foram reescritos usando a nomenclatura
`tenants`/`tenant_id`. O arquivo `db/schema.sql`, porém, **nunca foi atualizado**
e permaneceu com a nomenclatura original `hotels`/`hotel_id`.

| Artefato | Nome da tabela principal | Nome da coluna FK |
|---|---|---|
| `db/schema.sql` (legado) | `hotels` | `hotel_id` |
| `app/Models/TenantModel.js` | `hotels` ← mudado pelo PR #8 | — |
| Todos os outros Models JS | — | `tenant_id` (FK → `tenants`) |
| `database/relations.js` | — | `tenant_id` (12 associações) |
| Todos os Controllers | — | `tenant_id` |

**A fonte de verdade é o Sequelize** (`node command.js migrate`), não o SQL manual.

---

## Bugs introduzidos pelo PR #8

### 🔴 BUG 1 — `app/Models/TenantModel.js` (crítico, bloqueia execução)

**Linha alterada:**
```diff
- tableName: 'tenants',
+ tableName: 'hotels',
```

**Por que isso quebra o sistema:**

O Sequelize resolve associações pelo `tableName` declarado em cada Model. Quando
`node command.js migrate` é executado, ele tenta criar/usar a tabela `hotels`.
Porém, todos os outros 6 Models (`users`, `rooms`, `room_categories`, `guests`,
`reservations`, `payments`) declaram internamente:

```js
// Em TODOS os outros Models:
references: { model: 'tenants', key: 'id' }
```

E o `database/relations.js` declara 12 associações do tipo:
```js
TenantModel.hasMany(UserModel, { foreignKey: "tenant_id" });
// ... (repete para todas as 6 tabelas filhas)
```

**Resultado em runtime:** O Sequelize tenta criar FK constraints apontando para
`tenants`, mas a tabela se chama `hotels`. Erro: `relation "tenants" does not exist`.

**Evidência dos arquivos:**
- `app/Models/UserModel.js:15` → `references: { model: 'tenants', key: 'id' }`
- `app/Models/RoomModel.js:15` → `references: { model: 'tenants', key: 'id' }`
- `app/Models/GuestModel.js:15` → `references: { model: 'tenants', key: 'id' }`
- `app/Models/ReservationModel.js:15` → `references: { model: 'tenants', key: 'id' }`
- `app/Models/PaymentModel.js:15` → `references: { model: 'tenants', key: 'id' }`
- `app/Models/RoomCategoryModel.js:15` → `references: { model: 'tenants', key: 'id' }`

**Correção aplicada:** Branch `fix/reverter-danos-pr8`, commit `a11d119`.

---

### 🟡 RISCO 2 — `package.json` scripts `setup:db` e `seed:db`

**O que foi adicionado:**
```json
"setup:db": "psql ... -f db/schema.sql",
"seed:db":  "psql ... -f seed/seed_hotels.sql"
```

**O problema:** O `db/schema.sql` que esses scripts executavam ainda usava
`hotels`/`hotel_id` (nomenclatura legada). Se qualquer dev rodasse `npm run setup:db`,
criaria um banco incompatível com o Sequelize — exatamente o bug inverso ao do
TenantModel.

Os scripts em si são uma boa ideia (facilitam onboarding). O problema era o
conteúdo do arquivo que eles executavam.

**Correção aplicada:** Branch `fix/sincronizar-schema-sql-com-sequelize` — o
`db/schema.sql` foi completamente reescrito para refletir os Models Sequelize.

---

### 🟢 SEM IMPACTO — `backend/README_NOVO.md` e `README_NOVO.md`

Recriou a pasta `backend/` (deletada anteriormente) com apenas um README.
Sem código. Não causa conflito funcional. Pode ser mantido como documentação.

---

## Correções necessárias — guia passo a passo para o Sirlande

> Estas correções **já foram aplicadas** nas branches de fix abertas por Gabriel.
> Este guia serve para o Sirlande entender o raciocínio e evitar reincidência.

---

### Correção 1 — Reverter `TenantModel.js`

**Arquivo:** `app/Models/TenantModel.js`

Reverter a linha que foi alterada pelo PR #8:

```js
// ❌ Como ficou após o PR #8 (ERRADO):
{
    tableName: 'hotels',   // ← causa conflito com references: 'tenants' nos outros Models
    ...
}

// ✅ Como deve ficar (CORRETO):
{
    tableName: 'tenants',  // ← consistente com todos os outros Models e o relations.js
    ...
}
```

**Regra:** O `tableName` do TenantModel precisa ser **igual** ao valor em
`references: { model: 'tenants' }` declarado em todos os outros Models.

---

### Correção 2 — Reescrever `db/schema.sql`

O `schema.sql` precisa espelhar exatamente o que o Sequelize cria via
`node command.js migrate`. Cada discrepância é uma armadilha para futuros devs.

**O que estava errado e como corrigir:**

| O que estava no schema.sql | O que deve estar |
|---|---|
| `CREATE TABLE hotels` | `CREATE TABLE hotels` ✅ (correto, mantido) |
| FK: `hotel_id UUID REFERENCES hotels(id)` | `tenant_id UUID REFERENCES hotels(id)` |
| Sem coluna `subdomain` em `hotels` | Adicionar `subdomain TEXT NOT NULL UNIQUE` |
| Sem coluna `status` em `hotels` | Adicionar `status TEXT DEFAULT 'ACTIVE'` |
| Sem tabela `reservation_rooms` | Criar tabela pivô N:N |
| `payments` sem `tenant_id` | Adicionar `tenant_id UUID REFERENCES hotels(id)` |
| `CHECK (method IN ('CARD','CASH','TRANSFER'))` | Remover (model aceita texto livre) |
| Sem colunas `deleted_at` em `users`, `rooms`, etc. | Adicionar (soft delete / paranoid) |

**Como validar após a correção:**
```bash
# 1. Subir o banco limpo:
docker compose up postgres -d

# 2. Executar o schema SQL:
docker compose exec postgres psql -U hotel_user -d gestao_hotel -f /dev/stdin < db/schema.sql

# 3. Executar o migrate Sequelize:
node command.js migrate

# Se não houver erros, os dois estão em sincronia.
# Se o migrate tentar ALTER TABLE em colunas que o schema já criou corretamente,
# é sinal de que ainda há divergência.
```

---

### Correção 3 — Atualizar `seed/seed_hotels.sql`

O seed precisa usar a mesma nomenclatura do schema corrigido:

```sql
-- ❌ ANTES (hotel_id — nomenclatura legada):
INSERT INTO room_categories (hotel_id, name, ...) SELECT h.id ...

-- ✅ DEPOIS (tenant_id — nomenclatura atual):
INSERT INTO room_categories (tenant_id, name, ...) SELECT h.id ...
```

Também precisa usar `subdomain` como chave de lookup (já que `hotels` passou a
ter `subdomain UNIQUE`):

```sql
-- ❌ ANTES (lookup por name — sem garantia de unicidade cross-tenant):
WHERE h.name = 'Hotel Aurora'

-- ✅ DEPOIS (lookup por subdomain — UNIQUE):
WHERE h.subdomain = 'aurora'
```

---

## Pendências de banco de dados para o Sirlande

Esta seção consolida apenas o que ainda precisa ser observado pelo Sirlande no
domínio de banco de dados, para evitar novas regressões.

### 🔴 Pendência 1 — Unificar a referência entre `tableName` e FKs

Hoje o ponto mais sensível do projeto é a coerência entre:

- `app/Models/TenantModel.js`
- `references: { model: 'tenants' }` nos Models filhos
- `database/relations.js`
- `db/schema.sql`

**Regra obrigatória:** os quatro pontos acima precisam falar a mesma língua.

Se o time decidir que a tabela principal é `tenants`, então:
- o `TenantModel` precisa usar `tableName: 'tenants'`
- todos os `references.model` precisam apontar para `tenants`
- o `schema.sql` precisa criar `tenants`

Se o time decidir que a tabela principal é `hotels`, então:
- os 6 Models filhos precisam deixar de referenciar `tenants`
- o `relations.js` e os scripts SQL precisam acompanhar a mesma decisão

**Ação prática para o Sirlande:** nunca corrigir só um lado. Sempre revisar o
conjunto inteiro antes de aplicar o commit.

### 🟡 Pendência 2 — Manter `db/schema.sql` sincronizado com o Sequelize

O `schema.sql` é o principal ponto de confusão para onboarding. Toda vez que um
Model mudar, o arquivo SQL precisa ser revisto na mesma sessão.

Checklist mínimo de sincronização:

- conferir `tableName` de todos os Models
- conferir `references.model` e `foreignKey`
- conferir colunas `deleted_at` das tabelas com paranoid
- conferir tabelas auxiliares como `reservation_rooms`
- conferir `CHECK`s de status e enums textuais
- conferir se `payments` acompanha o Model real

**Risco se ignorar:** o projeto passa a ter dois bancos “oficiais” diferentes:
um criado por `setup:db` e outro criado por `node command.js migrate`.

### 🟡 Pendência 3 — Tratar `seed/seed_hotels.sql` como parte do contrato do banco

O seed não pode ser visto como arquivo secundário. Ele precisa refletir:

- nomes reais das colunas (`tenant_id` vs `hotel_id`)
- chaves únicas reais (`subdomain`)
- valores válidos de status e role
- dependências reais entre tabelas

**Ação prática para o Sirlande:** sempre que alterar `schema.sql`, revisar o
`seed/seed_hotels.sql` no mesmo commit ou no mesmo PR.

### 🟡 Pendência 4 — Validar banco limpo após qualquer ajuste estrutural

Depois de mexer em Model, schema ou seed, o fluxo de validação precisa ser este:

```bash
# 1. Subir apenas o PostgreSQL
docker compose up postgres -d

# 2. Aplicar schema manual
docker compose exec postgres psql -U hotel_user -d gestao_hotel -f /dev/stdin < db/schema.sql

# 3. Aplicar seed manual
docker compose exec postgres psql -U hotel_user -d gestao_hotel -f /dev/stdin < seed/seed_hotels.sql

# 4. Rodar a migração oficial do projeto
node command.js migrate
```

Critério de aceite:

- o schema precisa subir sem erro
- o seed precisa subir sem erro
- o migrate não pode falhar por FK ou tabela inexistente
- o migrate não deveria tentar corrigir uma estrutura grande demais já criada pelo SQL

Se qualquer um desses passos falhar, o problema ainda está no contrato do banco.

### 🟢 Pendência 5 — Definir e documentar a fonte de verdade do banco

O erro do PR #8 aconteceu porque a hierarquia de autoridade não estava explícita.

O time precisa seguir esta ordem:

1. Models Sequelize e `database/relations.js`
2. `node command.js migrate`
3. `db/schema.sql`
4. `seed/seed_hotels.sql`

**Instrução para o Sirlande:** ao encontrar divergência entre SQL manual e Model,
presuma primeiro que o SQL está desatualizado. Só mude o Model depois de checar
todo o fluxo de negócio e as associações.

---

## Como diagnosticar problemas semelhantes no futuro

Como regra geral para este projeto:

1. **O Sequelize é a fonte de verdade do banco.** O `db/schema.sql` é documentação
   auxiliar e deve sempre ser mantido em sincronia com os Models.

2. **Antes de alterar um `tableName`**, pesquise o valor atual em todos os outros
   Models (`grep -r "references" app/Models/`) e no `database/relations.js`.
   Se houver divergência, é o `schema.sql` que está errado — não o Model.

3. **O comando de verificação rápida:**
   ```bash
   # Mostra o tableName de cada Model:
   grep -rn "tableName" app/Models/

   # Mostra para qual tabela cada FK aponta:
   grep -rn "references:" app/Models/
   ```
   Os dois conjuntos de valores precisam ser coerentes entre si.

4. **Nunca altere Models sem rodar `node command.js migrate` localmente** e
   confirmar que não há erros de constraint.

---

## Resumo das correções

| Correção | Arquivo | Branch | Status |
|---|---|---|---|
| Reverter `tableName: 'hotels'` → `'tenants'` | `app/Models/TenantModel.js` | `fix/reverter-danos-pr8` | ✅ Em PR |
| Reescrever schema.sql com nomenclatura correta | `db/schema.sql` | `fix/sincronizar-schema-sql-com-sequelize` | ✅ Em PR |
| Atualizar seed com `tenant_id` e `subdomain` | `seed/seed_hotels.sql` | `fix/sincronizar-schema-sql-com-sequelize` | ✅ Em PR |
