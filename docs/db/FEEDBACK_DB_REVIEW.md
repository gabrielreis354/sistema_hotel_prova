# Code Review — Banco de Dados (Branch: feature/sirlande)

> **Tom:** Este documento é um retorno técnico e educacional. O trabalho que você entregou tem uma base sólida — a estrutura das tabelas está correta, as chaves estrangeiras fazem sentido e você usou boas práticas (UUIDs, timestamps, triggers). As observações abaixo são pontos de melhoria que vão alinhar o seu código com a arquitetura multi-tenant do projeto e com padrões de produção.

---

## Sumário dos Pontos de Revisão

| # | Arquivo | Severidade | Assunto |
|---|---------|-----------|---------|
| 1 | schema.sql, setup.sql, DER, seed, queries | Alta | `hotels`/`hotel_id` → `tenants`/`tenant_id` |
| 2 | schema.sql, setup.sql | Alta | Falta `deleted_at` (soft delete) nas tabelas operacionais |
| 3 | schema.sql, setup.sql | Alta | `payments` não tem `tenant_id` |
| 4 | schema.sql, setup.sql | Média | Tabela `hotels` não tem `subdomain` e `status` |
| 5 | queries.sql | Alta (bug) | Query 2 conta reservas canceladas como bloqueando disponibilidade |
| 6 | queries.sql | Alta (bug) | Query 7 calcula ocupação errado (snapshot em vez de data real) |
| 7 | setup.sql | Baixa | `payments.method` não tem `CHECK` constraint |
| 8 | schema.sql vs setup.sql | Baixa | Propósito dos dois arquivos não está claro |
| 9 | seed_hotels.sql | Baixa | Placeholder de senha sem instrução sobre bcrypt |
| 10 | schema.sql | Baixa | `guest_id`/`room_id` nullable sem comentário explicativo |

---

## Ponto 1 — Renomear `hotels` → `tenants` e `hotel_id` → `tenant_id`

**Onde:** `db/schema.sql`, `scripts/setup.sql`, `queries/queries.sql`, `seed/seed_hotels.sql`, `modelagem/DER.mmd`, `modelagem/diagrama_logico.md`

**O que estava:**
```sql
CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY ...
);

CREATE TABLE IF NOT EXISTS users (
  hotel_id UUID NOT NULL REFERENCES hotels(id) ...
);
```

**Por que mudar:**  
No `ARQ_BACKEND.md`, a entidade que representa cada cliente SaaS se chama `Tenant`. No JWT, o payload é `{ userId, role, tenantId }`. O middleware de autenticação injeta `req.tenantId`. Se o banco usa `hotel_id` e o backend usa `tenantId`, precisaremos de mapeamentos desnecessários e o código vai ficar confuso.

Nomear as coisas corretamente é uma das decisões mais importantes em engenharia de software — o nome carrega a intenção.

**Como ficou (após correção):**
```sql
CREATE TABLE IF NOT EXISTS tenants (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      TEXT NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  legal_id  TEXT,
  status    TEXT NOT NULL DEFAULT 'ACTIVE',
  ...
);

CREATE TABLE IF NOT EXISTS users (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ...
);
```

---

## Ponto 2 — Adicionar `deleted_at` para soft delete

**Onde:** `users`, `room_categories`, `rooms`, `guests`, `reservations`

**O que estava:** nenhuma dessas tabelas tinha `deleted_at`.

**Por que importa:**  
No backend, usamos Sequelize com `paranoid: true`. Isso significa que um `DELETE` no ORM não remove a linha do banco — ele apenas preenche `deleted_at`. Se a coluna não existir, o Sequelize vai lançar erro em produção.

Mas além do ORM, soft delete é uma decisão de negócio:
- Se um hóspede for deletado, você não quer perder o histórico das reservas dele.
- Se um quarto for desativado, as reservas passadas ainda precisam existir para fins contábeis.

**Boa prática:** tenants **não** usam soft delete. Um tenant é `SUSPENDED`, nunca deletado do banco. Pagamentos também não — você nunca deleta um registro financeiro.

**Como ficou (após correção):**
```sql
CREATE TABLE IF NOT EXISTS users (
  ...
  deleted_at TIMESTAMP WITH TIME ZONE,  -- soft delete (Sequelize paranoid: true)
  ...
);
```

---

## Ponto 3 — `payments` não tem `tenant_id`

**Onde:** `db/schema.sql`, `scripts/setup.sql`

**O que estava:**
```sql
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY ...,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  method         TEXT NOT NULL,
  ...
);
```

**Por que importa:**  
Uma query muito comum é "qual a receita total do Hotel Aurora em março?". Sem `tenant_id` em `payments`, você precisa fazer:

```sql
-- ❌ Sem tenant_id em payments: JOIN extra obrigatório
SELECT SUM(p.amount)
FROM payments p
JOIN reservations r ON r.id = p.reservation_id
WHERE r.tenant_id = $1
  AND EXTRACT(MONTH FROM p.paid_at) = 3;
```

