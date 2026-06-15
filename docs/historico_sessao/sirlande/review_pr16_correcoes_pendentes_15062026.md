# Review Técnico — PR#16: Correções de Schema e Seed
**Data:** 15/06/2026
**Revisado por:** Gabriel (orquestrador)
**Branch revisada:** `fix/schema-seed-corrections-20260615`
**Status:** Mergeado em `main` · Revisão pós-merge identificou pendências

---

## Contexto

O PR#16 foi criado para corrigir inconsistências introduzidas pelo PR#8, que alterou o `tableName` do `TenantModel` de `'tenants'` para `'hotels'`, causando quebra de FK em cascata em todos os outros Models. A correção era necessária e o diagnóstico da causa raiz foi preciso.

Este documento registra o que foi entregue corretamente, o que permanece incompleto após o merge e o caminho para resolução.

---

## Parte 1 — Análise do PR

### O que foi entregue com qualidade

#### TenantModel.js ✅
Correção central e correta. Reverter o `tableName` de `'hotels'` para `'tenants'` eliminou a causa raiz do problema. Todos os Models filho usam `model: 'tenants'` em suas FKs e agora o Sequelize resolve as associações corretamente.

#### seed/seed_hotels.sql ✅ Completo
Todas as ocorrências foram corrigidas:
- `INSERT INTO hotels` → `INSERT INTO tenants`
- `FROM hotels h` → `FROM tenants h` (em 5 blocos distintos)
- Condição JOIN que estava invertida (`h.id = rc.tenant_id`) corrigida para a forma canônica (`rc.tenant_id = h.id`)

Essa correção no JOIN é importante: a forma antiga poderia produzir resultados inesperados em bancos com otimizador sensível à ordem de join.

#### db/schema.sql — Tabela principal e trigger ✅
- `CREATE TABLE hotels` → `CREATE TABLE tenants`: correto
- Trigger `trg_hotels_updated_at` → `trg_tenants_updated_at`: correto
- FK de `users.tenant_id` → `REFERENCES tenants(id)`: correto

#### Relatório de sessão ✅
Documentação clara com checklist, passos de validação e lições aprendidas. O padrão adotado é exatamente o esperado.

---

### O que não foi entregue — Pendências identificadas

#### Problema 1 — Crítico: 5 FKs ainda apontam para `hotels(id)` no schema.sql

O `schema.sql` foi parcialmente corrigido. A tabela `users` foi corrigida, mas outras 5 tabelas ainda contêm `REFERENCES hotels(id)`. Isso significa que executar `npm run setup:db` a partir de um banco vazio **vai falhar na criação de `room_categories`** com erro de FK inválida (a tabela `hotels` não existe).

| Tabela | Linha aprox. | Estado atual | Estado esperado |
|---|---|---|---|
| `room_categories` | 55 | `REFERENCES hotels(id)` ❌ | `REFERENCES tenants(id)` |
| `rooms` | 73 | `REFERENCES hotels(id)` ❌ | `REFERENCES tenants(id)` |
| `guests` | 91 | `REFERENCES hotels(id)` ❌ | `REFERENCES tenants(id)` |
| `reservations` | 109 | `REFERENCES hotels(id)` ❌ | `REFERENCES tenants(id)` |
| `payments` | 149 | `REFERENCES hotels(id)` ❌ | `REFERENCES tenants(id)` |

**Por que isso importa:** o `schema.sql` é o ponto de entrada para setup de novos ambientes (staging, produção, CI). Um schema com FKs inválidas bloqueia o setup completo do banco.

#### Problema 2 — Moderado: tabela `payments` fora de sincronia com o PaymentModel

O `PaymentModel.js` possui os campos `deleted_at` e `updatedAt` (mapeado para `updated_at`). O `schema.sql` não reflete esses campos na tabela `payments`, criando divergência entre o Model e o schema de referência.

Campos faltando na definição da tabela `payments`:
- `deleted_at TIMESTAMPTZ` — necessário para soft delete (paranoid: true no Model)
- `updated_at TIMESTAMPTZ DEFAULT now()` — necessário para auditoria

Trigger faltando (linha após os outros triggers):
- `CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();`

---

### Por que o checklist do relatório marcou ✅ se havia pendências?

O checklist foi preenchido com base na intenção das correções, não na verificação linha a linha do arquivo resultante. Isso é um ponto de aprendizado importante:

> **Lição:** O checklist de validação deve sempre ser preenchido **após** verificar o diff final do arquivo (`git diff HEAD db/schema.sql`), não após a edição. A intenção e o resultado nem sempre coincidem.

---

## Parte 2 — Mudanças Pendentes (lista técnica)

**Arquivo único a modificar:** `db/schema.sql`
**Nenhum outro arquivo deve ser alterado nesta correção.**

| # | Mudança | Localização |
|---|---|---|
| 1 | `room_categories.tenant_id`: `REFERENCES hotels(id)` → `REFERENCES tenants(id)` | Linha ~55 |
| 2 | `rooms.tenant_id`: `REFERENCES hotels(id)` → `REFERENCES tenants(id)` | Linha ~73 |
| 3 | `guests.tenant_id`: `REFERENCES hotels(id)` → `REFERENCES tenants(id)` | Linha ~91 |
| 4 | `reservations.tenant_id`: `REFERENCES hotels(id)` → `REFERENCES tenants(id)` | Linha ~109 |
| 5 | `payments.tenant_id`: `REFERENCES hotels(id)` → `REFERENCES tenants(id)` | Linha ~149 |
| 6 | `payments`: adicionar `deleted_at TIMESTAMPTZ` após `paid_at` | Tabela payments |
| 7 | `payments`: adicionar `updated_at TIMESTAMPTZ DEFAULT now()` antes de `CHECK` | Tabela payments |
| 8 | Adicionar `CREATE TRIGGER trg_payments_updated_at ...` | Após linha dos triggers |

