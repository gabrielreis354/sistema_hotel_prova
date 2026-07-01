# Roteiro de Apresentação — Banco de Dados
## Sistema de Gestão de Hotel (SaaS Multi-Tenant)

**Apresentadora:** Sirlande
**Data:** 28/06/2026
**Duração alvo:** ~8 minutos

---

## Estrutura da Apresentação

```
[00:00] ESCOLHA TECNOLÓGICA        — Por que PostgreSQL?          ~2 min
[02:00] REQUISITOS DO SISTEMA      — Entidades e volumes          ~1 min
[03:00] MODELAGEM E ESTRUTURA      — Schema, DDL, constraints     ~2 min
[05:00] NORMALIZAÇÃO               — 1FN, 2FN, 3FN ao vivo       ~1 min
[06:00] PERFORMANCE E ÍNDICES      — Queries críticas             ~1,5 min
[07:30] DADOS DE TESTE             — Seed com 165 registros       ~30 s
```

---

## [00:00 – 02:00] ESCOLHA TECNOLÓGICA — Por que PostgreSQL?

### Mostrar na tela
`justificativa/arquitetura.md` ou terminal com `psql --version`

### Fala

> "Professor, nosso sistema é um PMS — Property Management System — para hotéis.
> Antes de qualquer linha de código, precisávamos decidir: SQL ou NoSQL?
>
> A resposta foi SQL, especificamente PostgreSQL 17. Deixa eu explicar cada decisão."

**Argumento 1 — ACID é inegociável:**

> "Um check-in no nosso sistema muda o status da reserva para CHECKED_IN e ao
> mesmo tempo muda o status do quarto para OCCUPIED. Se o sistema cair no meio,
> o quarto ficaria travado como ocupado sem uma reserva associada.
> Sem transação ACID, isso é impossível de evitar. Com PostgreSQL, é uma única
> instrução COMMIT."

Mostrar no código:
```bash
grep -A 8 "sequelize.transaction" app/Controllers/ReservationApi/CheckInController.js
```

**Argumento 2 — EXCLUDE USING gist (impossível em NoSQL):**

> "Esta é a feature mais importante do nosso schema. O PostgreSQL tem uma constraint
> chamada EXCLUDE que impede, em nível de banco, que dois registros se sobreponham.
> Nós usamos isso para garantir que o mesmo quarto nunca tenha duas reservas com
> datas conflitantes — mesmo que dois recepcionistas tentem ao mesmo tempo."

Mostrar no schema:
```bash
grep -A 4 "EXCLUDE USING" db/schema.sql
```

**Saída esperada:**
```sql
EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
)
```

> "Isso lê assim: para o mesmo `room_id`, nenhum dois intervalos de data
> podem se sobrepor. É uma proteção em nível de banco — independente do código."

**Argumento 3 — Por que não NoSQL:**

> "Poderíamos ter usado MongoDB. Mas o dado de hotel tem estrutura fixa:
> uma reserva sempre tem hóspede, quarto, datas e valor.
> Schema flexível seria complexidade sem benefício.
> E consistência eventual — o padrão de NoSQL distribuído — é inaceitável
> para transações financeiras e controle de estado de quarto.
> O volume estimado de 15 mil reservas por ano não justifica um cluster NoSQL."

---

## [02:00 – 03:00] REQUISITOS DO SISTEMA

### Fala

> "O sistema gerencia múltiplos hotéis na mesma infraestrutura — o que chamamos
> de SaaS multi-tenant. Cada hotel é um tenant. Os dados de um hotel nunca
> aparecem para outro."

**Entidades principais:**

| Entidade | O que representa |
|---|---|
| `tenants` | Cada hotel/pousada cadastrado |
| `users` | Recepcionistas e admins do hotel |
| `room_categories` | Tipos de quarto com preço por noite |
| `rooms` | Quartos físicos com status |
| `guests` | Hóspedes cadastrados |
| `reservations` | Reservas com datas, status e valor |
| `reservation_rooms` | Tabela pivô N:N — quartos extras por reserva |
| `payments` | Registros de pagamento |