Com `tenant_id` em `payments` (denormalização intencional):
```sql
-- ✅ Com tenant_id em payments: direto e eficiente
SELECT SUM(p.amount)
FROM payments p
WHERE p.tenant_id = $1
  AND EXTRACT(MONTH FROM p.paid_at) = 3;
```

Em multi-tenant, você vai rodar essa query centenas de vezes. Denormalizar `tenant_id` em `payments` é um trade-off deliberado que simplifica as queries mais comuns de relatório financeiro.

**Como ficou (após correção):**
```sql
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY ...,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  ...
);
```

---

## Ponto 4 — Tabela `hotels` (agora `tenants`) sem `subdomain` e `status`

**Onde:** `db/schema.sql`, `scripts/setup.sql`

**O que estava:**
```sql
CREATE TABLE IF NOT EXISTS hotels (
  id       UUID PRIMARY KEY ...,
  name     TEXT NOT NULL,
  legal_id TEXT,
  ...
);
```

**Por que importa:**  
- `subdomain`: é como o sistema identifica qual tenant está fazendo a requisição. O domínio `aurora.seupms.com.br` aponta para o tenant `aurora`. Sem esse campo, como você resolve o tenant no middleware?
- `status`: um tenant pode ser suspenso por inadimplência (fase Produto). Se você não tem `status`, não tem como bloquear o acesso sem deletar o registro.

**Como ficou (após correção):**
```sql
CREATE TABLE IF NOT EXISTS tenants (
  ...
  subdomain TEXT NOT NULL UNIQUE,         -- ex: aurora.seupms.com.br
  status    TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED
  CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);
```

---

## Ponto 5 — Bug na Query 2: disponibilidade conta reservas canceladas

**Onde:** `queries/queries.sql` — Query 2 (verificação de disponibilidade)

**O que estava:**
```sql
-- ❌ Reservas CANCELLED ainda bloqueiam disponibilidade!
SELECT r.*
FROM rooms r
LEFT JOIN reservations res ON res.room_id = r.id
  AND NOT (res.check_out_date <= $2 OR res.check_in_date >= $3)
WHERE r.hotel_id = $1
  AND res.id IS NULL
  AND r.status = 'AVAILABLE';
```

**Por que é um bug:**  
Se uma reserva foi cancelada, ela ainda aparece no JOIN. O `LEFT JOIN ... WHERE res.id IS NULL` significa "quartos sem nenhuma reserva sobreposta" — mas uma reserva cancelada vai aparecer como "sobreposta" e o quarto vai parecer indisponível quando na verdade está livre.

**Exemplo prático:**  
> Quarto 101 tinha reserva de 10 a 15/jan, mas foi CANCELADA.  
> Cliente tenta reservar de 12 a 14/jan → sistema diz que está ocupado. ❌  
> Isso é um bug que causa perda de receita.

**Como ficou (após correção):**
```sql
-- ✅ Exclui reservas encerradas/canceladas da verificação de bloqueio
SELECT r.*
FROM rooms r
LEFT JOIN reservations res ON res.room_id = r.id
  AND NOT (res.check_out_date <= $2 OR res.check_in_date >= $3)
  AND res.status NOT IN ('CANCELLED', 'CHECKED_OUT')  -- << correção chave
  AND res.deleted_at IS NULL
WHERE r.tenant_id = $1
  AND res.id IS NULL
  AND r.status = 'AVAILABLE'
  AND r.deleted_at IS NULL;
```

---

## Ponto 6 — Bug na Query 7: taxa de ocupação usa snapshot, não data real

**Onde:** `queries/queries.sql` — Query 7 (taxa de ocupação)

**O que estava:**
```sql
-- ❌ Calcula ocupação usando o status ATUAL do quarto, não reservas por data
SELECT (COUNT(r.id) FILTER (WHERE r.status = 'OCCUPIED')::float
        / NULLIF(COUNT(r.id), 0)) AS occupancy_rate
FROM rooms r
WHERE r.hotel_id = $1;
-- $2 = date está declarado mas NUNCA USADO!
```

**Por que é um bug:**  
- O campo `rooms.status` é o status *atual* do quarto (agora, neste momento). Ele muda com o check-in/check-out.
- Se você perguntar "qual foi a ocupação na semana passada?", essa query vai te dar o status *de hoje*, não do passado.
- A pergunta `$2 = date` está no parâmetro mas não é usada — sinal claro de que a lógica está errada.

**Conceito correto:** ocupação em uma data = quantos quartos tinham uma reserva CONFIRMED ou CHECKED_IN cobrindo aquela data.

**Como ficou (após correção):**
```sql
-- ✅ Ocupação real baseada em reservas que cobrem a data $2
SELECT
  ROUND(
    COUNT(res.id)::numeric / NULLIF(COUNT(r.id), 0) * 100, 1
  ) AS occupancy_pct
FROM rooms r
LEFT JOIN reservations res
  ON  res.room_id       = r.id
  AND res.tenant_id     = r.tenant_id
  AND res.check_in_date  <= $2           -- reserva começa antes ou no dia
  AND res.check_out_date >  $2           -- e ainda não terminou
  AND res.status IN ('CONFIRMED', 'CHECKED_IN')
  AND res.deleted_at IS NULL
WHERE r.tenant_id  = $1
  AND r.deleted_at IS NULL;
```

