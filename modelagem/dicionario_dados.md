# Dicionário de Dados
**Sistema:** Sistema de Gestão de Hotel (SaaS Multi-Tenant)
**Banco:** PostgreSQL 17
**Data:** 17/06/2026

---

## Convenções

| Convenção | Significado |
|---|---|
| PK | Chave Primária |
| FK | Chave Estrangeira |
| UK | Unique Key (unicidade) |
| NN | NOT NULL |
| DEFAULT | Valor padrão quando não informado |

---

## Tabela: `tenants`

Representa cada hotel ou pousada cadastrada na plataforma (unidade de isolamento de dados do SaaS).

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único do tenant |
| `name` | TEXT | NN | Nome comercial do hotel/pousada |
| `subdomain` | TEXT | NN, UK | Subdomínio único para identificação na URL (ex: `aurora`) |
| `legal_id` | TEXT | — | CNPJ ou documento fiscal do estabelecimento |
| `status` | TEXT | NN, DEFAULT 'ACTIVE', CHECK IN ('ACTIVE','SUSPENDED') | Estado operacional do tenant na plataforma |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação do registro |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização (gerenciada por trigger) |

**Trigger:** `trg_tenants_updated_at` — atualiza `updated_at` automaticamente em qualquer UPDATE.

---

## Tabela: `users`

Funcionários do hotel com acesso ao sistema. Cada usuário pertence a exatamente um tenant.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único do usuário |
| `tenant_id` | UUID | FK → tenants(id) ON DELETE CASCADE, NN | Tenant ao qual o usuário pertence |
| `name` | TEXT | NN | Nome completo do funcionário |
| `email` | TEXT | NN, UK composto (tenant_id, email) | E-mail de login — único por tenant, pode repetir entre tenants |
| `password_hash` | TEXT | NN | Hash bcrypt da senha (nunca armazenada em texto plano) |
| `role` | TEXT | NN, DEFAULT 'RECEPTIONIST', CHECK IN ('ADMIN','RECEPTIONIST') | Papel do usuário: ADMIN tem acesso total; RECEPTIONIST acesso operacional |
| `deleted_at` | TIMESTAMPTZ | — | Data de exclusão lógica (soft delete). NULL = ativo |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização |

**Índice:** `idx_users_tenant_email (tenant_id, email)` — otimiza autenticação por login.
**Trigger:** `trg_users_updated_at`

---

## Tabela: `room_categories`

Categorias de quarto (ex: Standard, Suite, Luxo) com preço por noite. Separada de `rooms` para evitar redundância (3FN).

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único da categoria |
| `tenant_id` | UUID | FK → tenants(id) ON DELETE CASCADE, NN | Tenant proprietário da categoria |
| `name` | TEXT | NN, UK composto (tenant_id, name) | Nome da categoria — único por tenant |
| `capacity` | INTEGER | NN, DEFAULT 1, CHECK > 0 | Capacidade máxima de hóspedes |
| `price_per_night` | NUMERIC(10,2) | NN, DEFAULT 0, CHECK >= 0 | Preço por diária em reais |
| `deleted_at` | TIMESTAMPTZ | — | Data de exclusão lógica (soft delete) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização |

**Trigger:** `trg_room_categories_updated_at`

---

## Tabela: `rooms`

Quartos físicos do hotel. Cada quarto pertence a uma categoria e tem um status operacional.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único do quarto |
| `tenant_id` | UUID | FK → tenants(id) ON DELETE CASCADE, NN | Tenant proprietário do quarto |
| `category_id` | UUID | FK → room_categories(id) ON DELETE RESTRICT, NN | Categoria do quarto (define preço e capacidade) |
| `number` | TEXT | NN, UK composto (tenant_id, number) | Número ou código do quarto — único por tenant |
| `floor` | INTEGER | — | Andar do quarto (opcional) |
| `status` | TEXT | NN, DEFAULT 'AVAILABLE', CHECK IN ('AVAILABLE','OCCUPIED','MAINTENANCE','CLEANING') | Estado operacional atual do quarto |
| `deleted_at` | TIMESTAMPTZ | — | Data de exclusão lógica (soft delete) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização |

**Máquina de estados:** AVAILABLE → OCCUPIED (check-in) → CLEANING (check-out) → AVAILABLE (limpeza concluída).
**Índice:** `idx_rooms_tenant_status (tenant_id, status)` — otimiza listagem de quartos disponíveis.
**Trigger:** `trg_rooms_updated_at`

---

## Tabela: `guests`

Hóspedes cadastrados no sistema. CPF é opcional para hóspedes estrangeiros.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único do hóspede |
| `tenant_id` | UUID | FK → tenants(id) ON DELETE CASCADE, NN | Tenant ao qual o hóspede está vinculado |
| `full_name` | TEXT | NN | Nome completo do hóspede |
| `cpf` | TEXT | UK composto (tenant_id, cpf) quando não NULL | CPF do hóspede — único por tenant; NULL permitido (estrangeiros) |
| `phone` | TEXT | — | Telefone de contato |
| `email` | TEXT | UK composto (tenant_id, email) quando não NULL | E-mail — único por tenant quando informado |
| `deleted_at` | TIMESTAMPTZ | — | Data de exclusão lógica (soft delete) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização |

**Nota:** CPF de um mesmo hóspede pode ser cadastrado em tenants diferentes (unicidade por tenant, não global).
**Trigger:** `trg_guests_updated_at`

---

## Tabela: `reservations`

Reservas de quartos por hóspedes. É a entidade central do sistema.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único da reserva |
| `tenant_id` | UUID | FK → tenants(id) ON DELETE CASCADE, NN | Tenant proprietário da reserva |
| `guest_id` | UUID | FK → guests(id) ON DELETE RESTRICT, NN | Hóspede que fez a reserva |
| `room_id` | UUID | FK → rooms(id) ON DELETE RESTRICT, NN | Quarto principal da reserva |
| `user_id` | UUID | FK → users(id) ON DELETE RESTRICT, NN | Funcionário que registrou a reserva |
| `check_in_date` | DATE | NN, CHECK check_out_date > check_in_date | Data de entrada |
| `check_out_date` | DATE | NN, CHECK check_out_date > check_in_date | Data de saída |
| `status` | TEXT | NN, DEFAULT 'PENDING', CHECK IN ('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED') | Estado da reserva na máquina de estados |
| `total_amount` | NUMERIC(12,2) | NN, DEFAULT 0, CHECK >= 0 | Valor total calculado no momento da criação (preço × noites) |
| `deleted_at` | TIMESTAMPTZ | — | Data de exclusão lógica (soft delete) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização |

**Constraint especial:** `EXCLUDE USING gist (room_id WITH =, daterange(check_in_date, check_out_date, '[)') WITH &&)` — impede duas reservas ativas no mesmo quarto com datas sobrepostas, a nível de banco de dados.

**Máquina de estados:** PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT. Cancelamento permitido apenas de PENDING ou CONFIRMED.

**Índice:** `idx_reservations_tenant_checkin (tenant_id, check_in_date)` — painel diário de check-ins.
**Trigger:** `trg_reservations_updated_at`

---

## Tabela: `reservation_rooms`

Tabela pivô N:N entre `reservations` e `rooms`. Registra quartos extras adicionados a uma reserva além do quarto principal.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único do vínculo |
| `reservation_id` | UUID | FK → reservations(id) ON DELETE CASCADE, NN | Reserva associada |
| `room_id` | UUID | FK → rooms(id) ON DELETE CASCADE, NN | Quarto extra associado |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização |

**Constraint:** `UNIQUE (reservation_id, room_id)` — impede duplicatas do mesmo quarto na mesma reserva.
**Índice:** `idx_reservation_rooms_res_id (reservation_id)` — otimiza busca de quartos extras por reserva.
**Trigger:** `trg_reservation_rooms_updated`

---

## Tabela: `payments`

Registros de pagamento vinculados a reservas. Permite múltiplos pagamentos por reserva (ex: parcelas, sinal + restante).

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, NN, DEFAULT uuid_generate_v4() | Identificador único do pagamento |
| `tenant_id` | UUID | FK → tenants(id) ON DELETE CASCADE, NN | Tenant (denormalizado para queries financeiras sem JOIN extra) |
| `reservation_id` | UUID | FK → reservations(id) ON DELETE CASCADE, NN | Reserva à qual o pagamento se refere |
| `amount` | NUMERIC(12,2) | NN, CHECK >= 0 | Valor pago |
| `method` | TEXT | NN | Forma de pagamento (ex: PIX, CARTAO, DINHEIRO, TRANSFERENCIA) |
| `paid_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora em que o pagamento foi registrado |
| `deleted_at` | TIMESTAMPTZ | — | Data de exclusão lógica (soft delete) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora de criação |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Data/hora da última atualização |

**Nota de design:** `tenant_id` é denormalizado (pode ser obtido via JOIN com `reservations`). A redundância é intencional: queries de receita por tenant são as mais frequentes nos relatórios financeiros e evitar um JOIN extra reduz latência.
**Trigger:** `trg_payments_updated_at`

---

## Relacionamentos — Resumo

```
tenants 1──────────────────────────────────────────────────N users
tenants 1────────────────────────────────────────────N room_categories
tenants 1──────────────────────────────────────────────────N rooms
tenants 1─────────────────────────────────────────────────N guests
tenants 1──────────────────────────────────────────────N reservations
tenants 1──────────────────────────────────────────────N payments

room_categories 1────────────────────────────────────N rooms
guests 1─────────────────────────────────────────N reservations
rooms 1──────────────────────────────────────────N reservations
users 1──────────────────────────────────────────N reservations
reservations 1───────────────────────────────────N payments
reservations N────────────────────────────────N rooms (via reservation_rooms)
```

---

## Extensões PostgreSQL Utilizadas

| Extensão | Motivo |
|---|---|
| `uuid-ossp` | Geração de UUIDs v4 via `uuid_generate_v4()` nas PKs |
| `btree_gist` | Suporte ao operador `&&` (sobreposição) na `EXCLUDE USING gist` da tabela `reservations` |