**Volume:**

> "Para 10 hotéis no primeiro ano: ~15 mil reservas, ~12 mil hóspedes, ~20 mil
> pagamentos. Crescimento de ~50 MB por tenant por ano. Sem necessidade de
> particionamento nos primeiros 3 anos."

**Usuários simultâneos:**

> "3 a 8 recepcionistas por tenant, pico de 50 requisições por minuto em
> temporada alta. O PostgreSQL suporta isso confortavelmente com connection pooling."

---

## [03:00 – 05:00] MODELAGEM E ESTRUTURA

### Parte 1 — Mostrar o DER

```bash
# Abrir a imagem do DER
ls modelagem/
```

> "O diagrama mostra as 8 tabelas e os relacionamentos.
>
> Quero destacar três pontos que foram decisões arquiteturais deliberadas."

**Decisão 1 — UUID como PK:**

> "Todas as tabelas usam UUID como chave primária, gerado pelo PostgreSQL com
> a extensão `uuid-ossp`. Por quê não AUTO_INCREMENT?
> Em SaaS multi-tenant, IDs sequenciais vazam informação: o hotel A com ID 1
> e o hotel B com ID 2 entendem que são os primeiros clientes.
> UUID não vaza volume. Também elimina colisão ao migrar dados entre ambientes."

```bash
grep "uuid_generate_v4" db/schema.sql | head -5
```

**Decisão 2 — Soft Delete:**

> "A maioria das tabelas tem uma coluna `deleted_at`. Quando deletamos um quarto
> ou hóspede, não apagamos o registro — apenas marcamos essa coluna.
> Por quê? LGPD exige histórico. E uma reserva passada não pode simplesmente
> desaparecer do relatório financeiro porque o hóspede foi removido."

```bash
grep "deleted_at" db/schema.sql | head -6
```

**Decisão 3 — Tabela pivô `reservation_rooms` (N:N):**

> "Uma reserva pode ter múltiplos quartos — por exemplo, um grupo que aluga
> uma suíte e um quarto standard juntos. Para isso criamos a tabela
> `reservation_rooms`, que é a materialização do relacionamento N:N
> entre reservas e quartos."

### Parte 2 — DDL e Constraints

Mostrar o schema:
```bash
cat db/schema.sql
```

**Constraints a destacar durante a leitura:**

```sql
-- Em tenants:
CHECK (status IN ('ACTIVE', 'SUSPENDED'))

-- Em users:
UNIQUE (tenant_id, email)         -- e-mail único POR hotel, não globalmente
CHECK (role IN ('ADMIN', 'RECEPTIONIST'))

-- Em rooms:
CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'))

-- Em room_categories:
CHECK (capacity > 0)
CHECK (price_per_night >= 0)

-- Em reservations:
CHECK (check_out_date > check_in_date)   -- checkout sempre depois do checkin
CHECK (total_amount >= 0)
EXCLUDE USING gist (...)                  -- anti-double-booking
```

> "Cada CHECK constraint é uma regra de negócio garantida em nível de banco.
> O código pode ter bug, mas o banco nunca vai aceitar uma reserva com
> checkout antes do checkin."

### Parte 3 — Chaves Estrangeiras e Cascata

```bash
grep "REFERENCES\|ON DELETE" db/schema.sql
```

> "Olhem os dois padrões de cascata:
>
> - `ON DELETE CASCADE`: usuários e quartos são deletados quando o tenant some
> - `ON DELETE RESTRICT`: uma reserva não pode ser deletada se tiver pagamentos
>
> Isso reflete regras de negócio: o hotel some, os usuários dele também somem.
> Mas um pagamento nunca pode ser apagado por causa de uma reserva que desapareceu."

---

## [05:00 – 06:00] NORMALIZAÇÃO — 1FN, 2FN, 3FN

### Fala