---

## Ponto 7 — `payments.method` sem `CHECK` constraint

**Onde:** `scripts/setup.sql`

**O que estava:**
```sql
method TEXT NOT NULL,   -- sem restrição de valores
```

**Por que importa:**  
Você tem `CHECK` em `users.role`, `rooms.status`, `reservations.status` — mas esqueceu de `payments.method`. Sem isso, alguém poderia inserir `'BITCOIN'` ou `'pix'` (minúsculo) e o banco aceitaria.

**Como ficou (após correção):**
```sql
method TEXT NOT NULL,
CHECK (method IN ('PIX', 'CASH', 'CARD', 'TRANSFER'))
```

---

## Ponto 8 — Diferença entre `schema.sql` e `setup.sql` não estava clara

**Onde:** `db/schema.sql` e `scripts/setup.sql`

**O que estava:** os dois arquivos eram quase idênticos, sem comentários explicando o propósito de cada um.

**Como deve ser:**
- **`db/schema.sql`** — referência de leitura. Define as tabelas com comentários detalhados explicando cada coluna e decisão de design. É o "livro de cabeceira" do banco.
- **`scripts/setup.sql`** — script executável para criar o banco do zero em desenvolvimento ou CI. Tem todas as constraints, CHECKs e triggers, sem comentários longos. É o que você roda no terminal: `psql -f scripts/setup.sql`.

Em produção, nenhum dos dois seria usado diretamente — você usaria `sequelize-cli` migrations para controle versionado de alterações.

---

## Ponto 9 — Seed com placeholder de senha sem instrução de bcrypt

**Onde:** `seed/seed_hotels.sql`

**O que estava:**
```sql
INSERT INTO users (..., password_hash, ...)
SELECT ..., 'HASHED_PASSWORD_PLACEHOLDER', ...
```

**Por que importa:**  
`HASHED_PASSWORD_PLACEHOLDER` não é um hash bcrypt válido. Se alguém rodar esse seed e tentar fazer login, vai falhar silenciosamente — e a causa vai ser difícil de debugar.

**Como ficou (após correção):**
```sql
'$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH', -- bcrypt.hashSync('senha123', 10)
```

Com instrução no comentário de como gerar o hash:
```js
// Node.js (rodar antes do seed):
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('senha123', 10);
console.log(hash); // copiar o resultado para o seed
```

---

## Ponto 10 — `guest_id`/`room_id` nullable sem comentário explicando o motivo

**Onde:** `db/schema.sql` — tabela `reservations`

**O que estava:**
```sql
guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
room_id  UUID REFERENCES rooms(id)  ON DELETE SET NULL,
-- sem comentário explicando por que são nullable
```

**Por que importa:**  
`ON DELETE SET NULL` é uma decisão de design que pode confundir. A primeira reação é: "uma reserva sem hóspede ou sem quarto faz sentido?". A resposta é: **no momento da criação, não** — mas ao longo do tempo, sim, para preservar o histórico.

Se o quarto `101` for soft-deletado (desativado), a reserva passada ainda precisa existir para fins contábeis e histórico. `ON DELETE SET NULL` garante que o registro da reserva sobreviva mesmo que o quarto ou hóspede seja (soft-)deletado.

**Como ficou (após correção):**
```sql
-- guest_id e room_id são nullable: ON DELETE SET NULL preserva histórico
-- Se hóspede/quarto for soft-deletado, a reserva permanece como registro
guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
room_id  UUID REFERENCES rooms(id)  ON DELETE SET NULL,
```

---

## Resumo Final

| Ponto | Tipo | Status |
|-------|------|--------|
| 1. Renomear hotels → tenants | Alinhamento de arquitetura | ✅ Corrigido |
| 2. Adicionar deleted_at | Funcionalidade (soft delete) | ✅ Corrigido |
| 3. tenant_id em payments | Design multi-tenant | ✅ Corrigido |
| 4. subdomain + status em tenants | Campos obrigatórios SaaS | ✅ Corrigido |
| 5. Query 2: disponibilidade | Bug de lógica | ✅ Corrigido |
| 6. Query 7: ocupação | Bug de lógica | ✅ Corrigido |
| 7. CHECK em payments.method | Integridade de dados | ✅ Corrigido |
| 8. Propósito schema.sql vs setup.sql | Documentação | ✅ Comentários adicionados |
| 9. Placeholder bcrypt no seed | Usabilidade do seed | ✅ Corrigido |
| 10. Nullable sem comentário | Legibilidade | ✅ Comentário adicionado |

As correções já foram aplicadas nos arquivos. O próximo passo é revisar junto e, a partir daí, iniciar as migrations com `sequelize-cli` para ter controle versionado das mudanças de schema.

Bom trabalho na estrutura base — é muito mais fácil refinar do que construir do zero. 🎯
