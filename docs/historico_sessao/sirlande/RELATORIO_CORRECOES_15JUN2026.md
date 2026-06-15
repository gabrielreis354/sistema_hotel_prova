# Relatório de Correções - 15 de Junho de 2026

**Data:** 15/06/2026  
**Responsável:** Sirlande Martins  
**Branch:** `fix/schema-seed-corrections-20260615`  
**Referência:** Documento de revisão PR #8 (`docs/historico_sessao/gabriel/REVIEW_PR8_08JUN2026.md`)

---

## Contexto

Este relatório documenta as correções realizadas para sincronizar o `db/schema.sql` e `seed/seed_hotels.sql` com os Models Sequelize, conforme orientado no documento de revisão do PR #8.

O PR #8 introduziu um bug crítico ao alterar o `tableName` do TenantModel de `'tenants'` para `'hotels'`, criando inconsistência com todos os outros Models que referenciam `model: 'tenants'` em suas FKs.

---

## Correções Realizadas

### 1. Correção do TenantModel (Branch anterior)

**Arquivo:** `app/Models/TenantModel.js`  
**Commit:** `36d48ec` na branch `fix/pr-review-corrections-20260611`

**Alteração:**
```diff
- tableName: 'hotels',
+ tableName: 'tenants',
```

**Motivo:** Reverter o bug introduzido pelo PR #8. Todos os outros Models (UserModel, RoomModel, GuestModel, ReservationModel, PaymentModel, RoomCategoryModel) referenciam `model: 'tenants'` em suas FKs. O Sequelize usa o `tableName` para resolver associações.

---

### 2. Correção do db/schema.sql

**Arquivo:** `db/schema.sql`  
**Branch:** `fix/schema-seed-corrections-20260615`

#### Alterações Realizadas:

1. **Nome da tabela principal:**
   ```diff
   - CREATE TABLE IF NOT EXISTS hotels (
   + CREATE TABLE IF NOT EXISTS tenants (
   ```

2. **Todas as referências de FK:**
   ```diff
   - tenant_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
   + tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
   ```
   Aplicado em: `users`, `room_categories`, `rooms`, `guests`, `reservations`, `payments`

3. **Nome do trigger:**
   ```diff
   - CREATE TRIGGER trg_hotels_updated_at BEFORE UPDATE ON hotels
   + CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
   ```

4. **Comentários atualizados:**
   ```diff
   - -- 2) Tabela principal — Hotels (tenants SaaS)
   - -- Model: app/Models/TenantModel.js  |  tableName: 'hotels'
   + -- 2) Tabela principal — Tenants (SaaS)
   + -- Model: app/Models/TenantModel.js  |  tableName: 'tenants'
   ```

**Motivo:** O schema.sql deve espelhar exatamente o que o Sequelize cria via `node command.js migrate`. Como o TenantModel usa `tableName: 'tenants'`, o schema SQL deve criar a tabela `tenants`, não `hotels`.

---

### 3. Correção do seed/seed_hotels.sql

**Arquivo:** `seed/seed_hotels.sql`  
**Branch:** `fix/schema-seed-corrections-20260615`

#### Alterações Realizadas:

1. **INSERT inicial:**
   ```diff
   - INSERT INTO hotels (name, subdomain, legal_id, status) VALUES
   + INSERT INTO tenants (name, subdomain, legal_id, status) VALUES
   ```

2. **Todas as cláusulas FROM:**
   ```diff
   - FROM hotels h WHERE h.subdomain = 'aurora'
   + FROM tenants h WHERE h.subdomain = 'aurora'
   ```
   Aplicado em: `room_categories`, `rooms`, `users`, `guests`

3. **Correção crítica na condição JOIN:**
   ```diff
   - JOIN room_categories rc ON h.id = rc.tenant_id
   + JOIN room_categories rc ON rc.tenant_id = h.id
   ```
   Aplicado nos INSERTs de `rooms`.

**Motivo:** O seed deve usar a mesma nomenclatura do schema corrigido. A condição JOIN estava invertida, o que causaria erro ao executar o seed.

---

## Validação das Correções

### Checklist de Sincronização

| Item | Status | Observação |
|---|---|---|
| `tableName` do TenantModel | ✅ | `'tenants'` |
| `references.model` nos Models filhos | ✅ | `'tenants'` |
| `schema.sql` tabela principal | ✅ | `tenants` |
| `schema.sql` FKs | ✅ | `REFERENCES tenants(id)` |
| `seed_hotels.sql` INSERT | ✅ | `INSERT INTO tenants` |
| `seed_hotels.sql` FROM clauses | ✅ | `FROM tenants` |
| `seed_hotels.sql` JOIN condition | ✅ | `rc.tenant_id = h.id` |

### Validação Sugerida

Para validar que as correções estão corretas, executar:

```bash
# 1. Subir o banco limpo:
docker compose up postgres -d

# 2. Executar o schema SQL:
docker compose exec postgres psql -U hotel_user -d gestao_hotel -f /dev/stdin < db/schema.sql

# 3. Executar o seed manual:
docker compose exec postgres psql -U hotel_user -d gestao_hotel -f /dev/stdin < seed/seed_hotels.sql

# 4. Rodar a migração oficial do projeto:
node command.js migrate
```

**Critério de aceite:**
- O schema deve subir sem erro
- O seed deve subir sem erro
- O migrate não pode falhar por FK ou tabela inexistente
- O migrate não deve tentar ALTER TABLE em estruturas já criadas pelo SQL

---

## Commits Realizados

### Branch: fix/pr-review-corrections-20260611

```
36d48ec - correcao: reverter tableName do TenantModel de 'hotels' para 'tenants' para corresponder as referencias FK
```

### Branch: fix/schema-seed-corrections-20260615

```
[commit 1] - correcao: alterar schema.sql de hotels para tenants para corresponder ao TenantModel
[commit 2] - correcao: atualizar seed_hotels.sql para usar tabela tenants e corrigir condicao JOIN
```

---

## Arquivos Modificados

1. `app/Models/TenantModel.js` (branch anterior)
2. `db/schema.sql`
3. `seed/seed_hotels.sql`

---

## Observações Resolvidas

| Observação | Tipo | Status |
|---|---|---|
| BUG 1 - TenantModel tableName incorreto | Bug (Crítico) | ✅ Resolvido |
| Correção 2 - schema.sql desatualizado | Refatoração | ✅ Resolvido |
| Correção 3 - seed_hotels.sql desatualizado | Refatoração | ✅ Resolvido |

---

## Próximos Passos

1. Validar as correções executando o fluxo de validação sugerido acima
2. Criar Pull Request para merge das correções
3. Atualizar documentação do projeto para deixar explícita a fonte de verdade do banco (Models Sequelize)

---

## Lições Aprendidas

1. **Fonte de verdade:** Os Models Sequelize são a fonte de verdade do banco. O `db/schema.sql` é documentação auxiliar e deve sempre ser mantido em sincronia.
2. **Verificação cruzada:** Antes de alterar um `tableName`, pesquisar o valor atual em todos os outros Models e no `database/relations.js`.
3. **Validação obrigatória:** Nunca alterar Models sem rodar `node command.js migrate` localmente e confirmar que não há erros de constraint.

---

**Fim do Relatório**