> "Vamos aplicar as formas normais no nosso schema. Vou usar a tabela de
> reservas como exemplo principal."

**1FN — Primeira Forma Normal:**

> "1FN exige que todos os atributos sejam atômicos — sem listas ou grupos
> repetidos numa coluna.
>
> Nossa tabela `reservations` é 1FN: cada coluna tem um único valor.
> O múltiplos quartos por reserva? Em vez de criar uma coluna `quartos_ids`
> com uma lista, criamos a tabela separada `reservation_rooms`.
> Isso é exatamente o que a 1FN exige."

```sql
-- ERRADO (viola 1FN):
reservations(id, guest_id, room_ids_array, ...)

-- CORRETO (1FN aplicada):
reservations(id, guest_id, room_id, ...)   -- quarto principal
reservation_rooms(reservation_id, room_id) -- quartos extras em tabela separada
```

**2FN — Segunda Forma Normal:**

> "2FN exige que atributos não-chave dependam da chave primária INTEIRA,
> não de parte dela. Aplica-se a tabelas com chave composta.
>
> Nossa tabela `reservation_rooms` tem chave composta implícita
> (reservation_id, room_id). O único atributo além da chave é `id` e timestamps.
> Não há atributo que dependa só de `reservation_id` ou só de `room_id`.
> Está na 2FN.
>
> Outro exemplo: `rooms` tem `category_id`. O `price_per_night` está em
> `room_categories`, não em `rooms`. Se estivesse em `rooms`, seria redundância:
> dois quartos da mesma categoria teriam o mesmo preço duplicado. A separação
> respeita a 2FN."

**3FN — Terceira Forma Normal:**

> "3FN exige que não haja dependências transitivas — um atributo não pode
> depender de outro não-chave.
>
> Em `reservations`, temos `total_amount`. Esse valor é calculado no momento
> da criação da reserva: dias × preço da categoria. Ele NÃO depende do quarto
> diretamente — depende do preço da categoria DO quarto. Poderíamos ter omitido
> `total_amount` e calculado sempre na query. Escolhemos materializá-lo por
> razões práticas: o preço pode mudar, mas o valor da reserva já feita deve ser
> imutável. É uma desnormalização deliberada e justificada."

> "Essa é a única exceção: `total_amount` em `reservations` é desnormalizado
> intencionalmente, porque em um sistema financeiro o valor cobrado não pode
> retroativamente mudar se o preço da categoria for alterado."

---

## [06:00 – 07:30] PERFORMANCE E ÍNDICES

### Parte 1 — Tabela de Índices

```bash
grep "CREATE INDEX" db/schema.sql
```

**Saída:**
```sql
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);
```

**Tabela de índices para mostrar:**

| Índice | Tabela | Campos | Tipo | Motivo |
|---|---|---|---|---|
| `idx_reservations_tenant_checkin` | `reservations` | `(tenant_id, check_in_date)` | B-Tree composto | Queries de painel do dia e relatório de período — filtro obrigatório em toda consulta de reservas |
| `idx_rooms_tenant_status` | `rooms` | `(tenant_id, status)` | B-Tree composto | Listagem de quartos disponíveis — consulta mais frequente do sistema |
| `idx_users_tenant_email` | `users` | `(tenant_id, email)` | B-Tree composto | Login — busca por e-mail acontece a cada autenticação |
| `idx_reservation_rooms_res_id` | `reservation_rooms` | `(reservation_id)` | B-Tree | JOIN ao buscar quartos extras de uma reserva |
| *(implícito)* | `tenants` | `(subdomain)` | B-Tree (UNIQUE) | UNIQUE já cria índice automaticamente |
| *(implícito)* | `guests` | `(tenant_id, cpf)` | B-Tree (UNIQUE) | Busca de hóspede por CPF no balcão |

> "Note que todos os índices são compostos com `tenant_id` como primeiro campo.
> Por quê? Porque toda query começa com `WHERE tenant_id = $1`. Colocar
> `tenant_id` primeiro no índice faz o PostgreSQL eliminar 99% das linhas
> antes de avaliar o segundo campo."

