# Sistema de Gestão de Hotel — Backend API

API REST multi-tenant para gerenciamento hoteleiro, desenvolvida em Node.js (ESModules) com Express, Sequelize (PostgreSQL) e autenticação JWT. Containerizada com Docker (Nginx + Node.js + PostgreSQL) e preparada para orquestração com Kubernetes.

---

## Entidades e Relacionamentos

| Tabela              | Descrição                                          |
|---------------------|----------------------------------------------------|
| `tenants`           | Hotel (cliente SaaS). Raiz de todo o sistema.      |
| `users`             | Usuários do hotel (ADMIN ou RECEPTIONIST)          |
| `room_categories`   | Categorias de quartos (Standard, Luxo, etc.)       |
| `rooms`             | Quartos físicos do hotel                           |
| `guests`            | Hóspedes cadastrados                               |
| `reservations`      | Reservas feitas por hóspedes                       |
| `reservation_rooms` | **Tabela pivô** — relação N:N entre reservas e quartos |
| `payments`          | Pagamentos vinculados a reservas                   |

### Relacionamentos

```
Tenant 1:N Users
Tenant 1:N RoomCategories
Tenant 1:N Rooms
RoomCategory 1:N Rooms
Tenant 1:N Guests
Tenant 1:N Reservations
Guest 1:N Reservations
Room 1:N Reservations (quarto principal)
User 1:N Reservations (responsável)
Reservation N:N Rooms  ← via tabela pivô reservation_rooms
Reservation 1:N Payments
```

### Relação N:N

A entidade **Reservation** possui relação muitos-para-muitos com **Room**, gerenciada pela **tabela pivô `reservation_rooms`**. Uma reserva pode contemplar múltiplos quartos, e o mesmo quarto pode aparecer em diversas reservas (em períodos distintos).

---

## CRUDs Disponíveis

| Recurso           | Rotas                                                 |
|-------------------|-------------------------------------------------------|
| Auth              | `POST /auth/register` · `POST /auth/login`            |
| Usuários          | `GET/POST /users` · `GET/PUT/DELETE /users/:id`       |
| Categorias        | `GET/POST /room-categories` · `GET/PUT/DELETE /room-categories/:id` |
| Quartos           | `GET/POST /rooms` · `GET/PUT/DELETE /rooms/:id`       |
| Hóspedes          | `GET/POST /guests` · `GET/PUT/DELETE /guests/:id`     |
| Reservas          | `GET/POST /reservations` · `GET/PUT/DELETE /reservations/:id` |
| Check-in/out      | `PUT /reservations/:id/check-in` · `PUT /reservations/:id/check-out` |
| Quartos na Reserva (pivô) | `POST /reservations/:id/rooms` · `DELETE /reservations/:id/rooms/:roomId` |

---

## Autenticação JWT

Todas as rotas (exceto `/auth/login` e `/auth/register`) exigem o header:

```
Authorization: Bearer <token>
```

O token é gerado no login com duração de **8 horas** e carrega o payload:

```json
{ "userId": "uuid", "role": "ADMIN|RECEPTIONIST", "tenantId": "uuid" }
```

O middleware `authMiddleware` valida o token em cada requisição e injeta `request.user` com os dados do usuário autenticado. Rotas de exclusão exigem `role: ADMIN`.

---

## Containers Docker

| Serviço    | Imagem            | Porta externa | Rede interna |
|------------|-------------------|---------------|--------------|
| `postgres` | postgres:17       | nenhuma       | `hotel_network` |
| `node_web` | (build local)     | nenhuma       | `hotel_network` |
| `nginx`    | nginx:1.27-alpine | **80:80**     | `hotel_network` |

Fluxo de rede:
```
Cliente → Nginx (porta 80) → node_web:3000 → postgres:5432
```

O container `node_web` **não expõe portas ao host**, acessível apenas via Nginx.

---

## Kubernetes

A pasta `k8s/` contém os manifests para executar a mesma arquitetura no Kubernetes:

| Recurso | Função |
|---------|--------|
| `namespace.yaml` | Isola os recursos no namespace `hotel-system` |
| `configmap.yaml` | Guarda variáveis não sensíveis da aplicação |
| `secret.yaml` | Guarda senha do banco e segredo JWT |
| `postgres.yaml` | Cria PostgreSQL com volume persistente e Service interno |
| `backend.yaml` | Cria 3 réplicas da API Express e Service interno |
| `nginx.yaml` | Cria Nginx como ponto de entrada HTTP |
| `kustomization.yaml` | Aplica todos os manifests em conjunto |

Fluxo no cluster:

```
Cliente → Nginx Service → Backend Service → PostgreSQL Service
```

Aplicação dos manifests:

```bash
docker build -t sistema-gestao-hotel-backend:latest .
kubectl apply -k k8s
kubectl get pods -n hotel-system
```

Mais detalhes em `docs/infra/KUBERNETES.md`.

Para o exercício básico do Lab 9, também há manifests simples em `docker/kubernetes/`:

```bash
kubectl apply -f docker/kubernetes/deployment.yaml
kubectl apply -f docker/kubernetes/service.yaml
```

---

## Bibliotecas Utilizadas

| Biblioteca         | Finalidade                                |
|--------------------|-------------------------------------------|
| `express`          | Framework HTTP                            |
| `sequelize`        | ORM para PostgreSQL                       |
| `pg` / `pg-hstore` | Driver PostgreSQL                         |
| `jsonwebtoken`     | Geração e validação de tokens JWT         |
| `bcryptjs`         | Hash de senhas (10 rounds)                |
| `dotenv`           | Variáveis de ambiente via `.env`          |
| `swagger-ui-express` | Interface visual da documentação Swagger |
| `swagger-jsdoc`    | Geração da spec OpenAPI 3.0               |

---

## Documentação Swagger

Disponível em: **`http://localhost/api-docs`**

Contém todos os endpoints documentados com schemas, exemplos e autenticação JWT configurada.

---

## Como Executar

### Pré-requisitos

- Docker e Docker Compose instalados

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas configurações
```

Variáveis necessárias:

```ini
POSTGRES_DB=gestao_hotel
POSTGRES_USER=hotel_user
POSTGRES_PASSWORD=hotel_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
JWT_SECRET=seu_segredo_jwt_aqui
NODE_WEB_PORT=3000
```

### 2. Subir os containers

```bash
docker compose up --build
```

A API ficará disponível em `http://localhost`.

### 3. Executar migrations

Em outro terminal, com os containers rodando:

```bash
docker compose exec node_web node command.js migrate
```

Ou, para desenvolvimento local (com Node.js instalado):

```bash
node command.js migrate
```

O comando `migrate` usa `sequelize.sync({ alter: true })` para criar/atualizar todas as tabelas automaticamente.

---

## Desenvolvimento Local (sem Docker)

```bash
npm install
node command.js migrate   # cria as tabelas
node _web.js              # inicia o servidor
```

---

## Estrutura do Projeto

```
├── _web.js                  # Entrypoint do servidor Express
├── command.js               # CLI: node command.js migrate
├── Dockerfile               # Multi-stage build Node.js 24 Alpine
├── docker-compose.yml       # 3 serviços: postgres, node_web, nginx
├── k8s/                     # Manifests Kubernetes
├── docker/kubernetes/       # Deployment e Service simples do Lab 9
├── docker/nginx/            # Configuração do Nginx reverse proxy
├── config/swagger.js        # Spec OpenAPI 3.0
├── app/
│   ├── Controllers/         # Lógica de cada rota (CRUD + auth)
│   └── Models/              # Modelos Sequelize (8 tabelas)
├── bootstrap/app.js         # Inicialização dotenv + relações
├── database/
│   ├── connections/         # Singleton Sequelize
│   └── relations.js         # Associações entre modelos
├── middlewares/             # authMiddleware, requireRole
└── routes/                  # Router principal + sub-routers
```
