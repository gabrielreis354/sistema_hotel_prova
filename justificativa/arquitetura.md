# Justificativa de Arquitetura — Banco de Dados
**Sistema:** Sistema de Gestão de Hotel (SaaS Multi-Tenant)
**Data:** 17/06/2026

---

## 1. Definição da Arquitetura

### 1.1 Escolha Tecnológica

**Tipo de banco:** SQL (Relacional)

**Provedor:** PostgreSQL 17

**Justificativa técnica:**

O sistema de gestão hoteleira lida com dados altamente estruturados e com relações bem definidas entre entidades (hóspedes, reservas, quartos, pagamentos). Essas características tornam o modelo relacional a escolha natural:

| Critério | Justificativa |
|---|---|
| **Integridade transacional (ACID)** | Operações críticas como check-in e pagamento envolvem múltiplas tabelas simultaneamente. O suporte a transações ACID do PostgreSQL garante que uma falha parcial não deixe o banco em estado inconsistente. |
| **Relacionamentos complexos** | O domínio tem relações N:N (reservas↔quartos via tabela pivô), FKs com regras de cascata distintas por entidade e restrições de sobreposição temporal — bem servidas por SQL. |
| **Constraints avançadas** | O PostgreSQL suporta `EXCLUDE USING gist` com `btree_gist`, que impede reservas sobrepostas no mesmo quarto em nível de banco — proteção impossível de replicar com a mesma elegância em NoSQL. |
| **Extensões** | `uuid-ossp` (PKs UUID), `btree_gist` (exclusion constraint), suporte nativo a `JSONB` para metadados futuros sem migração de schema. |
| **Multi-tenancy lógica** | A separação de dados por `tenant_id` em cada tabela é implementada de forma simples e eficiente com índices compostos — sem necessidade de múltiplos bancos ou coleções separadas. |
| **Consultas analíticas** | Relatórios de receita por período, taxa de ocupação e disponibilidade por intervalo de datas são consultas com agregações e JOINs que o PostgreSQL executa com eficiência via índices compostos. |

**Por que não NoSQL:**
- Dados de reservas têm estrutura fixa e invariável — não há ganho em schema flexível
- Consistência eventual (modelo padrão NoSQL) é inaceitável para transações financeiras e de estado de quarto
- O volume projetado (< 100 mil reservas/ano por tenant) não justifica a complexidade operacional de um cluster NoSQL

---

### 1.2 Requisitos do Sistema

**Objetivo do sistema:**
Plataforma SaaS para gestão operacional de hotéis e pousadas de pequeno e médio porte. Permite que múltiplos estabelecimentos (tenants) compartilhem a mesma infraestrutura com isolamento total de dados entre eles.

**Principais entidades:**

| Entidade | Descrição |
|---|---|
| `tenants` | Cada hotel/pousada cadastrada na plataforma |
| `users` | Funcionários do hotel (ADMIN, RECEPTIONIST) |
| `room_categories` | Tipos de quarto com preço por noite |
| `rooms` | Quartos físicos com status operacional |
| `guests` | Hóspedes cadastrados |
| `reservations` | Reservas com datas, status e valor total |
| `reservation_rooms` | Tabela pivô N:N (quartos extras por reserva) |
| `payments` | Registros de pagamento por reserva |

**Volume estimado de dados:**

| Entidade | Estimativa por tenant/ano | Base total (10 tenants) |
|---|---|---|
| Reservas | 1.500 | 15.000/ano |
| Hóspedes | 1.200 (com recorrência) | 12.000 |
| Pagamentos | 2.000 (parcelas) | 20.000/ano |
| Quartos | 30 (estável) | 300 |
| Usuários | 10 (estável) | 100 |

Crescimento anual estimado do banco: ~50 MB/tenant. Sem necessidade de particionamento nos primeiros 3 anos de operação.

**Quantidade estimada de usuários:**
- Usuários simultâneos por tenant: 3–8 (recepcionistas em turno)
- Pico de requisições: 50 req/min (check-in/check-out em temporada alta)
- Usuários totais na plataforma: até 200 em fase inicial

**Principais consultas realizadas:**
1. Quartos disponíveis por período (operação de reserva — alta frequência)
2. Reservas por status e data (painel do dia — alta frequência)
3. Busca de hóspede por CPF (autenticação e histórico)
4. Receita por período por tenant (relatório financeiro)
5. Taxa de ocupação por data (relatório gerencial)

---

## 2. Modelagem e Normalização

### 2.1 Primeira Forma Normal (1FN)

**Regra:** Cada coluna deve conter valores atômicos (indivisíveis) e cada linha deve ser única.

**Aplicação no schema:**

Todas as tabelas atendem 1FN:
- Cada coluna armazena um único valor atômico (ex: `cpf TEXT`, `check_in_date DATE`)
- Não há colunas com listas ou arrays — a relação N:N entre reservas e quartos é resolvida pela tabela pivô `reservation_rooms` em vez de armazenar múltiplos `room_id` em uma coluna
- Todas as linhas são identificadas de forma única por UUID (`id UUID PRIMARY KEY`)