### Parte 2 — Consultas Críticas ao Vivo

**Consulta 1 — Disponibilidade de quartos:**

```bash
cat queries/consultas_avancadas.sql | head -40
```

> "Esta é a consulta executada quando o recepcionista abre o calendário.
> O LEFT JOIN com IS NULL é o padrão anti-semi-join: lista todos os quartos
> que NÃO aparecem em reservas ativas no período solicitado."

**Consulta 2 — Painel do dia:**

> "Mostra quem chega e quem sai hoje. JOIN de 4 tabelas: reservations, guests,
> rooms, room_categories. Usa o índice idx_reservations_tenant_checkin
> diretamente."

**Consulta 3 — Receita por mês (Agregação):**

```bash
cat queries/agregacoes.sql | head -25
```

> "Relatório financeiro mensal. Usa `date_trunc('month', paid_at)` para agrupar,
> com SUM e AVG para receita total e ticket médio por período."

**Consulta 4 — Taxa de ocupação:**

```bash
cat queries/agregacoes.sql | sed -n '40,75p'
```

> "Calcula o percentual de quartos ocupados em uma data.
> Usa NULLIF para evitar divisão por zero caso o hotel ainda não tenha quartos.
> Este KPI alimenta o endpoint `GET /analytics/occupancy` da nossa API."

**Consulta 5 — Top hóspedes por valor:**

```bash
cat queries/agregacoes.sql | tail -30
```

> "Ranking de hóspedes por lifetime value — quanto cada cliente gastou no total.
> JOIN entre guests e reservations com GROUP BY. Alimenta o endpoint
> `GET /analytics/top-guests`."

---

## [07:30 – 08:00] DADOS DE TESTE

### Fala

> "O professor pediu mínimo de 100 registros para avaliar performance.
> Nosso seed cria 165 registros distribuídos em 2 tenants reais:
> Hotel Aurora e Pousada Sol."

```bash
tail -10 seed/seed_hotels.sql
```

**Saída esperada:**
```sql
-- RESUMO DO SEED
-- tenants: 2 | room_categories: 5 | rooms: 25 | users: 5
-- guests: 60 | reservations: 40 | payments: 28
-- TOTAL: 165 registros
```

> "O seed é idempotente — pode rodar várias vezes sem duplicar dados.
> Usa ON CONFLICT DO NOTHING e referencia registros por subdomínio, CPF e
> número de quarto — nunca por UUID hardcoded.
> Isso garante que funciona em qualquer ambiente: local, Docker ou Kubernetes."

**Para verificar ao vivo no Kubernetes:**
```bash
kubectl exec -n hotel-system statefulset/postgres -- \
  psql -U hotel_user -d gestao_hotel -c "
    SELECT 
      (SELECT COUNT(*) FROM tenants)       AS tenants,
      (SELECT COUNT(*) FROM rooms)         AS quartos,
      (SELECT COUNT(*) FROM guests)        AS hospedes,
      (SELECT COUNT(*) FROM reservations)  AS reservas,
      (SELECT COUNT(*) FROM payments)      AS pagamentos;
  "
```

**Saída esperada:**
```
 tenants | quartos | hospedes | reservas | pagamentos
---------+---------+----------+----------+-----------
       2 |      25 |       60 |       40 |        28
```

---

## [EXTRA] Demonstração da Exclusion Constraint ao Vivo

> "Vou mostrar o PostgreSQL rejeitando um double-booking em nível de banco."

```bash
# Conectar ao banco via kubectl
kubectl exec -n hotel-system -it statefulset/postgres -- \
  psql -U hotel_user -d gestao_hotel
```