**Validação obrigatória após as mudanças:**
```bash
# Verificar que nenhuma ocorrência de hotels(id) restou
grep -n "hotels(id)" db/schema.sql
# Resultado esperado: nenhuma linha

# Verificar que todos os campos de payments estão presentes
grep -A 20 "CREATE TABLE IF NOT EXISTS payments" db/schema.sql
```

---

## Parte 3 — Prompt para IA

Copie o bloco abaixo integralmente e cole no início da conversa com a IA que fará a correção.

---

```
Você é um dev senior Node.js trabalhando em um projeto de hotel PMS SaaS multi-tenant.

CONTEXTO DO PROJETO:
- Stack: Node.js 24, Express 4, Sequelize 6, PostgreSQL 17, ESM (import/export, nunca require)
- Multi-tenancy: tenant_id obrigatório em todas as tabelas
- PKs: UUID em todas as tabelas
- O arquivo db/schema.sql é documentação de referência do banco. Deve sempre espelhar os Models Sequelize.

TAREFA ÚNICA E DELIMITADA:
Corrigir o arquivo db/schema.sql. Apenas esse arquivo. Nenhum outro.

CONTEXTO DA CORREÇÃO:
Um PR anterior (PR#16) corrigiu a tabela principal de 'hotels' para 'tenants' e corrigiu a FK de 'users',
mas deixou 5 tabelas com FKs apontando para a tabela inexistente 'hotels(id)'. Também a tabela 'payments'
está fora de sincronia com o PaymentModel.js.

MUDANÇAS EXATAS A FAZER (8 itens, todos em db/schema.sql):

1. Na definição da tabela room_categories (~linha 55):
   DE:   tenant_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
   PARA: tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

2. Na definição da tabela rooms (~linha 73):
   DE:   tenant_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
   PARA: tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

3. Na definição da tabela guests (~linha 91):
   DE:   tenant_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
   PARA: tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

4. Na definição da tabela reservations (~linha 109):
   DE:   tenant_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
   PARA: tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

5. Na definição da tabela payments (~linha 149):
   DE:   tenant_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
   PARA: tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

6. Na tabela payments, adicionar deleted_at logo após a linha de paid_at:
   ADICIONAR:  deleted_at     TIMESTAMPTZ,

7. Na tabela payments, adicionar updated_at antes do CHECK(amount >= 0):
   ADICIONAR:  updated_at     TIMESTAMPTZ DEFAULT now(),

8. Na seção de triggers (após trg_reservation_rooms_updated), adicionar:
   CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

RESTRIÇÕES ABSOLUTAS — NÃO FAÇA:
- Não altere nenhum outro arquivo além de db/schema.sql
- Não altere Models Sequelize (app/Models/)
- Não altere seeds (seed/)
- Não altere controllers, routes, middlewares
- Não adicione, remova ou reordene tabelas
- Não modifique a lógica de nenhum trigger existente
- Não crie novos índices
- Não altere o EXCLUDE USING gist da tabela reservations

FLUXO GIT OBRIGATÓRIO:
1. git checkout develop && git pull origin develop
2. git checkout -b fix/schema-fk-payments-payments-15jun2026
3. Aplicar apenas as 8 mudanças listadas acima
4. Verificar: grep -n "hotels(id)" db/schema.sql — deve retornar vazio
5. git add db/schema.sql
6. git commit -m "fix(schema): corrigir FKs hotels→tenants e sincronizar payments com PaymentModel"
7. git checkout develop && git merge fix/schema-fk-payments-payments-15jun2026
8. git push origin develop

VALIDAÇÃO FINAL:
Após o commit, execute e confirme que a saída é vazia:
  grep -n "hotels(id)" db/schema.sql

E confirme que payments tem deleted_at, updated_at e o trigger:
  grep -A 15 "CREATE TABLE IF NOT EXISTS payments" db/schema.sql
  grep "trg_payments_updated_at" db/schema.sql

OUTPUT ESPERADO:
- Branch criada: fix/schema-fk-payments-payments-15jun2026
- 1 commit em develop com mensagem convencional
- push feito para origin/develop
- Atualizar seu relatório de sessão em docs/historico_sessao/sirlande/ com o que foi corrigido
```

---

## Checklist de aceite da correção

Antes de marcar como concluído, validar:

- [ ] `grep -n "hotels(id)" db/schema.sql` retorna **vazio**
- [ ] `payments` possui `deleted_at` e `updated_at`
- [ ] `trg_payments_updated_at` está na seção de triggers
- [ ] Nenhum outro arquivo foi modificado
- [ ] Commit segue Conventional Commits (`fix(schema): ...`)
- [ ] Push feito para `origin/develop`
- [ ] Relatório de sessão atualizado

---

*Documento gerado por Gabriel em 15/06/2026 — para uso da Sirlande na correção pós-PR#16*