**Exemplo de violação que foi evitada:**
```
-- ERRADO (viola 1FN): múltiplos quartos em uma coluna
reservations.room_ids = 'uuid-1, uuid-2, uuid-3'

-- CORRETO: tabela pivô reservation_rooms
reservation_rooms (reservation_id FK, room_id FK)
```

---

### 2.2 Segunda Forma Normal (2FN)

**Regra:** Estar em 1FN e cada atributo não-chave deve depender funcionalmente da chave primária inteira (sem dependências parciais — aplica-se a PKs compostas).

**Aplicação no schema:**

Todas as tabelas usam PKs simples (UUID único), eliminando o risco de dependências parciais por design. Não há tabela com PK composta, exceto `reservation_rooms` onde ambas as colunas (`reservation_id`, `room_id`) formam o relacionamento e não existem atributos extras que dependam apenas de uma delas.

**Verificação em `reservation_rooms`:**
```
reservation_rooms (reservation_id PK/FK, room_id PK/FK)
-- Não há atributos extras que dependam só de reservation_id ou só de room_id
-- Logo: sem dependência parcial → 2FN atendida
```

---

### 2.3 Terceira Forma Normal (3FN)

**Regra:** Estar em 2FN e não ter dependências transitivas (atributo não-chave dependendo de outro atributo não-chave).

**Aplicação no schema — caso principal:**

A entidade `rooms` poderia violar 3FN se armazenasse `price_per_night` diretamente:
```
-- VIOLAÇÃO de 3FN (hipotético):
rooms (id, category_id, number, price_per_night)
-- price_per_night depende de category_id, não de id
```

A separação em `room_categories` resolve:
```
rooms (id, category_id FK, number, status)
room_categories (id, name, capacity, price_per_night)
-- price_per_night depende de category_id.id (sua PK) → 3FN atendida
```

**Benefício prático:** alterar o preço de uma categoria reflete em todas as reservas futuras sem atualizar múltiplos registros em `rooms`.

---

### 2.4 Desnormalizações Intencionais

| Campo | Tabela | Motivo |
|---|---|---|
| `tenant_id` | `payments` | Denormalizado para permitir consultas de receita por tenant sem JOIN com `reservations`. Custo de redundância aceito em troca de performance nas queries financeiras mais frequentes. |
| `total_amount` | `reservations` | Calculado no momento da reserva e armazenado. Protege contra alterações futuras de `price_per_night` que não devem afetar reservas já fechadas — preservação de histórico financeiro. |

---

## 3. Estratégia de Indexação

### Índices criados

| Campo | Tabela | Tipo | Motivo |
|---|---|---|---|
| `(tenant_id, check_in_date)` | `reservations` | B-Tree composto | Busca por calendário de entrada — query mais frequente do painel diário |
| `(tenant_id, status)` | `rooms` | B-Tree composto | Listagem de quartos disponíveis/ocupados por tenant — usada em toda operação de reserva |
| `(tenant_id, email)` | `users` | B-Tree composto | Autenticação: login sempre filtra por tenant + email |
| `reservation_id` | `reservation_rooms` | B-Tree | JOINs da tabela pivô ao listar quartos extras de uma reserva |

### Índices recomendados (adicionar em produção)

| Campo | Tabela | Tipo | Motivo |
|---|---|---|---|
| `(tenant_id, check_out_date)` | `reservations` | B-Tree composto | Filtros por data de saída e relatórios de checkout do dia |
| `(tenant_id, cpf)` | `guests` | B-Tree composto | Busca de hóspede por documento — operação frequente no check-in |
| `(tenant_id, status)` | `reservations` | B-Tree composto | Filtro de reservas ativas (CONFIRMED, CHECKED_IN) para dashboard |

### Justificativa dos índices compostos

Todos os índices principais incluem `tenant_id` como primeira coluna. Em um sistema SaaS, toda query filtra primeiramente pelo tenant do usuário autenticado. Um índice simples em `check_in_date` seria ineficiente pois o PostgreSQL teria que varrer reservas de todos os tenants antes de filtrar. Com `(tenant_id, check_in_date)`, o índice reduz o espaço de busca ao tenant específico antes de aplicar o filtro de data.

---

## 4. Referências de Arquivos

| Artefato | Localização |
|---|---|
| DDL completo (schema oficial) | `db/schema.sql` |
| DDL com constraints extras | `scripts/setup.sql` |
| Dicionário de Dados | `modelagem/dicionario_dados.md` |
| DER (Mermaid) | `modelagem/DER.mmd` |
| Diagrama Lógico | `modelagem/diagrama_logico.md` |
| Queries CRUD | `queries/crud.sql` |
| Consultas avançadas | `queries/consultas_avancadas.sql` |
| Agregações e relatórios | `queries/agregacoes.sql` |
| Seed de dados de teste | `seed/seed_hotels.sql` |