```sql
-- Dentro do psql: pegar IDs reais
SELECT id, number FROM rooms LIMIT 1;
-- Copie o room_id e a data de uma reserva existente

-- Tentar inserir uma reserva que conflita com datas existentes
INSERT INTO reservations (tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date, status, total_amount)
VALUES (
  (SELECT tenant_id FROM rooms WHERE number = '101' LIMIT 1),
  (SELECT id FROM guests WHERE cpf = '30000000001' LIMIT 1),
  (SELECT id FROM rooms WHERE number = '101' LIMIT 1),
  (SELECT id FROM users WHERE email = 'admin@aurora.example'),
  '2026-08-10',  -- data que já tem reserva CONFIRMED
  '2026-08-12',
  'PENDING',
  300.00
);
```

**Saída esperada (constraint rejeitando):**
```
ERROR:  conflicting key value violates exclusion constraint "reservations_room_id_daterange_excl"
DETAIL:  Key (room_id, daterange(check_in_date, check_out_date, '[)'))=(...) conflicts with existing key (...)
```

> "O banco recusou. Isso é proteção em nível de storage — qualquer código
> que tente criar um double-booking, mesmo acessando o banco diretamente,
> é bloqueado."

---

## Organização do Repositório (conforme pedido pelo professor)

```
sistema_hotel_prova/
├── db/
│   └── schema.sql               ← DDL completo (tabelas, índices, triggers)
├── modelagem/
│   ├── der.png                  ← Diagrama Entidade-Relacionamento
│   ├── modelo_logico.png        ← Diagrama Lógico
│   ├── DER.mmd                  ← Fonte Mermaid do DER
│   ├── modelo_logico.mmd        ← Fonte Mermaid do modelo lógico
│   └── dicionario_dados.md      ← Dicionário de dados completo
├── scripts/
│   ├── setup.sql                ← Script alternativo de setup
│   └── setup_db.sh              ← Shell de inicialização do banco
├── seed/
│   └── seed_hotels.sql          ← 165 registros (2 tenants, idempotente)
├── queries/
│   ├── crud.sql                 ← Operações básicas (INSERT/SELECT/UPDATE)
│   ├── consultas_avancadas.sql  ← 5 JOINs críticos do sistema
│   └── agregacoes.sql           ← 5 agregações e relatórios gerenciais
└── justificativa/
    └── arquitetura.md           ← Justificativa técnica da escolha do banco
```

---

## Checklist Pré-Apresentação

- [ ] Kubernetes rodando (`kubectl get pods -n hotel-system` — todos Running)
- [ ] Seed executado (`kubectl exec ... psql < seed/seed_hotels.sql`)
- [ ] `psql` disponível para demonstração ao vivo da constraint
- [ ] `justificativa/arquitetura.md` aberto em aba do editor
- [ ] `db/schema.sql` aberto em aba do terminal
- [ ] `queries/consultas_avancadas.sql` e `queries/agregacoes.sql` abertos
- [ ] Esta fala ensaiada pelo menos 1x antes da apresentação

---

## Perguntas que o professor pode fazer (prepare respostas)

**"Por que UUID e não autoincrement?"**
> UUID não vaza volume de dados para o cliente, não colide em ambientes distribuídos
> e é exigido para PKs seguras em SaaS multi-tenant.

**"O que é o EXCLUDE USING gist?"**
> É uma constraint de exclusão do PostgreSQL. Garante que para o mesmo quarto
> (`room_id WITH =`), nenhum dois intervalos de datas (`daterange ... WITH &&`)
> se sobreponham. Requer a extensão `btree_gist`.

**"O que é soft delete e por que usar?"**
> Em vez de DELETE, marcamos `deleted_at = now()`. O registro permanece no banco.
> Permite auditoria, LGPD (rastreabilidade) e evita FKs órfãs em relatórios históricos.

**"Qual a diferença de RESTRICT e CASCADE no ON DELETE?"**
> CASCADE: deleta registros filhos automaticamente (ex: deletar tenant deleta users)
> RESTRICT: impede a exclusão do pai se houver filhos (ex: não pode deletar reserva com pagamentos)

