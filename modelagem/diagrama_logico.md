Diagrama lógico (tabelas, chaves primárias e estrangeiras)

- hotels (id PK)
  - id UUID PK
  - name TEXT
  - legal_id TEXT

- users (id PK)
  - id UUID PK
  - hotel_id UUID FK -> hotels(id)
  - name TEXT
  - email TEXT (unique por hotel)

- room_categories (id PK)
  - id UUID PK
  - hotel_id UUID FK -> hotels(id)
  - name TEXT
  - capacity INTEGER
  - price_per_night NUMERIC(10,2)

- rooms (id PK)
  - id UUID PK
  - hotel_id UUID FK -> hotels(id)
  - category_id UUID FK -> room_categories(id)
  - number TEXT (unique por hotel)
  - status TEXT

- guests (id PK)
  - id UUID PK
  - hotel_id UUID FK -> hotels(id)
  - full_name TEXT
  - cpf TEXT (unique por hotel quando informado)

- reservations (id PK)
  - id UUID PK
  - hotel_id UUID FK -> hotels(id)
  - guest_id UUID FK -> guests(id) (nullable para histórico)
  - room_id UUID FK -> rooms(id)
  - user_id UUID FK -> users(id)
  - check_in_date DATE
  - check_out_date DATE
  - total_amount NUMERIC(12,2)

- payments (id PK)
  - id UUID PK
  - reservation_id UUID FK -> reservations(id)
  - amount NUMERIC(12,2)

Índices recomendados:
- reservations(hotel_id, check_in_date) — busca por calendário
- rooms(hotel_id, status) — lista de quartos disponíveis por hotel
- users(hotel_id, email) — autenticação/lookup
- guests(hotel_id, cpf) — busca por documento