**"O total_amount não é redundante?"**
> Sim, é uma desnormalização deliberada. O preço por noite pode mudar no futuro,
> mas o valor já cobrado na reserva deve ser imutável para integridade financeira.

**"O que é o btree_gist?"**
> Extensão do PostgreSQL que combina dois tipos de índice — B-Tree (para igualdade)
> e GiST (para intervalos) — permitindo a EXCLUDE constraint em campos mistos como
> `(room_id, daterange)`.

---

## [08:00 – 08:30] CONCLUSÃO — Encerramento (Weslley)

> **Apresentador desta parte:** Weslley
> *(Gabriel apresentou da Escolha Tecnológica até a Demonstração da Exclusion Constraint)*

### Parte 1 — Preparar o ambiente (fazer ANTES de começar a falar)

1. Verificar se o `tree` está instalado (rodar antes do dia da apresentação):
   ```bash
   which tree
   ```
   Se não retornar nada, instalar:
   ```bash
   sudo apt install tree
   ```
2. Ir para a raiz do repositório:
   ```bash
   cd ~/faculdade/TCC/sistema_hotel_prova
   ```
3. Limpar o terminal antes de entrar em cena:
   ```bash
   clear
   ```
4. Aumentar a fonte do terminal para leitura da plateia, se necessário.
5. Exibir a estrutura final do repositório e deixar na tela — serve de apoio
   visual para "schema, modelagem, queries e seed" citados na fala:
   ```bash
   tree -L 2 -I 'node_modules'
   ```
   Se o `tree` não puder ser instalado no dia, usar alternativa nativa
   (sem dependências):
   ```bash
   find . -maxdepth 2 -not -path '*/node_modules*' -not -path '*/.git*' | sort
   ```

### Parte 2 — Fala

> "Para fechar a nossa parte de banco de dados, deixa eu recapitular rapidamente
> o que o Gabriel mostrou e o porquê disso importa.
>
> Vocês viram que cada decisão do nosso schema tem uma justificativa técnica,
> não foi arbitrária:
>
> - Escolhemos **PostgreSQL** porque o domínio do hotel exige ACID e uma
>   constraint que só o Postgres oferece nativamente: o `EXCLUDE USING gist`,
>   que bloqueia double-booking em nível de banco — vocês acabaram de ver
>   o próprio banco rejeitando a tentativa de inserir uma reserva conflitante.
> - Modelamos as **8 entidades** do sistema com UUID como chave primária,
>   soft delete para auditoria e LGPD, e uma tabela pivô para o relacionamento
>   N:N entre reservas e quartos.
> - Aplicamos **1FN, 2FN e 3FN** em todo o schema, com uma única exceção
>   deliberada e justificada: o `total_amount` da reserva, que é
>   desnormalizado de propósito para proteger a integridade financeira.
> - Criamos **índices compostos** pensando em como o sistema realmente é
>   consultado — sempre por `tenant_id` primeiro — e validamos isso com
>   5 consultas críticas de disponibilidade, painel do dia e relatórios
>   gerenciais.
> - E validamos tudo isso com uma **carga de dados real**: 165 registros
>   distribuídos em 2 tenants, rodando no cluster Kubernetes que vocês
>   viram no início da apresentação.
>
> Ou seja: não é só um schema que funciona no papel. É um banco que garante,
> sozinho, que os dados de um hotel nunca se misturam com os de outro,
> que dois recepcionistas nunca conseguem reservar o mesmo quarto na mesma
> data, e que nenhum valor financeiro pode ser alterado retroativamente.
>
> Essa é a nossa camada de dados. Muito obrigado pela atenção de vocês.
> Nosso repositório ficará público, com todos os artefatos disponíveis —
> schema, modelagem, queries e seed — para quem quiser consultar com
> mais calma depois da apresentação."

---

*Roteiro de sessão — Sirlande — 28/06/2026*
*Substituição do roteiro_video_kubernetes_27062026.md para a parte de banco de dados*
